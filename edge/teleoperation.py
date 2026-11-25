"""Safety-gated, in-memory SO-101 Leader/Follower teleoperation simulation.

This module deliberately has no serial, LeRobot, or physical actuator imports.
Only virtual ``fake://`` ports can be owned by its pair registry.
"""

from __future__ import annotations

import math
import threading
import time
from functools import wraps
from datetime import datetime, timezone
from typing import Callable

JOINTS = (
    "shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"
)
LIMITS = {
    "shoulder_pan": (-1.91986, 1.91986),
    "shoulder_lift": (-1.7453293, 1.7453293),
    "elbow_flex": (-1.69, 1.69),
    "wrist_flex": (-1.658063, 1.658063),
    "wrist_roll": (-2.7438473, 2.8412063),
    "gripper": (-0.174533, 1.7453292),
}
LEADER_TO_FOLLOWER = {name: name for name in JOINTS}
MAX_VELOCITY = {name: (1.0 if name == "gripper" else 1.5) for name in JOINTS}  # rad/s
MAX_INPUT_AGE = 0.150
MIN_COMMAND_INTERVAL = 0.040
PAIR_IDS = ("pair-a", "pair-b")


def _locked(method):
    @wraps(method)
    def call(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)
    return call


def validate_positions(values: object) -> dict[str, float]:
    if not isinstance(values, dict) or set(values) != set(JOINTS):
        raise ValueError("Leader input must contain exactly the six SO-101 joints.")
    result: dict[str, float] = {}
    for name in JOINTS:
        value = values[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"Leader input for {name} must be a finite number in radians.")
        lower, upper = LIMITS[name]
        if value < lower or value > upper:
            raise ValueError(f"Leader input for {name} exceeds the SO-101 joint limits.")
        result[name] = float(value)
    return result


class FakeLeaderInput:
    def __init__(self) -> None:
        self.connected = True
        self.positions = {name: 0.0 for name in JOINTS}

    def read(self, values: object) -> dict[str, float]:
        if not self.connected:
            raise ConnectionError("Fake Leader disconnected.")
        self.positions = validate_positions(values)
        return dict(self.positions)


class FakeFollowerOutput:
    """Testable command sink. This object cannot address physical hardware."""

    def __init__(self) -> None:
        self.connected = True
        self.positions = {name: 0.0 for name in JOINTS}
        self.commands: list[dict[str, float]] = []

    def apply(self, positions: dict[str, float]) -> None:
        if not self.connected:
            raise ConnectionError("Fake Follower disconnected.")
        command = validate_positions(positions)
        self.positions = command
        self.commands.append(dict(command))

    def stop(self) -> None:
        # A simulator stop is a gate close; it never sends a physical hold/torque command.
        self.connected = False


class PairTeleoperation:
    def __init__(self, pair_id: str, monotonic: Callable[[], float], wall_clock: Callable[[], float],
                 action_validator: Callable[[str, dict[str, float], int, float, Callable[[], None]], None] | None = None):
        self.pair_id = pair_id
        self.monotonic = monotonic
        self.wall_clock = wall_clock
        self.action_validator = action_validator
        self._use_timer = monotonic is time.monotonic
        self._lock = threading.RLock()
        self._watchdog: threading.Timer | None = None
        self.leader: FakeLeaderInput | None = None
        self.follower: FakeFollowerOutput | None = None
        self.ports: tuple[str, str] | None = None
        self.enabled = False
        self.deadman = False
        self.estop_latched = False
        self.state = "DISCONNECTED"
        self.fault: str | None = None
        self.sequence = -1
        self.input_at: float | None = None
        self.deadman_at: float | None = None
        self.last_command_at: float | None = None
        self.last_feedback = {name: 0.0 for name in JOINTS}
        self.command_count = 0

    @property
    def connected(self) -> bool:
        return bool(self.leader and self.leader.connected and self.follower and self.follower.connected)

    @_locked
    def configure(self, leader_port: str, follower_port: str, confirmed: bool) -> dict:
        if self.state != "DISCONNECTED":
            raise RuntimeError("Disconnect this simulated pair before reconnecting it.")
        if confirmed is not True:
            raise PermissionError("Connecting fake devices requires explicit operator confirmation.")
        if not all(isinstance(port, str) and port.startswith(f"fake://{self.pair_id}/") for port in (leader_port, follower_port)):
            raise ValueError("Teleoperation accepts only this pair's fake:// virtual device ports.")
        if leader_port == follower_port:
            raise ValueError("Leader and Follower must own different virtual ports.")
        self.ports = (leader_port, follower_port)
        self.leader = FakeLeaderInput()
        self.follower = FakeFollowerOutput()
        self.enabled = False
        self.deadman = False
        self.estop_latched = False
        self.state = "DISABLED"
        self.fault = None
        self.sequence = -1
        self.input_at = None
        self.deadman_at = None
        self.last_command_at = None
        self.last_feedback = {name: 0.0 for name in JOINTS}
        self.command_count = 0
        return self.status()

    @_locked
    def enable(self, confirmed: bool) -> dict:
        if confirmed is not True:
            raise PermissionError("Operator enable requires explicit confirmation.")
        if not self.connected:
            self._fault("connection_lost")
            raise ConnectionError("Both fake devices must be connected before enabling.")
        if self.state == "FAULT":
            raise RuntimeError("Disconnect and reconnect a faulted pair before re-arming.")
        if self.estop_latched:
            raise PermissionError("Reset the emergency stop explicitly before enabling.")
        self.enabled = True
        self.deadman = False
        self.state = "ARMED"
        self.fault = None
        return self.status()

    @_locked
    def set_deadman(self, held: bool, confirmed: bool) -> dict:
        if confirmed is not True:
            raise PermissionError("Deadman state must come from an explicit operator action.")
        if not isinstance(held, bool):
            raise ValueError("Deadman state must be boolean.")
        if held:
            if not self.enabled or not self.connected or self.estop_latched or self.state not in {"ARMED", "ACTIVE"}:
                raise PermissionError("Pair is not safely armed for a held deadman.")
            self.deadman = True
            self.deadman_at = self.monotonic()
            self._schedule_watchdog()
        else:
            self.deadman = False
            self.deadman_at = None
            self._cancel_watchdog()
            if self.enabled and not self.estop_latched and self.connected:
                self.state = "ARMED"
        return self.status()

    @_locked
    def disable(self) -> dict:
        if self.estop_latched:
            raise PermissionError("Reset the emergency stop before disabling/re-arming this pair.")
        if self.state == "FAULT":
            raise RuntimeError("Disconnect and reconnect a faulted pair before re-arming.")
        self.deadman = False
        self.deadman_at = None
        self.enabled = False
        self._cancel_watchdog()
        self.state = "DISABLED" if self.connected else "DISCONNECTED"
        return self.status()

    @_locked
    def step(self, positions: object, sequence: int, timestamp: float, deadman_held: bool) -> dict:
        if not self.connected:
            self._fault("connection_lost")
            return self._rejected("connection_lost")
        if self.estop_latched:
            return self._rejected("estop_latched")
        if not self.enabled:
            return self._rejected("not_armed")
        if not self.deadman or deadman_held is not True:
            return self._rejected("deadman_released")
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence <= self.sequence:
            self._fault("stale_sequence")
            return self._rejected("stale_sequence")
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp):
            self._fault("invalid_timestamp")
            return self._rejected("invalid_timestamp")
        now_mono = self.monotonic()
        wall_age = self.wall_clock() - float(timestamp)
        if wall_age < -0.050 or wall_age > MAX_INPUT_AGE:
            self._fault("stale_input")
            return self._rejected("stale_input")
        try:
            leader = self.leader.read(positions)  # type: ignore[union-attr]
        except (ValueError, ConnectionError) as error:
            self._fault("invalid_input" if isinstance(error, ValueError) else "connection_lost")
            return self._rejected(self.fault or "invalid_input")
        self.sequence = sequence
        self.input_at = now_mono
        if self.last_command_at is not None:
            elapsed = now_mono - self.last_command_at
            if elapsed < MIN_COMMAND_INTERVAL:
                return self._rejected("rate_limited")
        else:
            elapsed = MIN_COMMAND_INTERVAL

        mapped = self._map(leader)
        for name in JOINTS:
            allowed = MAX_VELOCITY[name] * elapsed + 1e-9
            if abs(mapped[name] - self.last_feedback[name]) > allowed:
                self._fault("velocity_limit")
                return self._rejected("velocity_limit")
        try:
            if self.action_validator:
                self.action_validator(self.pair_id, mapped, sequence, float(timestamp),
                                      lambda: self.follower.apply(mapped))  # type: ignore[union-attr]
            else:
                self.follower.apply(mapped)  # type: ignore[union-attr]
        except PermissionError as error:
            return self._rejected(str(error))
        except (ValueError, ConnectionError):
            self._fault("connection_lost")
            return self._rejected("connection_lost")
        self.last_feedback = dict(mapped)
        self.last_command_at = now_mono
        self.deadman_at = now_mono
        self.command_count += 1
        self.state = "ACTIVE"
        self._schedule_watchdog()
        return {"accepted": True, "reason": None, "status": self.status(), "frame": self.frame()}

    @staticmethod
    def _map(leader: dict[str, float]) -> dict[str, float]:
        mapped = {}
        for source, target in LEADER_TO_FOLLOWER.items():
            source_low, source_high = LIMITS[source]
            target_low, target_high = LIMITS[target]
            normalized = (leader[source] - source_low) / (source_high - source_low)
            mapped[target] = target_low + normalized * (target_high - target_low)
        return validate_positions(mapped)

    @_locked
    def emergency_stop(self) -> dict:
        self.deadman = False
        self.enabled = False
        self.estop_latched = True
        self.state = "STOPPED"
        self.fault = "emergency_stop"
        self._cancel_watchdog()
        return self.status()

    @_locked
    def reset_estop(self, confirmed: bool) -> dict:
        if confirmed is not True:
            raise PermissionError("Emergency-stop reset requires explicit operator confirmation.")
        if not self.estop_latched or not self.connected:
            raise RuntimeError("A connected, stopped pair is required to reset the emergency stop.")
        if self.deadman:
            raise PermissionError("Release the deadman before resetting the emergency stop.")
        self.estop_latched = False
        self.enabled = False
        self.state = "DISABLED"
        self.fault = None
        self.last_command_at = None
        return self.status()

    @_locked
    def disconnect(self) -> dict:
        self.deadman = False
        self.enabled = False
        self._cancel_watchdog()
        if self.leader:
            self.leader.connected = False
        if self.follower:
            self.follower.stop()
        self.state = "DISCONNECTED"
        self.fault = "disconnected"
        self.ports = None
        return self.status()

    @_locked
    def _fault(self, reason: str) -> None:
        self.deadman = False
        self.enabled = False
        self.state = "FAULT"
        self.fault = reason
        self._cancel_watchdog()

    def _schedule_watchdog(self) -> None:
        self._cancel_watchdog()
        if not self._use_timer:
            return
        timer = threading.Timer(MAX_INPUT_AGE, self._watchdog_expired)
        timer.daemon = True
        self._watchdog = timer
        timer.start()

    def _cancel_watchdog(self) -> None:
        timer, self._watchdog = self._watchdog, None
        if timer is not None:
            timer.cancel()

    @_locked
    def _watchdog_expired(self) -> None:
        if not self.deadman or not self.enabled or self.deadman_at is None:
            return
        remaining = MAX_INPUT_AGE - (self.monotonic() - self.deadman_at)
        if remaining > 0:
            timer = threading.Timer(remaining, self._watchdog_expired)
            timer.daemon = True
            self._watchdog = timer
            timer.start()
            return
        self._fault("deadman_timeout")

    @_locked
    def check_watchdog(self) -> dict:
        """Deterministic watchdog hook used by status polling and tests."""
        if self.deadman and self.enabled and self.deadman_at is not None and self.monotonic() - self.deadman_at >= MAX_INPUT_AGE:
            self._fault("deadman_timeout")
        return self.status()

    def _rejected(self, reason: str) -> dict:
        return {"accepted": False, "reason": reason, "status": self.status(), "frame": self.frame() if self.connected else None}

    def frame(self) -> dict:
        return {
            "schema_version": 1,
            "robot_id": f"local-so101-{self.pair_id}",
            "source_mode": "SIMULATION",
            "controller_id": f"fake-teleop-{self.pair_id}",
            "sequence": max(0, self.sequence),
            "connection": "connected" if self.connected else "disconnected",
            "calibration_status": "NOT_APPLICABLE",
            "measured_at": datetime.fromtimestamp(self.wall_clock(), tz=timezone.utc).isoformat().replace("+00:00", "Z"),
            "measured": [{"name": name, "position": self.last_feedback[name], "unit": "rad"} for name in JOINTS],
            "calibrated": None,
        }

    @_locked
    def status(self) -> dict:
        return {
            "pairId": self.pair_id,
            "mode": "FAKE SIMULATION ONLY",
            "state": self.state,
            "connected": self.connected,
            "enabled": self.enabled,
            "deadmanHeld": self.deadman,
            "emergencyStopLatched": self.estop_latched,
            "fault": self.fault,
            "ports": list(self.ports) if self.ports else None,
            "commandCount": self.command_count,
            "feedback": dict(self.last_feedback),
            "physicalOutputEnabled": False,
        }


class Teleoperation:
    """Pair registry and exclusive ownership of virtual fake-device ports."""

    def __init__(self, monotonic: Callable[[], float] = time.monotonic, wall_clock: Callable[[], float] = time.time,
                 action_validator: Callable[[str, dict[str, float], int, float, Callable[[], None]], None] | None = None):
        self.monotonic = monotonic
        self.wall_clock = wall_clock
        self.pairs = {pair_id: PairTeleoperation(pair_id, monotonic, wall_clock, action_validator) for pair_id in PAIR_IDS}
        self.port_owners: dict[str, str] = {}

    def _pair(self, pair_id: object) -> PairTeleoperation:
        if not isinstance(pair_id, str) or pair_id not in self.pairs:
            raise ValueError("Select one of the two supported simulation pairs.")
        return self.pairs[pair_id]

    def configure(self, pair_id: object, leader_port: str, follower_port: str, confirmed: bool) -> dict:
        pair = self._pair(pair_id)
        if pair.state != "DISCONNECTED":
            raise RuntimeError("Disconnect this simulated pair before reconnecting it.")
        if leader_port == follower_port:
            raise ValueError("Leader and Follower cannot own the same virtual port.")
        for port in (leader_port, follower_port):
            if port in self.port_owners:
                raise ValueError("That fake device port is already owned by another pair.")
        result = pair.configure(leader_port, follower_port, confirmed)
        for port in pair.ports or ():
            self.port_owners[port] = pair.pair_id
        return result

    def disconnect(self, pair_id: object) -> dict:
        pair = self._pair(pair_id)
        ports = pair.ports or ()
        result = pair.disconnect()
        for port in ports:
            if self.port_owners.get(port) == pair.pair_id:
                del self.port_owners[port]
        return result

    def enable(self, pair_id: object, confirmed: bool) -> dict:
        return self._pair(pair_id).enable(confirmed)

    def set_deadman(self, pair_id: object, held: bool, confirmed: bool) -> dict:
        return self._pair(pair_id).set_deadman(held, confirmed)

    def disable(self, pair_id: object) -> dict:
        return self._pair(pair_id).disable()

    def step(self, pair_id: object, positions: object, sequence: int, timestamp: float, deadman_held: bool) -> dict:
        return self._pair(pair_id).step(positions, sequence, timestamp, deadman_held)

    def emergency_stop(self, pair_id: object) -> dict:
        return self._pair(pair_id).emergency_stop()

    def reset_estop(self, pair_id: object, confirmed: bool) -> dict:
        return self._pair(pair_id).reset_estop(confirmed)

    def status(self) -> dict:
        return {pair_id: pair.check_watchdog() for pair_id, pair in self.pairs.items()}
