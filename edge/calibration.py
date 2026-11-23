"""Explicitly-confirmed, operator-guided LeRobot SO-101 calibration workflow.

Calibration can change motor registers and requires the operator to move joints
by hand. This module is never started by health checks or automated tests.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable

try:
    from edge.serial_ownership import SerialPortOwner
except ModuleNotFoundError:
    from serial_ownership import SerialPortOwner

logger = logging.getLogger("vista.edge.calibration")
_PROFILE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_MAX_POSITION = 5000
_MAX_JUMP = 2000
_MIN_RANGE = 100


class CalibrationWorkflow:
    """One local calibration session; accepts a fake factory for offline tests."""

    def __init__(self, *, device_factory: Callable[[str, str, str], Any] | None = None,
                 port_provider: Callable[[], list[dict[str, Any]]] | None = None,
                 motor_calibration_factory: Callable[..., Any] | None = None,
                 position_mode: Any = None):
        self.device_factory = device_factory or self._lerobot_device
        self.port_provider = port_provider or self._ports
        self.motor_calibration_factory = motor_calibration_factory
        self.position_mode = position_mode
        self._lock = threading.RLock()
        self._complete_step = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._status: dict[str, Any] = self._idle()

    @staticmethod
    def _idle() -> dict[str, Any]:
        return {"active": False, "status": "idle", "role": None, "port": None,
                "profileId": None, "message": "", "error": None, "step": 0,
                "totalSteps": 2, "positions": None, "ranges": None,
                "calibrated": False, "warnings": [], "motionEnabled": False}

    @staticmethod
    def _ports() -> list[dict[str, Any]]:
        from serial.tools import list_ports
        return [{"path": item.device} for item in list_ports.comports()]

    @staticmethod
    def _lerobot_device(role: str, port: str, profile_id: str) -> Any:
        if role == "leader":
            from lerobot.teleoperators.so_leader import SO101LeaderConfig
            from lerobot.teleoperators import make_teleoperator_from_config
            config = SO101LeaderConfig(port=port, id=profile_id)
            return make_teleoperator_from_config(config)
        from lerobot.robots.so_follower import SO101FollowerConfig
        from lerobot.robots import make_robot_from_config
        config = SO101FollowerConfig(port=port, id=profile_id)
        return make_robot_from_config(config)

    def status(self) -> dict[str, Any]:
        with self._lock:
            return deepcopy(self._status)

    @staticmethod
    def profiles(role: str) -> dict[str, Any]:
        if role not in {"leader", "follower"}:
            raise ValueError("Select leader or follower explicitly.")
        calibration_root = Path(os.environ.get(
            "HF_LEROBOT_CALIBRATION",
            str(Path.home() / ".cache" / "huggingface" / "lerobot" / "calibration"),
        ))
        directory = (calibration_root / "teleoperators" / "so_leader" if role == "leader"
                     else calibration_root / "robots" / "so_follower")
        profiles = []
        try:
            for path in sorted(directory.glob("*.json")):
                if path.is_file() and not path.is_symlink():
                    profiles.append({"id": path.stem, "modified": path.stat().st_mtime})
        except OSError:
            return {"role": role, "items": [], "available": False}
        return {"role": role, "items": profiles, "available": True}

    def start(self, role: str, port: str, profile_id: str, confirmed: bool) -> dict[str, Any]:
        if not confirmed:
            raise PermissionError("Explicit operator confirmation is required before hardware calibration.")
        if role not in {"leader", "follower"}:
            raise ValueError("Select leader or follower explicitly.")
        if not isinstance(profile_id, str) or not _PROFILE_ID.fullmatch(profile_id):
            raise ValueError("Calibration profile ID must be 1–64 letters, digits, dots, dashes, or underscores.")
        if port not in {row.get("path") for row in self.port_provider()}:
            raise ValueError("Select a currently discovered serial port; ports are never guessed.")
        with self._lock:
            if self._status["active"]:
                raise RuntimeError("Calibration is already active.")
            self._stop.clear()
            self._complete_step.clear()
            self._status = {**self._idle(), "active": True, "status": "connecting",
                            "role": role, "port": port, "profileId": profile_id,
                            "message": "Opening the selected LeRobot device.", "step": 0}
            self._thread = threading.Thread(target=self._run, args=(role, port, profile_id),
                                            name="vista-so101-calibration", daemon=True)
            self._thread.start()
            return self.status()

    def complete_step(self) -> dict[str, Any]:
        with self._lock:
            if not self._status["active"] or self._status["status"] != "recording":
                raise RuntimeError("There is no active range-recording step.")
            self._complete_step.set()
            return {"accepted": True, "motionEnabled": False}

    def stop(self) -> dict[str, Any]:
        with self._lock:
            if not self._status["active"]:
                return self.status()
            self._stop.set()
            self._complete_step.set()
            self._status.update(status="stopping", message="Stopping and disconnecting the device.")
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=8)
        return self.status()

    def _set(self, **values: Any) -> None:
        with self._lock:
            self._status.update(values)

    def _run(self, role: str, port: str, profile_id: str) -> None:
        device = None
        owner = None
        result_status = "error"
        message = "Calibration failed."
        error = None
        try:
            owner = SerialPortOwner(port, f"{role}-calibration").acquire()
            device = self.device_factory(role, port, profile_id)
            device.connect(calibrate=False)
            if self._stop.is_set():
                result_status, message = "cancelled", "Calibration cancelled before range recording."
                return

            # Mirrors the LeRobot SO-101 sequence exposed by LeLab: establish
            # half-turn homing offsets at the operator's neutral pose, then
            # record the raw encoder range while the operator sweeps the joints.
            device.bus.disable_torque()
            if self.position_mode is None:
                from lerobot.motors.feetech import OperatingMode
                position_mode = OperatingMode.POSITION.value
            else:
                position_mode = self.position_mode
            for motor in device.bus.motors:
                device.bus.write("Operating_Mode", motor, position_mode)
            device.bus.reset_calibration()
            start = None
            for _attempt in range(5):
                try:
                    candidate = device.bus.sync_read("Present_Position", normalize=False)
                    if candidate and all(0 < float(value) < _MAX_POSITION for value in candidate.values()):
                        start = candidate
                        break
                except Exception:
                    logger.debug("SO-101 initial calibration read failed; retrying", exc_info=True)
                time.sleep(0.1)
            if not start:
                raise RuntimeError("Could not read valid initial encoder positions after multiple attempts.")
            previous = dict(start)
            offsets = device.bus._get_half_turn_homings(start)
            for motor, offset in offsets.items():
                device.bus.write("Homing_Offset", motor, offset)
            mins, maxes = dict(start), dict(start)
            self._set(status="recording", step=1,
                      message="Move every joint by hand from its minimum to maximum range. Keep hands clear of pinch points.",
                      positions={key: float(value) for key, value in start.items()},
                      ranges={key: {"min": float(value), "max": float(value), "current": float(value)}
                              for key, value in start.items()})
            while not self._complete_step.wait(0.05):
                if self._stop.is_set():
                    result_status, message = "cancelled", "Calibration cancelled; profile was not saved."
                    return
                positions = None
                for attempt in range(3):
                    try:
                        positions = device.bus.sync_read("Present_Position", normalize=False)
                        break
                    except Exception as read_error:
                        if "Port is in use" in str(read_error) and attempt < 2:
                            time.sleep(0.01)
                            continue
                        raise
                if positions is None:
                    time.sleep(0.2)
                    continue
                for motor, raw in positions.items():
                    value = int(raw)
                    if not (0 < value < _MAX_POSITION):
                        continue
                    if motor in previous and abs(value - float(previous[motor])) > _MAX_JUMP:
                        raise RuntimeError("Motor discontinuity detected. Return all joints to mid-range and restart.")
                    previous[motor] = value
                    if motor in mins:
                        mins[motor] = min(mins[motor], value)
                        maxes[motor] = max(maxes[motor], value)
                self._set(positions={key: float(value) for key, value in positions.items()},
                          ranges={key: {"min": mins[key], "max": maxes[key], "current": float(positions.get(key, previous[key]))}
                                  for key in mins})
            if self._stop.is_set():
                result_status, message = "cancelled", "Calibration cancelled; profile was not saved."
                return
            unchanged = [name for name in mins if maxes[name] == mins[name]]
            if unchanged:
                raise RuntimeError("Some joints did not move during calibration: " + ", ".join(unchanged))
            insufficient = [name for name in mins if maxes[name] - mins[name] < _MIN_RANGE]
            warnings = [f"{name}: recorded range is under {_MIN_RANGE} encoder counts" for name in insufficient]
            if warnings:
                self._set(warnings=warnings)
            make_calibration = self.motor_calibration_factory
            if make_calibration is None:
                from lerobot.motors import MotorCalibration
                make_calibration = MotorCalibration
            calibration = {motor: make_calibration(id=spec.id, drive_mode=0,
                           homing_offset=offsets[motor], range_min=mins[motor], range_max=maxes[motor])
                           for motor, spec in device.bus.motors.items()}
            device.calibration = calibration
            device.bus.write_calibration(calibration)
            device._save_calibration()
            result_status, message = "completed", "LeRobot confirmed and saved the calibration profile."
        except Exception as exc:
            error = str(exc)[:300]
            message = "Calibration did not complete; inspect the error before retrying."
            logger.warning("SO-101 calibration failed (%s)", type(exc).__name__)
        finally:
            try:
                if device is not None and getattr(device, "is_connected", False):
                    device.disconnect()
            except Exception:
                logger.exception("SO-101 calibration disconnect failed")
                if result_status == "completed":
                    result_status, message, error = "error", "Calibration was saved, but device disconnect failed.", "Disconnect failed."
            if owner is not None:
                owner.release()
            self._set(active=False, status=result_status, message=message, error=error,
                      calibrated=(result_status == "completed"), motionEnabled=False)
