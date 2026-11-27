"""Allowlisted SO-101 Blockly execution on the local MuJoCo model only."""
from __future__ import annotations

import importlib.util
import math
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

MAX_STEPS = 200
MAX_AGE_MS = 5 * 60_000
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
ALLOWED = {"arm.select", "home", "preview.move_xyz", "gripper.open", "gripper.close", "wait"}
HOME = (0.0, -0.55, 1.05, -0.50, 0.0, -0.10)
GRIPPER_OPEN_MARGIN_RAD = 0.02


class MuJoCoSimulation:
    def __init__(self, model_path: str | Path | None = None) -> None:
        root = Path(__file__).resolve().parents[1]
        self.model_path = Path(model_path or os.environ.get("VISTA_SO101_MJCF", root / "models/so101/scene.xml")).expanduser()
        self.model = None
        self.mujoco = None
        self.np = None
        self.error: str | None = None
        self._joint_ids: dict[str, int] = {}
        self._actuator_ids: dict[str, int] = {}
        self._site_id = -1
        self.action_guard: Callable[[list[float], dict[str, tuple[float, float]], Callable[[], None]], None] | None = None
        self._policy_data = None
        self._policy_renderers: dict[tuple[int, int], Any] = {}
        import threading
        self._run_lock = threading.Lock()
        self._cancelled = threading.Event()
        self._resume = threading.Event()
        self._resume.set()
        if importlib.util.find_spec("mujoco") is None:
            self.error = "MuJoCo Python package is not installed in this Edge Runtime."
            return
        if not self.model_path.is_file():
            self.error = "SO-101 MJCF model is missing. Select a local scene.xml model or restore models/so101/scene.xml."
            return
        try:
            import mujoco
            import numpy as np

            model = mujoco.MjModel.from_xml_path(str(self.model_path.resolve()))
            joint_ids = {name: mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name) for name in JOINTS}
            actuator_ids = {name: mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR, name) for name in JOINTS}
            site_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, "gripperframe")
            if any(value < 0 for value in joint_ids.values()) or any(value < 0 for value in actuator_ids.values()) or site_id < 0:
                raise ValueError("MJCF does not contain the six SO-101 joints, position actuators, and gripperframe site.")
            if model.nq != 6 or model.nv != 6:
                raise ValueError("MJCF must be a fixed-base six-joint SO-101 model.")
            self.mujoco, self.np, self.model = mujoco, np, model
            self._joint_ids, self._actuator_ids, self._site_id = joint_ids, actuator_ids, site_id
            self._policy_data = mujoco.MjData(model)
            mujoco.mj_resetData(model, self._policy_data)
            mujoco.mj_forward(model, self._policy_data)
        except Exception as error:
            self.error = f"SO-101 MuJoCo model failed validation: {error}"
            self.model = None

    @property
    def available(self) -> bool:
        return self.model is not None

    def status(self) -> dict[str, Any]:
        return {"available": self.available, "engine": "MuJoCo" if self.available else None,
                "model": self.model_path.name if self.available else None,
                "modelPath": str(self.model_path) if self.available else None,
                "error": self.error, "mode": "SIMULATION", "motionEnabled": False}

    def cancel(self) -> None:
        if not self._run_lock.locked():
            return
        self._cancelled.set()
        self._resume.set()

    def pause(self) -> None:
        if not self._run_lock.locked():
            raise RuntimeError("No MuJoCo simulation is running.")
        self._resume.clear()

    def resume(self) -> None:
        if not self._run_lock.locked():
            raise RuntimeError("No MuJoCo simulation is running.")
        self._resume.set()

    def policy_observation(self, input_features: dict[str, Any]) -> dict[str, Any]:
        if not self._run_lock.acquire(blocking=False):
            raise RuntimeError("MuJoCo is executing another simulation; policy observation was not captured.")
        try:
            return self._capture_policy_observation(input_features)
        finally:
            self._run_lock.release()

    def _capture_policy_observation(self, input_features: dict[str, Any]) -> dict[str, Any]:
        """Capture the fixed-base MuJoCo state and declared virtual camera views."""
        if not self.available or self._policy_data is None:
            raise RuntimeError("MuJoCo simulation is unavailable for policy observations.")
        observation: dict[str, Any] = {}
        for key, feature in input_features.items():
            shape = tuple(feature.shape)
            if key == "observation.state":
                if shape != (6,): raise ValueError("Policy state input must have six SO-101 joint values.")
                observation[key] = [float(self._policy_data.qpos[self.model.jnt_qposadr[self._joint_ids[name]]]) for name in JOINTS]
            elif key.startswith("observation.images."):
                if len(shape) != 3 or shape[0] != 3: raise ValueError(f"Visual input {key} must use CHW RGB shape.")
                if key not in {"observation.images.top", "observation.images.front", "observation.images.right", "observation.images.wrist"}:
                    raise ValueError(f"No calibrated MuJoCo camera is mapped to {key}.")
                if os.environ.get("MUJOCO_GL") not in {"egl", "osmesa"}:
                    raise RuntimeError("Headless policy camera requires MUJOCO_GL=egl or osmesa.")
                height, width = shape[1], shape[2]
                render_key = (height, width)
                renderer = self._policy_renderers.get(render_key)
                if renderer is None:
                    renderer = self.mujoco.Renderer(self.model, height=height, width=width)
                    self._policy_renderers[render_key] = renderer
                camera = self.mujoco.MjvCamera()
                self.mujoco.mjv_defaultCamera(camera)
                camera.type = self.mujoco.mjtCamera.mjCAMERA_FREE
                camera.lookat[:] = (0.0, 0.0, 0.14)
                camera.distance = 1.05
                if key.endswith("top"):
                    camera.azimuth, camera.elevation = 90, -72
                elif key.endswith("right") or key.endswith("wrist"):
                    camera.azimuth, camera.elevation = 180, -20
                else:
                    camera.azimuth, camera.elevation = 135, -25
                renderer.update_scene(self._policy_data, camera=camera)
                observation[key] = renderer.render()
            else:
                raise ValueError(f"Unsupported observation feature {key!r}.")
        observation["_vista_joint_limits_rad"] = {
            name: [float(value) for value in self.model.actuator_ctrlrange[self._actuator_ids[name]]]
            for name in JOINTS
        }
        return observation

    def execute_policy_action(self, positions: Any, emit: Callable[[dict[str, Any]], None] | None = None) -> dict[str, Any]:
        if not self.available or self._policy_data is None:
            raise RuntimeError("MuJoCo simulation is unavailable.")
        if not self._run_lock.acquire(blocking=False):
            raise RuntimeError("MuJoCo is already running another simulation.")
        try:
            if not isinstance(positions, (list, tuple)) or len(positions) != 6:
                raise ValueError("Policy output must contain exactly six ordered SO-101 joint targets.")
            targets = []
            for name, value in zip(JOINTS, positions, strict=True):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                    raise ValueError(f"Policy output for {name} must be finite numeric radians.")
                actuator = self._actuator_ids[name]
                low, high = self.model.actuator_ctrlrange[actuator]
                if not float(low) <= float(value) <= float(high):
                    raise ValueError(f"Policy output for {name} is outside MuJoCo actuator limits [{low:.4f}, {high:.4f}] radians.")
                targets.append(float(value))
            if self.action_guard is None:
                raise PermissionError("LocalSafetyController action guard is required for policy joint targets.")
            frames = []
            def publish(progress: float, label: str) -> None:
                data = self._policy_data
                frame = {"schema_version": 1, "robot_id": "local-so101-simulation", "source_mode": "SIMULATION",
                         "controller_id": "local-policy-mujoco", "sequence": len(frames) + 1,
                         "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time_ns() % 1_000_000_000 / 1_000_000):03d}Z",
                         "connection": "connected", "calibration_status": "NOT_APPLICABLE",
                         "measured": [{"name": name, "position": float(data.qpos[self.model.jnt_qposadr[self._joint_ids[name]]]), "unit": "rad"} for name in JOINTS],
                         "calibrated": None, "commanded": [{"name": name, "position": value, "unit": "rad"} for name, value in zip(JOINTS, targets, strict=True)],
                         "progress": round(progress, 4), "step": label,
                         "end_effector_m": data.site_xpos[self._site_id].tolist(), "latency_ms": 0}
                frames.append(frame)
                if emit: emit(frame)
            self._cancelled.clear(); self._resume.set()
            self._move(self._policy_data, targets, duration=0.1, emit=publish, progress_base=0.0, progress_span=1.0, label="Policy action")
            publish(1.0, "Policy action complete")
            return {"ok": True, "mode": "SIMULATION", "engine": "MuJoCo", "final": frames[-1], "motionEnabled": False}
        finally:
            self._run_lock.release()

    def current_joint_positions(self) -> list[float]:
        if not self.available or self._policy_data is None:
            raise RuntimeError("MuJoCo simulation is unavailable.")
        return [float(self._policy_data.qpos[self.model.jnt_qposadr[self._joint_ids[name]]]) for name in JOINTS]

    def predict_end_effector(self, positions: Any) -> list[float]:
        """Evaluate a joint vector in the packaged MuJoCo frame without changing simulation state."""
        if not self.available:
            raise RuntimeError("MuJoCo simulation is unavailable.")
        if not isinstance(positions, (list, tuple)) or len(positions) != len(JOINTS):
            raise ValueError("Prediction requires all six ordered SO-101 joints.")
        data = self.mujoco.MjData(self.model)
        for name, value in zip(JOINTS, positions, strict=True):
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(float(value)):
                raise ValueError(f"Prediction for {name} must be finite radians.")
            data.qpos[self.model.jnt_qposadr[self._joint_ids[name]]] = float(value)
        self.mujoco.mj_forward(self.model, data)
        return [float(value) for value in data.site_xpos[self._site_id]]

    def execute_joint_targets(self, positions: Any, emit: Callable[[dict[str, Any]], None] | None = None,
                              duration_seconds: float = 0.35) -> dict[str, Any]:
        """Apply one manual joint target to the local simulator through action_guard."""
        if not self.available or self._policy_data is None:
            raise RuntimeError("MuJoCo simulation is unavailable.")
        if self.action_guard is None:
            raise PermissionError("LocalSafetyController action guard is required for manual joint targets.")
        if isinstance(duration_seconds, bool) or not isinstance(duration_seconds, (float, int)) or not math.isfinite(float(duration_seconds)) or not 0.05 <= duration_seconds <= 5.0:
            raise ValueError("Manual target duration must be between 0.05 and 5 seconds.")
        if not self._run_lock.acquire(blocking=False):
            raise RuntimeError("MuJoCo is already running another simulation.")
        try:
            if not isinstance(positions, (list, tuple)) or len(positions) != len(JOINTS):
                raise ValueError("Manual target must contain all six ordered SO-101 joints.")
            targets = []
            for name, value in zip(JOINTS, positions, strict=True):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                    raise ValueError(f"Manual target for {name} must be finite radians.")
                actuator = self._actuator_ids[name]
                low, high = self.model.actuator_ctrlrange[actuator]
                if not float(low) <= float(value) <= float(high):
                    raise ValueError(f"Manual target for {name} is outside MuJoCo actuator limits.")
                targets.append(float(value))
            frames = []
            def publish(progress: float, label: str) -> None:
                data = self._policy_data
                frame = {"schema_version": 1, "robot_id": "local-so101-simulation", "source_mode": "SIMULATION",
                         "controller_id": "local-manual-mujoco", "sequence": len(frames) + 1,
                         "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time_ns() % 1_000_000_000 / 1_000_000):03d}Z",
                         "connection": "connected", "calibration_status": "NOT_APPLICABLE",
                         "measured": [{"name": name, "position": float(data.qpos[self.model.jnt_qposadr[self._joint_ids[name]]]), "unit": "rad"} for name in JOINTS],
                         "calibrated": None, "commanded": [{"name": name, "position": value, "unit": "rad"} for name, value in zip(JOINTS, targets, strict=True)],
                         "progress": round(progress, 4), "step": label,
                         "end_effector_m": data.site_xpos[self._site_id].tolist(), "latency_ms": 0}
                frames.append(frame)
                if emit: emit(frame)
            self._cancelled.clear(); self._resume.set()
            self._move(self._policy_data, targets, duration=float(duration_seconds), emit=publish, progress_base=0.0,
                       progress_span=1.0, label="Manual joint target")
            publish(1.0, "Manual target complete")
            return {"ok": True, "mode": "SIMULATION", "engine": "MuJoCo", "final": frames[-1], "motionEnabled": False}
        finally:
            self._run_lock.release()

    def execute(self, command: Any, authorization: Any, attempt: Any, confirmation: Any,
                emit: Callable[[dict[str, Any]], None] | None = None) -> dict[str, Any]:
        if not self._run_lock.acquire(blocking=False):
            raise RuntimeError("A MuJoCo simulation is already running.")
        self._cancelled.clear()
        try:
            return self._execute(command, authorization, attempt, confirmation, emit)
        finally:
            self._run_lock.release()

    def _execute(self, command: Any, authorization: Any, attempt: Any, confirmation: Any,
                 emit: Callable[[dict[str, Any]], None] | None = None) -> dict[str, Any]:
        if not self.available:
            raise RuntimeError(self.error or "MuJoCo simulation is unavailable.")
        now = int(time.time() * 1000)
        if confirmation != "RUN_SIMULATION":
            raise PermissionError("Explicit local simulation confirmation is required.")
        if not isinstance(attempt, dict) or attempt.get("status") != "in_progress" or not isinstance(attempt.get("id"), str):
            raise PermissionError("An active lab attempt is required for simulation.")
        if (not isinstance(authorization, dict) or authorization.get("allowed") is not True
                or authorization.get("attemptId") != attempt["id"]
                or not isinstance(authorization.get("expiresAt"), int) or authorization["expiresAt"] <= now):
            raise PermissionError("Local simulation authorization is missing, mismatched, or expired.")
        self._validate(command, now)
        model, mujoco, np = self.model, self.mujoco, self.np
        data = mujoco.MjData(model)
        mujoco.mj_resetData(model, data)
        targets = [float(data.qpos[model.jnt_qposadr[self._joint_ids[name]]]) for name in JOINTS]
        for name, target in zip(JOINTS, targets):
            data.ctrl[self._actuator_ids[name]] = target
        mujoco.mj_forward(model, data)
        frames: list[dict[str, Any]] = []
        selected_arm = None
        sequence = 0

        def publish(progress: float, label: str) -> None:
            nonlocal sequence
            sequence += 1
            readings = []
            for name in JOINTS:
                joint_id = self._joint_ids[name]
                qpos = model.jnt_qposadr[joint_id]
                readings.append({"name": name, "position": float(data.qpos[qpos]), "unit": "rad"})
            state = {"schema_version": 1, "robot_id": "local-so101-simulation",
                     "source_mode": "SIMULATION", "controller_id": "local-mujoco-edge",
                     "sequence": sequence, "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time_ns() % 1_000_000_000 / 1_000_000):03d}Z",
                     "connection": "connected", "calibration_status": "NOT_APPLICABLE",
                     "measured": readings, "calibrated": None, "commanded": None,
                     "progress": round(max(0.0, min(1.0, progress)), 4), "step": label,
                     "end_effector_m": data.site_xpos[self._site_id].tolist(), "latency_ms": 0}
            if emit:
                emit(state)
            frames.append(state)

        total = max(1, len(command["steps"]))
        timestep = float(model.opt.timestep)
        frame_stride = max(1, int(round(0.05 / timestep)))
        for index, step in enumerate(command["steps"]):
            if self._cancelled.is_set():
                raise InterruptedError("Local MuJoCo simulation was cancelled.")
            if authorization["expiresAt"] <= int(time.time() * 1000):
                raise PermissionError("Lab simulation authorization expired during execution.")
            kind = step["type"]
            if kind == "arm.select":
                selected_arm = step["arm"]
            elif kind == "home":
                targets = list(HOME)
                self._move(data, targets, duration=0.8 / command.get("speed", 1.0), emit=publish, progress_base=index / total,
                           progress_span=1 / total, label="Home pose")
            elif kind in {"gripper.open", "gripper.close"}:
                low, high = model.actuator_ctrlrange[self._actuator_ids["gripper"]]
                # The position servo's transient can cross MuJoCo's soft lower
                # joint-limit constraint when commanded exactly to the stop.
                # Keep the simulated open target inside the verified range so
                # measured physics frames remain valid SO-101 joint states.
                targets[5] = float(min(high, low + GRIPPER_OPEN_MARGIN_RAD) if kind == "gripper.open" else high)
                self._move(data, targets, duration=0.4 / command.get("speed", 1.0), emit=publish, progress_base=index / total,
                           progress_span=1 / total, label="Gripper " + kind.split(".")[1])
            elif kind == "preview.move_xyz":
                if step.get("frame") != "learning_preview_v1" or step.get("mode") != "learning_preview":
                    raise ValueError("Coordinate command must use the declared learning-preview frame.")
                position = step.get("position")
                if not isinstance(position, dict) or any(not isinstance(position.get(axis), (int, float)) for axis in ("x", "y", "z")):
                    raise ValueError("Learning-preview target must contain numeric x, y and z millimeters.")
                if any(isinstance(position[axis], bool) for axis in ("x", "y", "z")):
                    raise ValueError("Learning-preview coordinates must be numbers, not booleans.")
                if any(not math.isfinite(float(position[axis])) for axis in ("x", "y", "z")):
                    raise ValueError("Learning-preview target contains a non-finite value.")
                if not 0 <= position["x"] <= 600 or not 0 <= position["y"] <= 400 or not 10 <= position["z"] <= 300:
                    raise ValueError("Learning-preview target is outside the Blockly coordinate bounds.")
                target = np.asarray([position["x"], position["y"], position["z"]], dtype=float) / 1000.0
                targets = self._inverse_kinematics(data, target, targets)
                self._move(data, targets, duration=1.0 / command.get("speed", 1.0), emit=publish, progress_base=index / total,
                           progress_span=1 / total, label="Move to learning-preview point")
            elif kind == "wait":
                count = int(math.ceil(step["durationMs"] / 1000 / command.get("speed", 1.0) / timestep))
                for frame_step in range(count):
                    self._checkpoint()
                    if self._cancelled.is_set():
                        raise InterruptedError("Local MuJoCo simulation was cancelled.")
                    if authorization["expiresAt"] <= int(time.time() * 1000):
                        raise PermissionError("Lab simulation authorization expired during execution.")
                    mujoco.mj_step(model, data)
                    if frame_step % frame_stride == 0 or frame_step + 1 == count:
                        fraction = (frame_step + 1) / max(1, count)
                        publish((index + fraction) / total, "Wait")
            publish((index + 1) / total, kind)
        if not frames:
            publish(1.0, "Complete")
        return {"ok": True, "mode": "SIMULATION", "engine": "MuJoCo", "model": self.model_path.name,
                "commandId": command["id"], "stepsCompleted": len(command["steps"]),
                "selectedArm": selected_arm, "final": frames[-1], "motionEnabled": False}

    @staticmethod
    def _validate(command: Any, now_ms: int) -> None:
        if (not isinstance(command, dict) or set(command) - {"id", "expiresAt", "steps", "speed"}
                or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", str(command.get("id", "")))
                or not isinstance(command.get("expiresAt"), int) or isinstance(command.get("expiresAt"), bool) or command["expiresAt"] <= now_ms
                or command["expiresAt"] > now_ms + MAX_AGE_MS):
            raise ValueError("Simulation command ID or expiry is invalid.")
        speed = command.get("speed", 1.0)
        if not isinstance(speed, (int, float)) or isinstance(speed, bool) or not math.isfinite(speed) or not 0.5 <= speed <= 4:
            raise ValueError("Simulation speed must be between 0.5x and 4x.")
        steps = command.get("steps")
        if not isinstance(steps, list) or not 1 <= len(steps) <= MAX_STEPS:
            raise ValueError("Simulation command must contain 1 to 200 allowlisted steps.")
        wait_total = 0
        selected_arm = None
        for step in steps:
            if not isinstance(step, dict) or step.get("type") not in ALLOWED:
                raise ValueError("Simulation step is outside the allowlist.")
            allowed_fields = {
                "arm.select": {"type", "arm"}, "home": {"type", "arm"},
                "preview.move_xyz": {"type", "mode", "frame", "arm", "position"},
                "gripper.open": {"type", "arm"}, "gripper.close": {"type", "arm"},
                "wait": {"type", "durationMs"},
            }[step["type"]]
            if set(step) - allowed_fields:
                raise ValueError("Simulation step contains unsupported fields.")
            if step["type"] == "arm.select" and step.get("arm") not in {"left", "right"}:
                raise ValueError("Selected arm is invalid.")
            if step["type"] == "arm.select":
                selected_arm = step["arm"]
            elif step["type"] in {"home", "preview.move_xyz", "gripper.open", "gripper.close"}:
                if selected_arm is None:
                    raise ValueError("Select an arm before adding a movement or gripper step.")
                if step.get("arm") is not None and step.get("arm") != selected_arm:
                    raise ValueError("Step arm does not match the selected arm.")
            if step["type"] == "wait":
                duration = step.get("durationMs")
                if not isinstance(duration, int) or isinstance(duration, bool) or not 0 <= duration <= 5000:
                    raise ValueError("Wait must be an integer from 0 to 5000 milliseconds.")
                wait_total += duration
            if step["type"] == "preview.move_xyz":
                if step.get("arm") not in {"left", "right"}:
                    raise ValueError("Coordinate preview requires a selected arm.")
        if wait_total > 15_000:
            raise ValueError("Simulation wait budget exceeds 15 seconds.")

    def _move(self, data: Any, targets: list[float], *, duration: float,
              emit: Callable[[float, str], None], progress_base: float,
              progress_span: float, label: str) -> None:
        model, mujoco = self.model, self.mujoco
        steps = max(1, int(math.ceil(duration / float(model.opt.timestep))))
        stride = max(1, int(round(0.05 / float(model.opt.timestep))))
        for name, target in zip(JOINTS, targets):
            actuator_id = self._actuator_ids[name]
            low, high = model.actuator_ctrlrange[actuator_id]
            if not math.isfinite(float(target)) or target < low - 1e-6 or target > high + 1e-6:
                raise ValueError(f"Target for {name} exceeds the MuJoCo actuator limits.")
        def write_targets() -> None:
            for name, target in zip(JOINTS, targets):
                actuator_id = self._actuator_ids[name]
                low, high = model.actuator_ctrlrange[actuator_id]
                data.ctrl[actuator_id] = min(float(high), max(float(low), float(target)))
        if self.action_guard:
            verified_limits = {name: tuple(float(value) for value in model.actuator_ctrlrange[self._actuator_ids[name]]) for name in JOINTS}
            self.action_guard([float(target) for target in targets], verified_limits, write_targets)
        else:
            write_targets()
        for i in range(steps):
            self._checkpoint()
            mujoco.mj_step(model, data)
            if i % stride == 0 or i + 1 == steps:
                emit(progress_base + progress_span * ((i + 1) / steps), label)

    def _checkpoint(self) -> None:
        if self._cancelled.is_set():
            raise InterruptedError("Local MuJoCo simulation was cancelled.")
        while not self._resume.wait(0.05):
            if self._cancelled.is_set():
                raise InterruptedError("Local MuJoCo simulation was cancelled.")

    def _inverse_kinematics(self, data: Any, target: Any, current_targets: list[float]) -> list[float]:
        mujoco, np, model = self.mujoco, self.np, self.model
        qpos_addresses = [int(model.jnt_qposadr[self._joint_ids[name]]) for name in JOINTS[:5]]
        dof_addresses = [int(model.jnt_dofadr[self._joint_ids[name]]) for name in JOINTS[:5]]
        for address, value in zip(qpos_addresses, current_targets[:5]):
            data.qpos[address] = value
        damping = 0.025
        jac_position = np.zeros((3, model.nv), dtype=float)
        jac_rotation = np.zeros((3, model.nv), dtype=float)
        for _ in range(80):
            mujoco.mj_forward(model, data)
            error = target - data.site_xpos[self._site_id]
            if float(np.linalg.norm(error)) < 0.008:
                result = list(current_targets)
                result[:5] = [float(data.qpos[address]) for address in qpos_addresses]
                return result
            mujoco.mj_jacSite(model, data, jac_position, jac_rotation, self._site_id)
            jacobian = jac_position[:, dof_addresses]
            delta = jacobian.T @ np.linalg.solve(jacobian @ jacobian.T + damping * damping * np.eye(3), error)
            for index, address in enumerate(qpos_addresses):
                joint_id = self._joint_ids[JOINTS[index]]
                low, high = model.jnt_range[joint_id]
                data.qpos[address] = float(np.clip(data.qpos[address] + delta[index], low, high))
        mujoco.mj_forward(model, data)
        residual = float(np.linalg.norm(target - data.site_xpos[self._site_id]))
        if residual > 0.025:
            raise ValueError(f"Learning-preview point is outside reachable workspace ({residual * 1000:.0f} mm residual).")
        result = list(current_targets)
        result[:5] = [float(data.qpos[address]) for address in qpos_addresses]
        return result
