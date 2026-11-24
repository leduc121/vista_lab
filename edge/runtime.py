#!/usr/bin/env python3
"""Local VISTA Edge Runtime. JSON-lines stdio is private to the Electron parent."""

from __future__ import annotations

import importlib.util
from importlib.metadata import PackageNotFoundError, version as package_version
import json
import logging
import os
import platform
import sys
import threading
import time
import math
from typing import Any, Protocol
try:
    from edge.mujoco_simulation import MuJoCoSimulation
    from edge.calibration import CalibrationWorkflow
    from edge.serial_ownership import SerialPortOwner
    from edge.teleoperation import Teleoperation
    from edge.policy_manager import PolicyManager
except ModuleNotFoundError:
    # Support the documented direct source invocation (`python edge/runtime.py`)
    # as well as package imports and the frozen PyInstaller entry point.
    from mujoco_simulation import MuJoCoSimulation
    from calibration import CalibrationWorkflow
    from serial_ownership import SerialPortOwner
    from teleoperation import Teleoperation
    from policy_manager import PolicyManager

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
        return {"mode": self.mode, "connected": self.connected, "calibrated": False, "motionEnabled": False}

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
    """Independent, read-only SO-101 connection wrapper. It has no motion method."""

    mode = "PHYSICAL ROBOT READ ONLY"

    def __init__(self, role: str = "follower", slot: str | None = None) -> None:
        if role not in {"leader", "follower"}:
            raise ValueError("SO-101 role must be leader or follower.")
        self.role = role
        self.slot = slot or role
        self.robot = None
        self.port: str | None = None
        self.device_id: str | None = None
        self.calibration_ready = False
        self._serial_owner: SerialPortOwner | None = None
        self.last_error: str | None = None

    @staticmethod
    def ports() -> list[dict[str, Any]]:
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
        if importlib.util.find_spec("lerobot") is None:
            raise RuntimeError("LeRobot is unavailable in this Edge Runtime.")
        try:
            installed_lerobot = package_version("lerobot")
        except PackageNotFoundError as error:
            raise RuntimeError("LeRobot package metadata is unavailable; hardware connection is blocked.") from error
        if installed_lerobot not in {"0.6.1", "0.6.2"}:
            raise RuntimeError(f"SO-101 adapter was API-checked for LeRobot 0.6.1/0.6.2; found {installed_lerobot}.")
        owner = SerialPortOwner(port, f"{self.role}-connection").acquire()
        try:
            if self.role == "leader":
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


class EdgeRuntime:
    def __init__(self, *, simulated: Adapter | None = None, physical: Adapter | None = None,
                 leader: Adapter | None = None, arms: dict[str, Adapter] | None = None) -> None:
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
        self.calibration = CalibrationWorkflow(port_provider=self.physical.ports)
        self.teleoperation = Teleoperation()
        self.mujoco = MuJoCoSimulation()
        self.policies = PolicyManager()
        self.active = "SIMULATION"
        self._stop = threading.Event()

    def handle(self, message: dict[str, Any], on_event=None) -> dict[str, Any]:
        request_id = message.get("id")
        method = message.get("method")
        params = message.get("params") or {}
        if not isinstance(request_id, str) or len(request_id) > 80 or not isinstance(params, dict):
            raise ValueError("Request envelope is invalid.")
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
            observation = self.mujoco.policy_observation(self.policies.active_input_features())
            inference = self.policies.run(
                observation, params.get("prompt", ""),
                execute=lambda action: self.mujoco.execute_policy_action(action["jointPositions"], emit=on_event),
            )
            return {"policyId": inference["policyId"], "promptUsed": inference["promptUsed"],
                    "action": inference["action"], "simulation": inference["simulation"], "motionEnabled": False}
        if method == "status":
            arm_status = {slot: adapter.status() for slot, adapter in self.arms.items()}
            return {"activeMode": self.active, "simulation": self.mujoco.status(), "robotSimulation": self.simulated.status(), "arms": arm_status,
                    "physical": arm_status["follower-a"], "leader": arm_status["leader-a"],
                    "motionEnabled": False, "teleoperation": self.teleoperation.status()}
        if method == "teleop_status":
            return self.teleoperation.status()
        if method == "teleop_configure":
            return self.teleoperation.configure(params.get("pairId"), params.get("leaderPort"), params.get("followerPort"), params.get("confirmed") is True)
        if method == "teleop_enable":
            return self.teleoperation.enable(params.get("pairId"), params.get("confirmed") is True)
        if method == "teleop_deadman":
            return self.teleoperation.set_deadman(params.get("pairId"), params.get("held"), params.get("confirmed") is True)
        if method == "teleop_disable":
            return self.teleoperation.disable(params.get("pairId"))
        if method == "teleop_step":
            return self.teleoperation.step(params.get("pairId"), params.get("leader"), params.get("sequence"), params.get("timestamp"), params.get("deadmanHeld"))
        if method == "teleop_estop":
            return self.teleoperation.emergency_stop(params.get("pairId"))
        if method == "teleop_reset":
            return self.teleoperation.reset_estop(params.get("pairId"), params.get("confirmed") is True)
        if method == "teleop_disconnect":
            return self.teleoperation.disconnect(params.get("pairId"))
        if method == "simulate":
            return self.mujoco.execute(params.get("command"), params.get("authorization"),
                                       params.get("attempt"), params.get("confirmation"), on_event)
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
                result = self.arms[slot].disconnect()
                result["slot"] = slot
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
            return adapter.joint_state()
        if method == "calibration_status":
            return self.calibration.status()
        if method == "calibration_profiles":
            return self.calibration.profiles(params.get("role"))
        if method == "calibration_start":
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
            return {"stopping": True, "motionEnabled": False}
        raise ValueError("Method is not supported.")

    def close(self) -> None:
        self._stop.set()
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
