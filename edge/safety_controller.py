"""Single fail-closed action authority for local Edge Runtime sources."""
from __future__ import annotations

import math
import threading
import time
from typing import Any, Callable

JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")


class LocalSafetyController:
    """Arbitrates action ownership and validates every joint action before its sink.

    Physical execution is deliberately unavailable until a verified adapter, calibration,
    hardware authorization and explicit operator arm are all supplied by the runtime.
    """
    def __init__(self, *, fake_robot: bool = True, hardware_enabled: bool = False,
                 clock: Callable[[], float] = time.monotonic, watchdog_seconds: float = .25,
                 calibration_ready: bool = True, heartbeat_timeout: float = 2.0):
        self.fake_robot = fake_robot
        self.hardware_enabled = hardware_enabled
        self.clock = clock
        self.watchdog_seconds = watchdog_seconds
        self.heartbeat_timeout = heartbeat_timeout
        self._lock = threading.RLock()
        self._leases: dict[str, dict[str, Any]] = {}
        self._last_values: dict[str, dict[str, float]] = {}
        self._sequences: dict[str, int] = {}
        self._estop = False
        self._fault: str | None = None
        self._last_rejection: str | None = None
        self._last_event = "Runtime initialized fail-closed"
        self._last_event_at = time.time()
        self._runtime_connected = True
        self._heartbeat_at = self.clock()
        self._stopping = False
        self._calibration_ready = calibration_ready  # Virtual model readiness only.
        self._physical_calibration_ready = False

    def _event(self, text: str) -> None:
        self._last_event, self._last_event_at = text, time.time()

    def _reject(self, reason: str) -> None:
        self._last_rejection = reason
        self._event(f"Rejected action: {reason}")
        raise PermissionError(reason)

    def heartbeat(self) -> None:
        with self._lock:
            self._heartbeat_at = self.clock()

    def acquire(self, resource: str, source: str, *, runtime_kind: str = "SIMULATION",
                robot_id: str = "local-so101-simulation", calibrated: bool = True,
                hardware_authorized: bool = False, device_role: str = "follower") -> dict[str, Any]:
        with self._lock:
            self._watchdog_locked()
            if self._estop: self._reject("estop_latched")
            if self._fault: self._reject("runtime_fault_latched")
            if self._stopping or not self._runtime_connected: self._reject("runtime_stopping_or_disconnected")
            if not isinstance(resource, str) or not resource or not isinstance(source, str) or not source:
                self._reject("invalid_execution_identity")
            if not isinstance(robot_id, str) or not robot_id or device_role not in {"leader", "follower"}:
                self._reject("invalid_device_identity_or_role")
            if runtime_kind == "PHYSICAL_ROBOT" and device_role != "follower":
                self._reject("physical_action_requires_follower_role")
            if runtime_kind not in {"SIMULATION", "MOCK_RUNTIME"}:
                if runtime_kind == "PHYSICAL_ROBOT":
                    if not self.hardware_enabled: self._reject("hardware_disabled")
                    if not hardware_authorized: self._reject("hardware_not_authorized")
                    if not calibrated or not self._physical_calibration_ready: self._reject("calibration_required")
                else: self._reject("runtime_mode_unverified")
            elif not calibrated or not self._calibration_ready:
                self._reject("calibration_required")
            previous = self._leases.get(resource)
            if previous and previous["source"] != source:
                self._reject("execution_owned_by_another_source")
            if previous:
                self._reject("execution_already_active")
            self._leases[resource] = {"source": source, "robotId": robot_id, "deviceRole": device_role, "runtimeKind": runtime_kind,
                                      "startedAt": self.clock(), "lastCommandAt": self.clock(), "state": "ARMED", "continuous": False}
            self._event(f"{source} armed {resource} ({runtime_kind})")
            return dict(self._leases[resource])

    def validate_joint_action(self, *, resource: str, source: str, robot_id: str,
                              joint_names: Any, positions: Any, unit: str,
                              position_limits: dict[str, tuple[float, float]], sequence: Any,
                              occurred_at: Any, runtime_kind: str = "SIMULATION",
                              calibrated: bool = True, hardware_authorized: bool = False,
                              velocity_limits: dict[str, float] | None = None,
                              device_role: str = "follower", sink: Callable[[], Any] | None = None) -> dict[str, float]:
        with self._lock:
            self._watchdog_locked()
            if self._estop: self._reject("estop_latched")
            if self._stopping or not self._runtime_connected: self._reject("runtime_stopping_or_disconnected")
            lease = self._leases.get(resource)
            if not lease or lease["source"] != source: self._reject("execution_not_owned")
            if lease["robotId"] != robot_id: self._reject("robot_identity_mismatch")
            if lease["deviceRole"] != device_role: self._reject("device_role_mismatch")
            if lease["runtimeKind"] != runtime_kind: self._reject("runtime_mode_mismatch")
            if runtime_kind == "PHYSICAL_ROBOT":
                if not self.hardware_enabled: self._reject("hardware_disabled")
                if not hardware_authorized: self._reject("hardware_not_authorized")
                if not calibrated or not self._physical_calibration_ready: self._reject("calibration_required")
            elif runtime_kind not in {"SIMULATION", "MOCK_RUNTIME"}:
                self._reject("runtime_mode_unverified")
            if not calibrated: self._reject("calibration_required")
            if unit != "rad": self._reject("joint_unit_must_be_rad")
            if not isinstance(joint_names, (tuple, list)) or tuple(joint_names) != JOINTS:
                self._reject("joint_order_invalid")
            if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence <= self._sequences.get(resource, -1):
                self._reject("stale_or_duplicate_sequence")
            now = self.clock()
            if isinstance(occurred_at, bool) or not isinstance(occurred_at, (int, float)) or not math.isfinite(occurred_at):
                self._reject("invalid_command_timestamp")
            age = time.time() - float(occurred_at) if occurred_at > 10_000_000 else now - float(occurred_at)
            if age < -.05 or age > self.watchdog_seconds: self._reject("stale_command")
            if not isinstance(positions, (tuple, list)) or len(positions) != len(JOINTS): self._reject("joint_values_missing")
            if not isinstance(position_limits, dict) or set(position_limits) != set(JOINTS): self._reject("verified_position_limits_missing")
            values: dict[str, float] = {}
            for name, raw in zip(JOINTS, positions, strict=True):
                if isinstance(raw, bool) or not isinstance(raw, (float, int)) or not math.isfinite(raw):
                    self._reject(f"invalid_joint_value:{name}")
                bounds = position_limits[name]
                if (not isinstance(bounds, (tuple, list)) or len(bounds) != 2
                        or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in bounds)):
                    self._reject("invalid_verified_position_limits")
                low, high = bounds
                if not low < high: self._reject("invalid_verified_position_limits")
                if raw < low or raw > high: self._reject(f"position_limit:{name}")
                values[name] = float(raw)
            previous = self._last_values.get(resource)
            elapsed = max(.001, now - lease["lastCommandAt"])
            if previous is not None and velocity_limits is not None:
                if not isinstance(velocity_limits, dict) or set(velocity_limits) != set(JOINTS): self._reject("verified_velocity_limits_missing")
                for name in JOINTS:
                    vmax = velocity_limits[name]
                    if isinstance(vmax, bool) or not isinstance(vmax, (int, float)) or not math.isfinite(vmax) or vmax <= 0: self._reject("invalid_verified_velocity_limits")
                    if abs(values[name] - previous[name]) / elapsed > vmax + 1e-8:
                        self._reject(f"velocity_limit:{name}")
            self._sequences[resource] = sequence
            self._last_values[resource] = values
            lease["lastCommandAt"] = now
            lease["state"] = "EXECUTING"
            self._event(f"{source} action accepted on {resource}")
            if sink is not None:
                try:
                    sink()
                except Exception:
                    self._fault = "action_sink_failed"
                    self._leases.clear()
                    self._last_values.clear()
                    self._sequences.clear()
                    self._event(f"Action sink failed on {resource}")
                    raise
            return values

    def finish_action(self, resource: str) -> None:
        with self._lock:
            lease = self._leases.get(resource)
            if lease: lease["state"] = "EXECUTING" if lease.get("continuous") else "ARMED"

    def set_continuous(self, resource: str, source: str, active: bool) -> None:
        with self._lock:
            lease = self._leases.get(resource)
            if not lease or lease["source"] != source:
                if active: self._reject("execution_not_owned")
                return
            lease["continuous"] = active
            lease["state"] = "EXECUTING" if active else "ARMED"
            if active: lease["lastCommandAt"] = self.clock()
            self._event(f"{source} {'active' if active else 'paused'} on {resource}")

    def release(self, resource: str, *, reason: str = "released") -> None:
        with self._lock:
            lease = self._leases.pop(resource, None)
            self._last_values.pop(resource, None)
            self._sequences.pop(resource, None)
            if lease: self._event(f"{lease['source']} {reason} on {resource}")

    def emergency_stop(self, reason: str = "operator") -> dict[str, Any]:
        with self._lock:
            self._estop = True
            self._leases.clear()
            self._last_values.clear()
            self._sequences.clear()
            self._fault = "emergency_stop"
            self._event(f"Emergency stop latched ({reason})")
            return self.status()

    def reset_emergency_stop(self, confirmed: bool) -> dict[str, Any]:
        with self._lock:
            if confirmed is not True: self._reject("explicit_estop_reset_required")
            if not self._estop: self._reject("estop_not_latched")
            if not self._runtime_connected: self._reject("runtime_disconnected")
            self._estop = False
            self._fault = None
            self._event("Emergency stop explicitly reset; runtime remains DISCONNECTED/UNARMED")
            return self.status()

    def disconnect(self, reason: str = "connection_lost") -> None:
        with self._lock:
            self._runtime_connected = False
            self._leases.clear()
            self._last_values.clear()
            self._sequences.clear()
            self._fault = reason
            self._event(f"Runtime stopped: {reason}")

    def begin_stopping(self, reason: str = "operator") -> dict[str, Any]:
        with self._lock:
            self._stopping = True
            self._leases.clear()
            self._last_values.clear()
            self._sequences.clear()
            self._event(f"Runtime stopping: {reason}")
            return self.status()

    def reconnect(self) -> None:
        with self._lock:
            self._runtime_connected = True
            self._event("Runtime reconnected; explicit arm required")

    def mqtt_ready(self) -> bool:
        with self._lock:
            self._watchdog_locked()
            return bool(self.hardware_enabled and not self.fake_robot and self._physical_calibration_ready
                        and self._runtime_connected and not self._estop and not self._fault)

    def authorize_hardware_maintenance(self, *, confirmed: bool) -> None:
        with self._lock:
            if self._estop: self._reject("estop_latched")
            if confirmed is not True: self._reject("explicit_hardware_confirmation_required")
            if self.fake_robot or not self.hardware_enabled: self._reject("hardware_disabled")
            if self._leases: self._reject("execution_active")
            if self._stopping or not self._runtime_connected: self._reject("runtime_stopping_or_disconnected")
            # Calibration is the process that establishes readiness; requiring
            # readiness here would make a first calibration impossible.
            self._event("Authorized hardware maintenance session")

    def _watchdog_locked(self) -> None:
        now = self.clock()
        if self._leases and now - self._heartbeat_at > self.heartbeat_timeout:
            self._leases.clear()
            self._last_values.clear()
            self._sequences.clear()
            self._fault = "runtime_heartbeat_timeout"
            self._event("Runtime heartbeat expired; all action leases cleared")
        expired = [resource for resource, lease in self._leases.items()
                   if lease["state"] == "EXECUTING" and now - lease["lastCommandAt"] > self.watchdog_seconds]
        for resource in expired:
            self._leases.pop(resource, None)
            self._last_values.pop(resource, None)
            self._sequences.pop(resource, None)
            self._fault = "command_watchdog_timeout"
            self._event(f"Command watchdog expired on {resource}")

    def status(self) -> dict[str, Any]:
        with self._lock:
            self._watchdog_locked()
            if self._estop: state = "ESTOPPED"
            elif not self._runtime_connected: state = "DISCONNECTED"
            elif self._fault: state = "FAULT"
            elif self._stopping: state = "STOPPING"
            elif self._leases: state = "EXECUTING" if any(x["state"] == "EXECUTING" for x in self._leases.values()) else "ARMED"
            elif self._calibration_ready: state = "READY"
            else: state = "UNCALIBRATED"
            sources = sorted({x["source"] for x in self._leases.values()})
            return {"state": state, "activeControlSource": sources[0] if len(sources) == 1 else sources or None,
                    "owners": {key: {"source": value["source"], "robotId": value["robotId"], "deviceRole": value["deviceRole"], "state": value["state"]}
                               for key, value in self._leases.items()},
                    "hardwareEnabled": self.hardware_enabled, "fakeRobot": self.fake_robot,
                    "calibrationReady": self._calibration_ready, "physicalCalibrationReady": self._physical_calibration_ready,
                    "emergencyStopLatched": self._estop,
                    "watchdog": "FAULT" if self._fault in {"command_watchdog_timeout", "runtime_heartbeat_timeout"} else "ARMED" if self._leases else "IDLE",
                    "runtimeHeartbeatAt": self._heartbeat_at, "fault": self._fault, "lastRejectedCommand": self._last_rejection,
                    "lastEvent": self._last_event, "lastEventAt": self._last_event_at}
