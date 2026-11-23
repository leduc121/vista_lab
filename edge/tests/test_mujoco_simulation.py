import importlib.util
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from edge.mujoco_simulation import MuJoCoSimulation


@unittest.skipUnless(importlib.util.find_spec("mujoco"), "MuJoCo extra is not installed")
class MuJoCoSimulationTests(unittest.TestCase):
    def setUp(self):
        self.model_path = Path(__file__).resolve().parents[2] / "models" / "so101" / "scene.xml"
        self.simulation = MuJoCoSimulation(self.model_path)
        self.assertTrue(self.simulation.available, self.simulation.error)
        self.expires = int(time.time() * 1000) + 240_000
        self.attempt = {"id": "attempt-local-1", "status": "in_progress"}
        self.authorization = {"allowed": True, "attemptId": self.attempt["id"], "expiresAt": self.expires}

    def command(self, steps, **extra):
        return {"id": "test-run-0001", "expiresAt": self.expires, "speed": 4, "steps": steps, **extra}

    def test_loads_real_six_joint_model_and_reports_simulation_only(self):
        status = self.simulation.status()
        self.assertTrue(status["available"])
        self.assertEqual(status["engine"], "MuJoCo")
        self.assertEqual(status["model"], "scene.xml")
        self.assertFalse(status["motionEnabled"])

    def test_policy_observation_maps_virtual_camera_and_six_joint_state(self):
        class Feature:
            def __init__(self, shape): self.shape = shape
        simulation = self.simulation
        class Renderer:
            def __init__(self, _model, *, height, width):
                self.image = simulation.np.zeros((height, width, 3), dtype="uint8")
                self.camera = None
            def update_scene(self, _data, *, camera): self.camera = camera
            def render(self): return self.image

        rendered = []
        renderer_factory = lambda model, **kwargs: Renderer(model, **kwargs)
        with patch.dict("os.environ", {"MUJOCO_GL": "egl"}), patch.object(
            self.simulation.mujoco, "Renderer", side_effect=renderer_factory
        ):
            observation = self.simulation.policy_observation({
                "observation.state": Feature((6,)),
                "observation.images.front": Feature((3, 64, 80)),
            })
            rendered.append(self.simulation._policy_renderers[(64, 80)])
        self.assertEqual(len(observation["observation.state"]), 6)
        self.assertEqual(observation["observation.images.front"].shape, (64, 80, 3))
        self.assertEqual(observation["observation.images.front"].dtype.name, "uint8")
        self.assertIsNotNone(rendered[0].camera)
        self.assertEqual(tuple(float(value) for value in rendered[0].camera.lookat), (0.0, 0.0, 0.14))

    def test_policy_action_is_bounds_checked_then_applied_to_mujoco_only(self):
        frames = []
        result = self.simulation.execute_policy_action([0, -0.55, 1.05, -0.5, 0, -0.1], frames.append)
        self.assertEqual(result["engine"], "MuJoCo")
        self.assertFalse(result["motionEnabled"])
        self.assertGreater(len(frames), 0)
        self.assertEqual(frames[-1]["controller_id"], "local-policy-mujoco")
        with self.assertRaisesRegex(ValueError, "outside MuJoCo actuator limits"):
            self.simulation.execute_policy_action([999, 0, 0, 0, 0, 0])

    def test_executes_allowlisted_program_and_emits_measured_physics_frames(self):
        steps = [
            {"type": "arm.select", "arm": "right"},
            {"type": "home", "arm": "right"},
            {"type": "preview.move_xyz", "mode": "learning_preview", "frame": "learning_preview_v1",
             "arm": "right", "position": {"x": 240, "y": 220, "z": 120}},
            {"type": "gripper.open"}, {"type": "gripper.close"},
        ]
        frames = []
        result = self.simulation.execute(self.command(steps), self.authorization, self.attempt,
                                         "RUN_SIMULATION", frames.append)
        self.assertEqual(result["engine"], "MuJoCo")
        self.assertEqual(result["stepsCompleted"], 5)
        self.assertGreater(len(frames), 5)
        final = result["final"]
        self.assertEqual(final["source_mode"], "SIMULATION")
        self.assertEqual(len(final["measured"]), 6)
        self.assertTrue(all(item["unit"] == "rad" for item in final["measured"]))
        endpoint = final["end_effector_m"]
        self.assertLess(sum((actual - target) ** 2 for actual, target in zip(endpoint, (.24, .22, .12))) ** .5, .025)

    def test_requires_current_attempt_authorization_and_explicit_simulation(self):
        command = self.command([{"type": "arm.select", "arm": "left"}, {"type": "home", "arm": "left"}])
        with self.assertRaises(PermissionError):
            self.simulation.execute(command, {**self.authorization, "allowed": False}, self.attempt,
                                    "RUN_SIMULATION")
        with self.assertRaises(PermissionError):
            self.simulation.execute(command, self.authorization, {**self.attempt, "status": "submitted"},
                                    "RUN_SIMULATION")
        with self.assertRaises(PermissionError):
            self.simulation.execute(command, self.authorization, self.attempt, "RUN_PHYSICAL")

    def test_rejects_arbitrary_code_and_unreachable_targets(self):
        with self.assertRaises(ValueError):
            self.simulation.execute(self.command([{"type": "python.exec", "code": "open('/etc/passwd')"}]),
                                    self.authorization, self.attempt, "RUN_SIMULATION")
        unreachable = [{"type": "arm.select", "arm": "right"},
                       {"type": "preview.move_xyz", "mode": "learning_preview", "frame": "learning_preview_v1",
                        "arm": "right", "position": {"x": 600, "y": 400, "z": 300}}]
        with self.assertRaises(ValueError):
            self.simulation.execute(self.command(unreachable), self.authorization, self.attempt,
                                    "RUN_SIMULATION")

    def test_stop_request_cancels_active_physics_run(self):
        def cancel_on_frame(_frame):
            self.simulation.cancel()
        steps = [{"type": "arm.select", "arm": "left"}, {"type": "home", "arm": "left"}]
        with self.assertRaises(InterruptedError):
            self.simulation.execute(self.command(steps), self.authorization, self.attempt,
                                    "RUN_SIMULATION", cancel_on_frame)


if __name__ == "__main__":
    unittest.main()
