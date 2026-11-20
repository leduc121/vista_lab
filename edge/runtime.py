#!/usr/bin/env python3
"""Local VISTA Edge Runtime. JSON-lines stdio is private to the Electron parent."""

from __future__ import annotations

import importlib.util
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
except ModuleNotFoundError:
    # Support the documented direct source invocation (`python edge/runtime.py`)
    # as well as package imports and the frozen PyInstaller entry point.
    from mujoco_simulation import MuJoCoSimulation

RUNTIME_VERSION = "0.1.0"
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
logger = logging.getLogger("vista.edge")


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

    def __init__(self) -> None:
        self.robot = None
        self.port: str | None = None
        self.device_id: str | None = None
        self.calibration_ready = False

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
        return {
            "mode": self.mode,
            "connected": bool(self.robot and self.robot.is_connected),
            "calibrated": self.calibration_ready,
            "calibration": "READY" if self.calibration_ready else "ACTION REQUIRED",
            "motionEnabled": False,
            "port": self.port,
            "deviceId": self.device_id,
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
        from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

        candidate = SO101Follower(SO101FollowerConfig(port=port, id=device_id, use_degrees=True, max_relative_target=1.0))
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
            raise
        self.robot = candidate
        self.port = port
        self.device_id = device_id
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
        return self.status()

    def joint_state(self) -> dict[str, Any]:
        if not self.robot or not self.robot.is_connected:
            raise RuntimeError("SO-101 is not connected.")
        if not self.calibration_ready:
            raise RuntimeError("Calibration is not verified; joint readings are blocked.")
        observation = self.robot.get_observation()
        values = {name: float(observation[f"{name}.pos"]) for name in JOINTS}
        if not all(map(math.isfinite, values.values())):
            raise RuntimeError("SO-101 returned non-finite joint readings.")
        return {"mode": self.mode, "measured": True, "timestamp": time.time(), "joints": values}


class EdgeRuntime:
    def __init__(self, *, simulated: Adapter | None = None, physical: Adapter | None = None) -> None:
        self.simulated = simulated or SimulatedSO101()
        self.physical = physical or LeRobotSO101Adapter()
        self.mujoco = MuJoCoSimulation()
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
        if method == "status":
            return {"activeMode": self.active, "simulation": self.mujoco.status(), "robotSimulation": self.simulated.status(), "physical": self.physical.status(),
                    "motionEnabled": False}
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
            if params.get("mode") != "PHYSICAL ROBOT READ ONLY" or params.get("confirmed") is not True:
                raise PermissionError("Read-only robot connection requires explicit user confirmation.")
            selected_port = params.get("port")
            if not isinstance(selected_port, str) or selected_port not in {row.get("path") for row in self.physical.ports()}:
                raise ValueError("Select a currently discovered serial port; ports are never guessed.")
            status = self.physical.connect(selected_port, params.get("deviceId"))
            self.active = "PHYSICAL ROBOT READ ONLY"
            return status
        if method == "disconnect":
            status = self.physical.disconnect()
            self.active = "SIMULATION"
            return status
        if method == "joint_state":
            return self.physical.joint_state() if self.active == "PHYSICAL ROBOT READ ONLY" else self.simulated.joint_state()
        if method == "stop":
            self._stop.set()
            return {"stopping": True, "motionEnabled": False}
        raise ValueError("Method is not supported.")

    def close(self) -> None:
        self._stop.set()
        try:
            self.physical.disconnect()
        except Exception:
            logger.exception("robot disconnect failed during shutdown")


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
            result = runtime.handle(message, on_event=lambda frame: write({"id": request_id, "event": "simulation.frame", "data": frame}))
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
                if message.get("method") == "simulate":
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
