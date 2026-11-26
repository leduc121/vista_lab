#!/usr/bin/env python3
"""Local VISTA Edge Runtime. JSON-lines stdio is private to the Electron parent."""

from __future__ import annotations

import importlib.util
from importlib.metadata import PackageNotFoundError, version as package_version
import json
import logging
import os
import platform
import re
import sys
import threading
import time
import math
from pathlib import Path
from typing import Any, Protocol
try:
    from edge.mujoco_simulation import MuJoCoSimulation
    from edge.calibration import CalibrationWorkflow
    from edge.serial_ownership import SerialPortOwner
    from edge.teleoperation import Teleoperation
    from edge.teleoperation import LIMITS as TELEOP_LIMITS, MAX_VELOCITY as TELEOP_MAX_VELOCITY
    from edge.policy_manager import PolicyManager
    from edge.safety_controller import LocalSafetyController
    from edge.checkik_kinematics import SO101Kinematics, solve_ik
    from edge.mqtt_transport import MqttTransport
except ModuleNotFoundError:
    # Support the documented direct source invocation (`python edge/runtime.py`)
    # as well as package imports and the frozen PyInstaller entry point.
    from mujoco_simulation import MuJoCoSimulation
    from calibration import CalibrationWorkflow
    from serial_ownership import SerialPortOwner
    from teleoperation import Teleoperation
    from teleoperation import LIMITS as TELEOP_LIMITS, MAX_VELOCITY as TELEOP_MAX_VELOCITY
    from policy_manager import PolicyManager
    from safety_controller import LocalSafetyController
    from checkik_kinematics import SO101Kinematics, solve_ik
    from mqtt_transport import MqttTransport

RUNTIME_VERSION = "0.1.0"
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
logger = logging.getLogger("vista.edge")


def normalize_joint_positions(values: Any) -> dict[str, float]:
    """Normalize LeRobot's named SO-101 readings without relying on dict order."""
    if not isinstance(values, dict):
        raise ValueError("LeRobot joint state must be a named mapping.")
    result: dict[str, float] = {}
    for name in JOINTS:
        key = name if name in values else f"{name}.pos"
        if key not in values:
            raise ValueError(f"LeRobot joint state is missing {name}.")
        raw = values[key]
        if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
            raise ValueError(f"LeRobot joint {name} must be finite numeric data.")
        result[name] = float(raw)
    return result


class Adapter(Protocol):
    mode: str

    def status(self) -> dict[str, Any]: ...
    def ports(self) -> list[dict[str, Any]]: ...
    def connect(self, port: str, device_id: str) -> dict[str, Any]: ...
    def disconnect(self) -> dict[str, Any]: ...
    def joint_state(self) -> dict[str, Any]: ...


class SimulatedSO101:
    mode = "SIMULATION"

    def __init__(self) -> None:
        self.connected = True
        self.joints = {name: 0.0 for name in JOINTS}
        self.joints.update(shoulder_lift=-35.0, elbow_flex=70.0, wrist_flex=-35.0, gripper=50.0)

    def status(self) -> dict[str, Any]:
        return {"mode": self.mode, "adapterMode": "mujoco", "connected": self.connected,
                "calibrated": False, "motionEnabled": False}

    def ports(self) -> list[dict[str, Any]]:
        return []

    def connect(self, port: str, device_id: str) -> dict[str, Any]:
        raise RuntimeError("SIMULATION adapter does not open serial devices.")

    def disconnect(self) -> dict[str, Any]:
        self.connected = False
        return self.status()

    def joint_state(self) -> dict[str, Any]:
        return {"mode": self.mode, "measured": False, "timestamp": time.time(), "joints": dict(self.joints)}


class LeRobotSO101Adapter:
    """Single-owner SO-101 LeRobot connection; writes require a safety gate."""

    mode = "PHYSICAL ROBOT READ ONLY"

    def __init__(self, role: str = "follower", slot: str | None = None, *,
                 device_factory: Any = None, port_provider: Any = None,
                 position_limits_rad: dict[str, tuple[float, float]] | None = None,
                 velocity_limits_rad: dict[str, float] | None = None,
                 safe_stop: Any = None) -> None:
        if role not in {"leader", "follower"}:
            raise ValueError("SO-101 role must be leader or follower.")
        self.role = role
        self.slot = slot or role
        self.device_factory = device_factory
        self.port_provider = port_provider
        self.position_limits_rad = position_limits_rad
        self.velocity_limits_rad = velocity_limits_rad
        self.safe_stop_handler = safe_stop
        self.robot = None
        self.port: str | None = None
        self.device_id: str | None = None
        self.calibration_ready = False
        self._serial_owner: SerialPortOwner | None = None
        self.last_error: str | None = None

    def ports(self) -> list[dict[str, Any]]:
        if self.port_provider is not None:
            return list(self.port_provider())
        try:
            from serial.tools import list_ports
        except ImportError as error:
            raise RuntimeError("pyserial is unavailable in this Edge Runtime.") from error
        results = []
        for item in list_ports.comports():
            description = (item.description or "").strip()
            maker = (item.manufacturer or "").strip()
            text = f"{description} {maker}".lower()
            results.append({
                "path": item.device,
                "description": description or "Serial device",
                "manufacturer": maker or None,
                "likelyRobot": any(key in text for key in ("feetech", "waveshare", "robot", "usb serial", "ch340", "cp210")),
                "vid": f"{item.vid:04x}" if item.vid is not None else None,
                "pid": f"{item.pid:04x}" if item.pid is not None else None,
            })
        return results

    def status(self) -> dict[str, Any]:
        try:
            connected = bool(self.robot and self.robot.is_connected)
        except Exception:
            connected = False
        return {
            "mode": self.mode,
            "adapterMode": "so101_follower" if self.role == "follower" else "so101_leader",
            "connected": connected,
            "state": "ERROR" if self.last_error else "CALIBRATED" if connected and self.calibration_ready else "UNCALIBRATED" if connected else "DISCONNECTED",
            "calibrated": self.calibration_ready,
            "calibration": "READY" if self.calibration_ready else "ACTION REQUIRED",
            "motionEnabled": False,
            "port": self.port,
            "deviceId": self.device_id,
            "role": self.role,
            "slot": self.slot,
            "identity": self.device_id,
            "firmware": None,
            "firmwareCompatibility": "UNVERIFIED",
            "error": self.last_error,
        }

    def connect(self, port: str, device_id: str) -> dict[str, Any]:
        if self.robot and self.robot.is_connected:
            raise RuntimeError("Disconnect the currently selected robot before changing ports.")
        known_ports = {row["path"] for row in self.ports()}
        if not isinstance(port, str) or not port or port not in known_ports:
            raise ValueError("Select a currently discovered serial port; ports are never guessed.")
        if not isinstance(device_id, str) or not device_id.strip() or len(device_id) > 64 or any(ord(c) < 32 for c in device_id):
            raise ValueError("Robot ID must contain 1 to 64 printable characters.")
        if self.device_factory is None and importlib.util.find_spec("lerobot") is None:
            raise RuntimeError("LeRobot is unavailable in this Edge Runtime.")
        if self.device_factory is None:
            try:
                installed_lerobot = package_version("lerobot")
            except PackageNotFoundError as error:
                raise RuntimeError("LeRobot package metadata is unavailable; hardware connection is blocked.") from error
            if installed_lerobot not in {"0.6.1", "0.6.2"}:
                raise RuntimeError(f"SO-101 adapter was API-checked for LeRobot 0.6.1/0.6.2; found {installed_lerobot}.")
        owner = SerialPortOwner(port, f"{self.role}-connection").acquire()
        try:
            if self.device_factory is not None:
                candidate = self.device_factory(self.role, port, device_id)
            elif self.role == "leader":
                from lerobot.teleoperators.so_leader import SO101Leader, SO101LeaderConfig

                candidate = SO101Leader(SO101LeaderConfig(port=port, id=device_id, use_degrees=True))
            else:
                from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

                candidate = SO101Follower(SO101FollowerConfig(port=port, id=device_id, use_degrees=True, max_relative_target=1.0))
        except Exception:
            owner.release()
            raise
        # Existing CHECKIK behavior passes calibrate=False to avoid starting a
        # console calibration that can wait indefinitely or alter device state.
        try:
            candidate.connect(calibrate=False)
            self.calibration_ready = bool(candidate.is_calibrated)
        except Exception:
            try:
                if candidate.is_connected:
                    candidate.disconnect()
            except Exception:
                logger.exception("failed SO-101 connection cleanup")
            owner.release()
            raise
        self.robot = candidate
        self.port = port
        self.device_id = device_id
        self._serial_owner = owner
        self.last_error = None
        return self.status()

    def disconnect(self) -> dict[str, Any]:
        robot = self.robot
        try:
            if robot and robot.is_connected:
                robot.disconnect()
        finally:
            self.robot = None
            self.calibration_ready = False
            self.port = self.device_id = None
            if self._serial_owner is not None:
                self._serial_owner.release()
                self._serial_owner = None
        self.last_error = None
        return self.status()

    def joint_state(self) -> dict[str, Any]:
        if not self.robot or not self.robot.is_connected:
            raise RuntimeError("SO-101 is not connected.")
        if not self.calibration_ready:
            raise RuntimeError("Calibration is not verified; joint readings are blocked.")
        try:
            observation = self.robot.get_action() if self.role == "leader" else self.robot.get_observation()
            values = normalize_joint_positions(observation)
        except Exception as error:
            try:
                self.disconnect()
            finally:
                self.last_error = f"SO-101 {self.role} disconnected after read failure: {error}"[:300]
            raise ConnectionError(self.last_error) from error
        return {"mode": self.mode, "measured": True, "timestamp": time.time(), "unit": "deg",
                "jointNames": list(JOINTS), "joints": values, "deviceId": self.device_id, "slot": self.slot}

    def send_action(self, positions_rad: Any, *, authorize: Any, sequence: int,
                    occurred_at: float, hardware_authorized: bool = False) -> dict[str, Any]:
        """Send one follower target only inside the unified safety authority sink."""
        if self.role != "follower":
            raise PermissionError("Leader devices are read-only command sources.")
        if not self.robot or not self.robot.is_connected or not self.calibration_ready:
            raise PermissionError("Connected, calibrated follower required before action.")
        if (not callable(authorize) or self.position_limits_rad is None or self.velocity_limits_rad is None
                or not callable(self.safe_stop_handler)):
            raise PermissionError("Verified position/velocity limits, stop strategy and LocalSafetyController are required.")
        if set(self.position_limits_rad) != set(JOINTS) or set(self.velocity_limits_rad) != set(JOINTS):
            raise PermissionError("Verified hardware limits must cover all six named joints.")
        for name in JOINTS:
            bounds, velocity = self.position_limits_rad[name], self.velocity_limits_rad[name]
            if (not isinstance(bounds, (tuple, list)) or len(bounds) != 2
                    or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in bounds)
                    or bounds[0] >= bounds[1] or isinstance(velocity, bool)
                    or not isinstance(velocity, (int, float)) or not math.isfinite(velocity) or velocity <= 0):
                raise PermissionError(f"Verified hardware limits are invalid for {name}.")
        if not isinstance(positions_rad, (list, tuple)) or len(positions_rad) != 6:
            raise ValueError("SO-101 command must contain exactly six ordered joint values in radians.")
        values = normalize_joint_positions(dict(zip(JOINTS, positions_rad, strict=True)))
        action: dict[str, float] = {}
        for name in JOINTS:
            low, high = self.position_limits_rad[name]
            value = values[name]
            if value < low or value > high:
                raise ValueError(f"Joint {name} exceeds verified hardware limits.")
            action[f"{name}.pos"] = math.degrees(value)
        # LeRobot's SO-101 gripper action uses a 0..100 normalized position.
        low, high = self.position_limits_rad["gripper"]
        action["gripper.pos"] = 100.0 * (values["gripper"] - low) / (high - low)
        if not 0.0 <= action["gripper.pos"] <= 100.0:
            raise ValueError("Gripper target is outside the calibrated range.")
        result: dict[str, Any] = {}
        def sink() -> None:
            result.update(self.robot.send_action(action))
        authorized = authorize(positions_rad=list(values.values()), sequence=sequence,
                               occurred_at=occurred_at, hardware_authorized=hardware_authorized, sink=sink)
        return {"accepted": True, "action": action, "result": result, "safety": authorized}

    def safe_stop(self) -> Any:
        if not callable(self.safe_stop_handler):
            raise RuntimeError("Hardware-specific safe-stop strategy has not been verified.")
        return self.safe_stop_handler(self.robot)


class EdgeRuntime:
    def __init__(self, *, simulated: Adapter | None = None, physical: Adapter | None = None,
                 leader: Adapter | None = None, arms: dict[str, Adapter] | None = None,
                 mqtt_transport_factory: Any = MqttTransport,
                 mqtt_authorizer: Any = None, mqtt_command_executor: Any = None,
                 hardware_authorizer: Any = None, hardware_connect_authorizer: Any = None,
                 allow_local_mqtt_test: bool = False) -> None:
        self.simulated = simulated or SimulatedSO101()
        self.arms: dict[str, LeRobotSO101Adapter | Adapter] = {
            "leader-a": leader or LeRobotSO101Adapter("leader", "leader-a"),
            "follower-a": physical or LeRobotSO101Adapter("follower", "follower-a"),
            "leader-b": LeRobotSO101Adapter("leader", "leader-b"),
            "follower-b": LeRobotSO101Adapter("follower", "follower-b"),
        }
        if arms:
            unknown_slots = set(arms) - set(self.arms)
            if unknown_slots:
                raise ValueError(f"Unsupported SO-101 arm slots: {', '.join(sorted(unknown_slots))}.")
            self.arms.update(arms)
        # Compatibility aliases for existing Phase 1 IPC and tests.
        self.leader = self.arms["leader-a"]
        self.physical = self.arms["follower-a"]
        self.safety = LocalSafetyController(fake_robot=True, hardware_enabled=False)
        self.calibration = CalibrationWorkflow(port_provider=self.physical.ports,
            write_authorizer=lambda operation: self.safety.authorize_hardware_maintenance(confirmed=True))
        self.teleoperation = Teleoperation(action_validator=self._validate_teleop_action)
        self.mujoco = MuJoCoSimulation()
        runtime_root = Path(__file__).resolve().parent
        bundled_urdf = runtime_root / "edge" / "checkik_kinematics" / "so101_new_calib.urdf"
        source_urdf = runtime_root / "checkik_kinematics" / "so101_new_calib.urdf"
        self.checkik_model = SO101Kinematics(bundled_urdf if bundled_urdf.is_file() else source_urdf)
        self.policies = PolicyManager()
        self.active = "SIMULATION"
        self._stop = threading.Event()
        self._mujoco_safety_sequence = 0
        self._hardware_sequences: dict[str, int] = {}
        self._hardware_authorizer = hardware_authorizer or (lambda _slot: False)
        self._hardware_connect_authorizer = hardware_connect_authorizer or (lambda _slot: False)
        self._physical_teleop: dict[str, dict[str, Any]] = {}
        self._mqtt_factory = mqtt_transport_factory
        self._mqtt_authorizer = mqtt_authorizer or (lambda _envelope: False)
        self._mqtt_executor = mqtt_command_executor
        self._allow_local_mqtt_test = allow_local_mqtt_test
        self.mqtt_transport = None
        self._mqtt_config: dict[str, Any] | None = None
        self._mqtt_last_execution: dict[str, Any] | None = None
        self._mqtt_active_run_id: str | None = None
        self._mqtt_last_command_sequence = 0

    def initialize_mqtt(self, config: dict[str, Any]) -> dict[str, Any]:
        allowed = {"host", "thingName", "robotId", "caFile", "certFile", "keyFile", "dedupePath", "port", "topicPrefix", "runtimeKind"}
        if not isinstance(config, dict) or set(config) - allowed:
            raise ValueError("MQTT configuration contains unsupported fields.")
        required = ("host", "thingName", "robotId", "caFile", "certFile", "keyFile", "dedupePath")
        if any(not isinstance(config.get(key), str) or not config[key] for key in required):
            raise ValueError("MQTT endpoint, identity, certificate references and local dedupe path are required.")
        runtime_kind = config.get("runtimeKind", "PHYSICAL_ROBOT")
        if runtime_kind != "PHYSICAL_ROBOT" and not self._allow_local_mqtt_test:
            raise PermissionError("Simulation MQTT is limited to injected local acceptance tests.")
        if self.mqtt_transport is not None:
            self.mqtt_transport.disconnect()
        self._mqtt_config = dict(config)
        self.mqtt_transport = self._mqtt_factory(
            host=config["host"], thing_name=config["thingName"], robot_id=config["robotId"],
            ca_file=config["caFile"], cert_file=config["certFile"], key_file=config["keyFile"],
            authorize=self._mqtt_authorizer,
            safety_ready=lambda: (self.safety.status()["state"] not in {"FAULT", "ESTOPPED", "STOPPING", "DISCONNECTED"}),
            on_command=lambda _payload: False, on_command_envelope=self._execute_mqtt_envelope,
            safety_controller=self.safety, dedupe_path=config["dedupePath"],
            port=config.get("port", 8883), topic_prefix=config.get("topicPrefix", "vista/demo/robots"),
            runtime_kind=runtime_kind, allow_local_test=self._allow_local_mqtt_test,
            shadow_state=self._mqtt_shadow_state,
        )
        return self.mqtt_status()

    def _mqtt_shadow_state(self) -> dict[str, Any]:
        safety = self.safety.status()
        physical = self.arms["follower-a"].status()
        physical_mode = self._mqtt_config is not None and self._mqtt_config.get("runtimeKind") == "PHYSICAL_ROBOT"
        runtime_fault = safety.get("fault") or physical.get("error")
        owners = safety.get("owners") if isinstance(safety.get("owners"), dict) else {}
        executing = any(isinstance(owner, dict) and owner.get("state") == "EXECUTING" for owner in owners.values())
        return {
            "hardwareEnabled": bool(safety.get("hardwareEnabled")) if physical_mode else False,
            "stopped": self._mqtt_active_run_id is None and not executing,
            "activeRunId": self._mqtt_active_run_id,
            "lastCommandSequence": self._mqtt_last_command_sequence,
            "adapterMode": physical.get("adapterMode", "so101_follower") if physical_mode else "mujoco",
            "armed": safety.get("state") in {"ARMED", "EXECUTING"},
            "calibrationReady": (bool(physical.get("calibrated")) and bool(safety.get("physicalCalibrationReady")))
                if physical_mode else bool(safety.get("calibrationReady")),
            "fault": runtime_fault,
        }

    def connect_mqtt(self) -> dict[str, Any]:
        if self.mqtt_transport is None:
            raise RuntimeError("Initialize MQTT configuration before connecting.")
        return self.mqtt_transport.connect()

    def disconnect_mqtt(self) -> dict[str, Any]:
        if self.mqtt_transport is not None:
            self.mqtt_transport.disconnect()
        return self.mqtt_status()

    def mqtt_status(self) -> dict[str, Any]:
        if self.mqtt_transport is None:
            return {"initialized": False, "connected": False, "runtimeKind": None,
                    "productionEnabled": False, "lastExecution": self._mqtt_last_execution}
        return {"initialized": True, **self.mqtt_transport.status(),
                "runtimeKind": self._mqtt_config.get("runtimeKind", "PHYSICAL_ROBOT"),
                "productionEnabled": False if self._allow_local_mqtt_test else os.environ.get("VISTA_IOT_ENABLED") == "true",
                "lastExecution": self._mqtt_last_execution}

    def _execute_mqtt_envelope(self, envelope: dict[str, Any]) -> Any:
        self._mqtt_active_run_id = envelope.get("payload", {}).get("runId")
        self._mqtt_last_command_sequence = envelope.get("sequence", self._mqtt_last_command_sequence)
        if self.mqtt_transport is not None:
            self.mqtt_transport.publish_shadow_state()
        try:
            if self._mqtt_executor is not None:
                result = self._mqtt_executor(envelope, self)
            else:
                if not self._allow_local_mqtt_test or self._mqtt_config.get("runtimeKind") != "SIMULATION":
                    raise PermissionError("Physical MQTT command execution is not commissioned in this runtime.")
                result = self._execute_mqtt_simulation(envelope)
            self._mqtt_last_execution = {"commandId": envelope.get("commandId"), "result": result}
            return result
        finally:
            self._mqtt_active_run_id = None
            if self.mqtt_transport is not None:
                self.mqtt_transport.publish_shadow_state()

    def _execute_mqtt_simulation(self, envelope: dict[str, Any]) -> dict[str, Any]:
        """Execute the existing MQTT lesson allowlist on MuJoCo under its MQTT lease."""
        payload = envelope["payload"]
        run_id = payload["runId"]
        resource = "local-so101-simulation"
        runtime_kind = self._mqtt_config["runtimeKind"]
        frames: list[dict[str, Any]] = []
        command_id = envelope["commandId"]

        def emit_frame(frame: dict[str, Any]) -> None:
            frames.append(frame)
            if self.mqtt_transport is None:
                return
            telemetry = {"schema_version": 1, "robot_id": envelope["robotId"], "source_mode": "SIMULATION",
                         "controller_id": "edge-mqtt-mujoco", "sequence": self.mqtt_transport.last_telemetry_sequence + 1,
                         "measured_at": frame["measured_at"], "connection": "connected", "measured": frame["measured"]}
            self.mqtt_transport.publish_telemetry(telemetry, command_id=command_id)

        self.mujoco.action_guard = self._mujoco_action_guard(
            resource, "MQTT", robot_id=envelope["robotId"], runtime_kind=runtime_kind)
        try:
            result = self.mujoco.execute(
                {"id": envelope["commandId"], "expiresAt": envelope["expiresAtMs"],
                 "speed": 1.0, "steps": payload["program"]["steps"]},
                {"allowed": True, "attemptId": run_id, "expiresAt": envelope["expiresAtMs"]},
                {"id": run_id, "status": "in_progress"}, "RUN_SIMULATION", emit_frame)
        finally:
            self.mujoco.action_guard = None
            if self.mqtt_transport is not None:
                self.mqtt_transport.end_telemetry_run(command_id)
        return result

    def _physical_action(self, slot: str, positions: list[float], sequence: int, occurred_at: float,
                         *, source: str = "manual-control", acquire: bool = True,
                         hardware_authorized: bool = False) -> dict[str, Any]:
        adapter = self.arms.get(slot)
        if not isinstance(adapter, LeRobotSO101Adapter) or adapter.role != "follower":
            raise PermissionError("Physical action requires an assigned LeRobot follower adapter.")
        resource = slot
        if acquire and sequence == 1:
            self.safety.acquire(resource, source, runtime_kind="PHYSICAL_ROBOT",
                robot_id=str(adapter.device_id), calibrated=adapter.calibration_ready,
                hardware_authorized=hardware_authorized, device_role="follower")
        def authorize(*, positions_rad, sequence, occurred_at, hardware_authorized, sink):
            return self.safety.validate_joint_action(resource=resource, source=source,
                robot_id=str(adapter.device_id), joint_names=JOINTS, positions=positions_rad,
                unit="rad", position_limits=adapter.position_limits_rad or {}, sequence=sequence,
                occurred_at=occurred_at, runtime_kind="PHYSICAL_ROBOT",
                calibrated=adapter.calibration_ready, hardware_authorized=hardware_authorized,
                velocity_limits=adapter.velocity_limits_rad, sink=sink)
        try:
            result = adapter.send_action(positions, authorize=authorize, sequence=sequence,
                                         occurred_at=occurred_at, hardware_authorized=hardware_authorized)
            self.safety.finish_action(resource)
            return result
        except Exception:
            self.safety.release(resource, reason="physical_action_rejected")
            raise

    def _physical_teleop_start(self, pair_id: str, confirmed: bool) -> dict[str, Any]:
        if pair_id not in {"pair-a", "pair-b"} or confirmed is not True:
            raise PermissionError("Select a physical pair and explicitly confirm before arming.")
        leader_slot, follower_slot = ("leader-a", "follower-a") if pair_id == "pair-a" else ("leader-b", "follower-b")
        leader, follower = self.arms[leader_slot], self.arms[follower_slot]
        if not leader.status().get("connected") or not follower.status().get("connected"):
            raise ConnectionError("Both assigned physical devices must be connected.")
        if not leader.status().get("calibrated") or not follower.status().get("calibrated"):
            raise PermissionError("Leader and follower calibration must both be valid.")
        if not isinstance(follower, LeRobotSO101Adapter) or follower.position_limits_rad is None or follower.velocity_limits_rad is None or not callable(follower.safe_stop_handler):
            raise PermissionError("Follower hardware limits and safe-stop strategy must be verified.")
        hardware_authorized = self._hardware_authorizer(follower_slot) is True
        self.safety.acquire(follower_slot, "teleoperation", runtime_kind="PHYSICAL_ROBOT",
            robot_id=str(follower.device_id), calibrated=follower.calibration_ready,
            hardware_authorized=hardware_authorized, device_role="follower")
        self.safety.set_continuous(follower_slot, "teleoperation", True)
        self._physical_teleop[pair_id] = {"leader": leader_slot, "follower": follower_slot,
                                          "sequence": 0, "authorized": hardware_authorized}
        return {"pairId": pair_id, "state": "ARMED", "source": "physical leader-follower",
                "hardwareEnabled": self.safety.hardware_enabled, "motionEnabled": False}

    def _physical_teleop_step(self, pair_id: str, *, sequence: Any, occurred_at: Any,
                              deadman: Any) -> dict[str, Any]:
        session = self._physical_teleop.get(pair_id)
        if not session:
            raise PermissionError("Physical teleoperation pair is not armed.")
        if deadman is not True:
            self._physical_teleop_stop(pair_id, "deadman_released")
            return {"state": "STOPPED", "reason": "deadman_released", "motionEnabled": False}
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence != session["sequence"] + 1:
            self._latch_emergency_stop("physical_teleop_sequence_invalid")
            raise ValueError("Teleoperation sequence must increase by one.")
        leader = self.arms[session["leader"]]
        follower = self.arms[session["follower"]]
        try:
            measured = leader.joint_state()["joints"]
        except Exception:
            self._physical_teleop_stop(pair_id, "leader_read_failure")
            self._latch_emergency_stop("physical_teleop_leader_disconnect")
            raise
        positions = []
        for name in JOINTS:
            value = measured[name]
            if name == "gripper":
                if not 0 <= value <= 100:
                    self._physical_teleop_stop(pair_id, "invalid_leader_state")
                    self._latch_emergency_stop("physical_teleop_invalid_leader_state")
                    raise ValueError("Leader gripper must be a calibrated 0–100 LeRobot value.")
                low, high = follower.position_limits_rad[name]
                positions.append(low + (high - low) * value / 100.0)
            else:
                positions.append(math.radians(value))
        if not follower.status().get("connected"):
            self._physical_teleop_stop(pair_id, "device_disconnect")
            self._latch_emergency_stop("physical_teleop_disconnect")
            raise ConnectionError("Follower disconnected; physical teleoperation stopped.")
        try:
            result = self._physical_action(session["follower"], positions, sequence, occurred_at,
                source="teleoperation", acquire=False, hardware_authorized=session["authorized"])
        except Exception:
            self._physical_teleop_stop(pair_id, "command_rejected")
            raise
        session["sequence"] = sequence
        return {"state": "EXECUTING", "pairId": pair_id, "sequence": sequence,
                "jointPositionsRad": positions, "result": result, "motionEnabled": True}

    def _physical_teleop_stop(self, pair_id: str, reason: str = "operator_stop") -> dict[str, Any]:
        session = self._physical_teleop.pop(pair_id, None)
        if session:
            self.safety.release(session["follower"], reason=reason)
        return {"pairId": pair_id, "state": "STOPPED", "reason": reason, "motionEnabled": False}

    def _validate_teleop_action(self, pair_id: str, positions: dict[str, float], sequence: int, timestamp: float,
                                sink: Any) -> None:
        resource = "follower-a" if pair_id == "pair-a" else "follower-b"
        try:
            self.safety.validate_joint_action(resource=resource, source="teleoperation", robot_id=f"local-{resource}",
                joint_names=JOINTS, positions=[positions[name] for name in JOINTS], unit="rad",
                position_limits=TELEOP_LIMITS, sequence=sequence, occurred_at=timestamp,
                runtime_kind="SIMULATION", calibrated=True, velocity_limits=TELEOP_MAX_VELOCITY, sink=sink)
            self.safety.finish_action(resource)
        except PermissionError as error:
            self._latch_emergency_stop(str(error))
            raise

    def _mujoco_action_guard(self, resource: str, source: str, *, robot_id: str | None = None,
                             runtime_kind: str = "SIMULATION"):
        self._mujoco_safety_sequence = 0
        def validate(positions: list[float], limits: dict[str, tuple[float, float]], sink: Any) -> None:
            self._mujoco_safety_sequence += 1
            self.safety.validate_joint_action(resource=resource, source=source, robot_id=robot_id or resource,
                joint_names=JOINTS, positions=positions, unit="rad", position_limits=limits,
                sequence=self._mujoco_safety_sequence, occurred_at=time.time(),
                runtime_kind=runtime_kind, calibrated=True, sink=sink)
            self.safety.finish_action(resource)
        return validate

    def _latch_emergency_stop(self, reason: str) -> dict[str, Any]:
        status = self.safety.emergency_stop(reason)
        self._physical_teleop.clear()
        # Invoke only an adapter-supplied stop operation whose behavior has
        # been explicitly configured; never guess torque-off semantics.
        for slot in ("follower-a", "follower-b"):
            adapter = self.arms.get(slot)
            if adapter and adapter.status().get("connected") and callable(getattr(adapter, "safe_stop", None)):
                try:
                    adapter.safe_stop()
                except Exception:
                    logger.exception("verified hardware stop callback failed for %s", slot)
        self.mujoco.cancel()
        try: self.policies.invalidate_pending()
        except Exception: logger.exception("could not invalidate pending VLA proposal")
        for pair_id in ("pair-a", "pair-b"):
            try:
                if self.teleoperation.status()[pair_id].get("state") != "DISCONNECTED":
                    self.teleoperation.emergency_stop(pair_id)
            except Exception:
                logger.exception("fake E-stop propagation failed for %s", pair_id)
        return status

    def _teleop_snapshot(self) -> dict[str, Any]:
        snapshot = self.teleoperation.status()
        if any(pair.get("state") == "FAULT" for pair in snapshot.values()):
            self._latch_emergency_stop("teleoperation_watchdog_or_input_fault")
            snapshot = self.teleoperation.status()
        return snapshot

    def handle(self, message: dict[str, Any], on_event=None) -> dict[str, Any]:
        request_id = message.get("id")
        method = message.get("method")
        params = message.get("params") or {}
        if not isinstance(request_id, str) or len(request_id) > 80 or not isinstance(params, dict):
            raise ValueError("Request envelope is invalid.")
        self.safety.heartbeat()
        if method == "health":
            return {"version": RUNTIME_VERSION, "python": platform.python_version(), "state": "READY", "mode": self.active,
                    "drivers": {"lerobot": importlib.util.find_spec("lerobot") is not None,
                                "pyserial": importlib.util.find_spec("serial") is not None,
                                "mujoco": importlib.util.find_spec("mujoco") is not None},
                    "simulation": self.mujoco.status()}
        if method == "policy_list":
            return {"items": self.policies.list(), "activePolicyId": self.policies._active}
        if method == "policy_inspect":
            return self.policies.inspect(params.get("repositoryId"), params.get("revision", "main"))
        if method == "policy_import":
            return self.policies.import_model(params.get("repositoryId"), params.get("revision", "main"), progress=on_event)
        if method == "policy_load":
            return self.policies.load(params.get("policyId"), params.get("device", "cpu"))
        if method == "policy_unload":
            return self.policies.unload()
        if method == "policy_stop":
            return self.policies.stop()
        if method == "policy_run":
            if any(pair.get("deadmanHeld") for pair in self.teleoperation.status().values()):
                raise RuntimeError("Policy inference is blocked while motion controls are active.")
            experiment = params.get("experiment") or {}
            if not isinstance(experiment, dict) or set(experiment) - {"experimentId", "attemptId", "episodeId"}:
                raise ValueError("VLA experiment context contains unsupported fields.")
            for key, value in experiment.items():
                if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", value, re.I):
                    raise ValueError(f"VLA {key} must be a UUID.")
            observation = self.mujoco.policy_observation(self.policies.active_input_features())
            resource = "local-so101-simulation"
            self.safety.acquire(resource, "VLA", runtime_kind="SIMULATION", robot_id=resource, calibrated=True, device_role="follower")
            self.mujoco.action_guard = self._mujoco_action_guard(resource, "VLA")
            try:
                def execute_policy(action):
                    return self.mujoco.execute_policy_action(action["jointPositions"], emit=on_event)
                inference = self.policies.run(observation, params.get("prompt", ""), execute=execute_policy,
                                              timeout_ms=25_000, experiment=experiment)
            finally:
                self.mujoco.action_guard = None
                self.safety.release(resource)
            return {"policyId": inference["policyId"], "promptUsed": inference["promptUsed"],
                    "action": inference["action"], "simulation": inference["simulation"], "motionEnabled": False,
                    "providerKind": inference["providerKind"], "model": inference["model"],
                    "experiment": inference["experiment"], "inferenceLatencyMs": inference["inferenceLatencyMs"],
                    "observationSummary": inference["observationSummary"]}
        if method == "status":
            arm_status = {slot: adapter.status() for slot, adapter in self.arms.items()}
            return {"activeMode": self.active, "simulation": self.mujoco.status(), "robotSimulation": self.simulated.status(), "arms": arm_status,
                    "physical": arm_status["follower-a"], "leader": arm_status["leader-a"],
                    "motionEnabled": False, "teleoperation": self._teleop_snapshot(), "safety": self.safety.status()}
        if method == "safety_status":
            return self.safety.status()
        if method == "mqtt_status":
            return self.mqtt_status()
        if method == "mqtt_initialize":
            return self.initialize_mqtt(params)
        if method == "mqtt_connect":
            return self.connect_mqtt()
        if method == "mqtt_disconnect":
            return self.disconnect_mqtt()
        if method == "hardware_action":
            # Not exposed through renderer IPC; kept as the sole runtime-owned
            # hardware send path for future authorized controls.
            if set(params) != {"slot", "positions", "sequence", "occurredAt"}:
                raise ValueError("Hardware action envelope is invalid.")
            slot = params["slot"]
            if slot not in {"follower-a", "follower-b"}:
                raise PermissionError("Only follower arms accept actuator targets.")
            return self._physical_action(slot, params["positions"], params["sequence"], params["occurredAt"])
        if method == "physical_teleop_start":
            return self._physical_teleop_start(params.get("pairId"), params.get("confirmed") is True)
        if method == "physical_teleop_step":
            return self._physical_teleop_step(params.get("pairId"), sequence=params.get("sequence"),
                occurred_at=params.get("occurredAt"), deadman=params.get("deadman"))
        if method == "physical_teleop_stop":
            return self._physical_teleop_stop(params.get("pairId"))
        if method == "cartesian_move":
            if set(params) != {"position"}:
                raise ValueError("Cartesian request contains unsupported fields.")
            target = params.get("position")
            if not isinstance(target, (tuple, list)) or len(target) != 3 or any(
                    isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value))
                    for value in target):
                raise ValueError("Cartesian target must contain three finite coordinates in metres.")
            if any(abs(float(value)) > 1.0 for value in target):
                raise ValueError("Cartesian target is outside the local SO-101 workspace envelope.")
            resource = "local-so101-simulation"
            current = self.mujoco.current_joint_positions()
            solution = solve_ik(self.checkik_model, target, initial_q=current[:5])
            if not solution.success or solution.joint_positions is None:
                raise ValueError(solution.message)
            positions = [float(value) for value in solution.joint_positions] + [current[5]]
            predicted = self.mujoco.predict_end_effector(positions)
            frame_error = math.sqrt(sum((float(actual) - float(expected)) ** 2 for actual, expected in zip(predicted, target, strict=True)))
            if frame_error > 0.02:
                raise ValueError(f"checkIk and MuJoCo base_link frames disagree by {frame_error * 1000:.1f} mm; target was not applied.")
            duration = max(0.35, max(abs(value - start) / TELEOP_MAX_VELOCITY[name]
                                     for name, value, start in zip(JOINTS, positions, current, strict=True)))
            if duration > 5.0:
                raise ValueError("Cartesian target exceeds the bounded local velocity profile.")
            self.safety.acquire(resource, "manual-cartesian", runtime_kind="SIMULATION", robot_id=resource,
                                calibrated=True, device_role="follower")
            self.mujoco.action_guard = self._mujoco_action_guard(resource, "manual-cartesian")
            try:
                result = self.mujoco.execute_joint_targets(positions, on_event, duration)
            finally:
                self.mujoco.action_guard = None
                self.safety.release(resource)
            return {**result, "kinematics": "checkIk SO-101 URDF/FK-verified IK", "jointPositionsRad": positions,
                    "targetPositionM": [float(value) for value in target], "positionErrorM": frame_error}
        if method == "safety_estop":
            return self._latch_emergency_stop("operator")
        if method == "safety_reset":
            if params.get("confirmed") is not True: raise PermissionError("Explicit safety reset confirmation is required.")
            for pair_id in ("pair-a", "pair-b"):
                pair = self.teleoperation.status()[pair_id]
                if pair.get("emergencyStopLatched") and pair.get("connected"):
                    self.teleoperation.reset_estop(pair_id, True)
            return self.safety.reset_emergency_stop(True)
        if method == "teleop_status":
            return self._teleop_snapshot()
        if method == "teleop_configure":
            return self.teleoperation.configure(params.get("pairId"), params.get("leaderPort"), params.get("followerPort"), params.get("confirmed") is True)
        if method == "teleop_enable":
            pair_id = params.get("pairId")
            resource = "follower-a" if pair_id == "pair-a" else "follower-b"
            result = self.teleoperation.enable(pair_id, params.get("confirmed") is True)
            self.safety.acquire(resource, "teleoperation", runtime_kind="SIMULATION", robot_id=f"local-{resource}", calibrated=True, device_role="follower")
            return result
        if method == "teleop_deadman":
            pair_id, held = params.get("pairId"), params.get("held")
            result = self.teleoperation.set_deadman(pair_id, held, params.get("confirmed") is True)
            resource = "follower-a" if pair_id == "pair-a" else "follower-b"
            self.safety.set_continuous(resource, "teleoperation", held is True)
            return result
        if method == "teleop_disable":
            pair_id = params.get("pairId")
            result = self.teleoperation.disable(pair_id)
            self.safety.release("follower-a" if pair_id == "pair-a" else "follower-b")
            return result
        if method == "teleop_step":
            result = self.teleoperation.step(params.get("pairId"), params.get("leader"), params.get("sequence"), params.get("timestamp"), params.get("deadmanHeld"))
            if result.get("status", {}).get("state") == "FAULT":
                result["safety"] = self._latch_emergency_stop("teleoperation_input_or_watchdog_fault")
            return result
        if method == "teleop_estop":
            result = self._latch_emergency_stop("teleoperation")
            pair_id = params.get("pairId")
            return {**self.teleoperation.status().get(pair_id, {}), "safety": result}
        if method == "teleop_reset":
            if params.get("confirmed") is not True: raise PermissionError("Explicit safety reset confirmation is required.")
            for current in ("pair-a", "pair-b"):
                pair = self.teleoperation.status()[current]
                if pair.get("emergencyStopLatched") and pair.get("connected"):
                    self.teleoperation.reset_estop(current, True)
            safety_status = self.safety.reset_emergency_stop(True)
            return {**self.teleoperation.status().get(params.get("pairId"), {}), "safety": safety_status}
        if method == "teleop_disconnect":
            pair_id = params.get("pairId")
            result = self.teleoperation.disconnect(pair_id)
            self.safety.release("follower-a" if pair_id == "pair-a" else "follower-b", reason="disconnected")
            return result
        if method == "simulate":
            resource = "local-so101-simulation"
            self.safety.acquire(resource, "blockly", runtime_kind="SIMULATION", robot_id=resource, calibrated=True, device_role="follower")
            self.mujoco.action_guard = self._mujoco_action_guard(resource, "blockly")
            try:
                return self.mujoco.execute(params.get("command"), params.get("authorization"),
                                           params.get("attempt"), params.get("confirmation"), on_event)
            finally:
                self.mujoco.action_guard = None
                self.safety.release(resource)
        if method == "cancel_simulation":
            self.mujoco.cancel()
            return {"cancelled": True, "motionEnabled": False}
        if method == "pause_simulation":
            self.mujoco.pause()
            return {"paused": True, "motionEnabled": False}
        if method == "resume_simulation":
            self.mujoco.resume()
            return {"paused": False, "motionEnabled": False}
        if method == "load_model":
            candidate = MuJoCoSimulation(params.get("path"))
            if not candidate.available:
                raise ValueError(candidate.error or "Selected MuJoCo model is unavailable.")
            self.mujoco = candidate
            return self.mujoco.status()
        if method == "ports":
            return {"items": self.physical.ports()}
        if method == "connect":
            if self.calibration.status().get("active"):
                raise RuntimeError("Disconnect or stop calibration before connecting a robot.")
            if params.get("mode") != "PHYSICAL ROBOT READ ONLY" or params.get("confirmed") is not True:
                raise PermissionError("Read-only robot connection requires explicit user confirmation.")
            selected_port = params.get("port")
            if not isinstance(selected_port, str) or selected_port not in {row.get("path") for row in self.physical.ports()}:
                raise ValueError("Select a currently discovered serial port; ports are never guessed.")
            role = params.get("role", "follower")
            slot = params.get("slot") or ("leader-a" if role == "leader" else "follower-a" if role == "follower" else None)
            if slot not in self.arms:
                raise ValueError("Select Leader A, Follower A, Leader B, or Follower B explicitly.")
            adapter = self.arms[slot]
            expected_role = "leader" if slot.startswith("leader-") else "follower"
            if expected_role != role:
                raise ValueError("Selected device slot does not match the requested LeRobot role.")
            if any(other.status().get("connected") and other.status().get("port") == selected_port
                   for other_slot, other in self.arms.items() if other_slot != slot):
                raise ValueError("A serial port can be owned by only one robot arm at a time.")
            if isinstance(adapter, LeRobotSO101Adapter) and self._hardware_connect_authorizer(slot) is not True:
                raise PermissionError("Physical LeRobot connection requires separate hardware owner authorization.")
            status = adapter.connect(selected_port, params.get("deviceId"))
            status["slot"] = slot
            self.active = "PHYSICAL ROBOT READ ONLY"
            return status
        if method == "disconnect":
            slot = params.get("slot")
            role = params.get("role")
            if slot is not None:
                if slot not in self.arms:
                    raise ValueError("Select one of the four SO-101 arm slots.")
                was_connected = self.arms[slot].status().get("connected") is True
                result = self.arms[slot].disconnect()
                result["slot"] = slot
                if was_connected: self._latch_emergency_stop(f"serial_disconnect:{slot}")
                if not any(item.status().get("connected") for item in self.arms.values()):
                    self.active = "SIMULATION"
                return result
            if role is None:
                follower_status = {key: self.arms[key].disconnect() for key in ("follower-a", "follower-b")}
                leader_status = {key: self.arms[key].disconnect() for key in ("leader-a", "leader-b")}
                self.active = "SIMULATION"
                return {"follower": follower_status, "leader": leader_status, "motionEnabled": False}
            if role not in {"leader", "follower"}:
                raise ValueError("Select leader or follower explicitly.")
            adapter = self.arms["leader-a" if role == "leader" else "follower-a"]
            status = adapter.disconnect()
            if not any(item.status().get("connected") for item in self.arms.values()):
                self.active = "SIMULATION"
            return status
        if method == "joint_state":
            role = params.get("role", "follower")
            if role not in {"leader", "follower"}:
                raise ValueError("Select leader or follower explicitly.")
            slot = params.get("slot")
            if slot is None:
                slot = "leader-a" if role == "leader" else "follower-a"
            if slot not in self.arms or self.arms[slot].role != role:
                raise ValueError("Select a device slot matching the Leader/Follower role.")
            adapter = self.arms[slot]
            if not adapter.status().get("connected"):
                raise ConnectionError("Selected physical SO-101 arm is disconnected; simulated values are not substituted.")
            try:
                return adapter.joint_state()
            except ConnectionError:
                self._latch_emergency_stop(f"serial_read_failure:{slot}")
                raise
        if method == "calibration_status":
            return self.calibration.status()
        if method == "calibration_profiles":
            return self.calibration.profiles(params.get("role"))
        if method == "calibration_start":
            self.safety.authorize_hardware_maintenance(confirmed=params.get("confirmed") is True)
            if any(item.status().get("connected") for item in self.arms.values()):
                raise RuntimeError("Disconnect all robot arms before starting calibration.")
            params_role = params.get("role")
            params_port = params.get("port")
            if params_role not in {"leader", "follower"}:
                raise ValueError("Select Leader or Follower calibration explicitly.")
            if not isinstance(params.get("profileId"), str) or not params["profileId"].strip():
                raise ValueError("Calibration profile ID must identify this physical arm.")
            return self.calibration.start(params_role, params_port, params.get("profileId"), params.get("confirmed") is True, params.get("slot"))
        if method == "calibration_complete_step":
            return self.calibration.complete_step()
        if method == "calibration_stop":
            return self.calibration.stop()
        if method == "stop":
            self._stop.set()
            stopping = self.safety.begin_stopping("operator")
            self.mujoco.cancel()
            self._latch_emergency_stop("runtime_stop")
            self.policies.stop()
            return {"stopping": True, "safetyState": stopping["state"], "motionEnabled": False}
        raise ValueError("Method is not supported.")

    def close(self) -> None:
        self._stop.set()
        self.safety.begin_stopping("runtime_shutdown")
        try:
            self.disconnect_mqtt()
        except Exception:
            logger.exception("MQTT disconnect failed during shutdown")
        self.mujoco.cancel()
        self._latch_emergency_stop("runtime_shutdown")
        self.safety.disconnect("runtime_shutdown")
        for pair_id in ("pair-a", "pair-b"):
            try:
                self.teleoperation.disconnect(pair_id)
            except Exception:
                logger.exception("fake teleoperation disconnect failed during shutdown")
        try:
            self.calibration.stop()
        except Exception:
            logger.exception("calibration stop failed during shutdown")
        # A failure closing one arm or unloading a policy must not skip the
        # remaining independent serial buses.
        for slot, adapter in self.arms.items():
            try:
                adapter.disconnect()
            except Exception:
                logger.exception("SO-101 %s disconnect failed during shutdown", slot)
        try:
            self.policies.stop()
        except Exception:
            logger.exception("policy stop failed during shutdown")
        try:
            self.policies.unload()
        except Exception:
            logger.exception("policy unload failed during shutdown")


def serve(runtime: EdgeRuntime | None = None, reader=sys.stdin, writer=sys.stdout) -> None:
    runtime = runtime or EdgeRuntime()
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    output_lock = threading.Lock()
    simulation_threads: set[threading.Thread] = set()

    def write(payload: dict[str, Any]) -> None:
        with output_lock:
            writer.write(json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n")
            writer.flush()

    def run_simulation(message: dict[str, Any]) -> None:
        request_id = message.get("id")
        try:
            method = message.get("method")
            event_name = "policy.progress" if method == "policy_import" else "simulation.frame"
            result = runtime.handle(message, on_event=lambda frame: write({"id": request_id, "event": event_name, "data": frame}))
            write({"id": request_id, "ok": True, "result": result})
        except Exception as error:
            logger.warning("simulation request failed: %s", type(error).__name__)
            write({"id": request_id, "ok": False, "error": str(error)[:300]})

    try:
        for line in reader:
            if len(line) > 1_000_000:
                continue
            message: Any = None
            try:
                message = json.loads(line)
                if not isinstance(message, dict):
                    raise ValueError("Request must be a JSON object.")
                request_id = message.get("id")
                if message.get("method") in {"simulate", "policy_import", "policy_run"}:
                    thread = threading.Thread(target=run_simulation, args=(message,), daemon=True)
                    simulation_threads.add(thread)
                    thread.start()
                    continue
                result = runtime.handle(message)
                response = {"id": request_id, "ok": True, "result": result}
            except Exception as error:
                logger.warning("request failed: %s", type(error).__name__)
                response = {"id": message.get("id") if isinstance(message, dict) else None,
                            "ok": False, "error": str(error)[:300]}
            write(response)
            if runtime._stop.is_set():
                break
    finally:
        runtime.mujoco.cancel()
        runtime.close()
        for thread in simulation_threads:
            thread.join(timeout=3)


if __name__ == "__main__":
    serve()
