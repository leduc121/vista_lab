import unittest
from pathlib import Path

from edge.checkik_kinematics import SO101Kinematics, solve_ik
from edge.runtime import EdgeRuntime, JOINTS
from edge.safety_controller import LocalSafetyController
from edge.mujoco_simulation import MuJoCoSimulation


ROOT = Path(__file__).resolve().parents[2]


class FakeGuardedSimulation:
    def __init__(self):
        self.action_guard = None
        self.applied = []

    def current_joint_positions(self):
        return [0.0] * 6

    def predict_end_effector(self, _positions):
        return [0.2, 0.0, 0.15]

    def execute_joint_targets(self, positions, _emit=None, _duration=0.35):
        limits = {name: (-3.0, 3.0) for name in JOINTS}
        def sink(): self.applied.append(list(positions))
        self.action_guard(positions, limits, sink)
        return {"ok": True, "mode": "SIMULATION", "engine": "fake-test", "motionEnabled": False,
                "final": {"schema_version": 1, "robot_id": "local-so101-simulation", "source_mode": "SIMULATION",
                          "controller_id": "test", "sequence": 1, "measured_at": "2026-01-01T00:00:00Z",
                          "connection": "connected", "calibration_status": "NOT_APPLICABLE",
                          "measured": [{"name": n, "position": v, "unit": "rad"} for n, v in zip(JOINTS, positions)]}}


class CheckIkIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.model = SO101Kinematics(ROOT / "edge/checkik_kinematics/so101_new_calib.urdf")

    def test_joint_order_and_fk_ik_round_trip(self):
        self.assertEqual(self.model.joint_names, JOINTS[:5])
        zero = self.model.forward_kinematics([0.0] * 5)
        self.assertAlmostEqual(float(zero.position[0]), 0.3913614702, places=8)
        result = solve_ik(self.model, [0.20, 0.00, 0.15])
        self.assertTrue(result.success, result.message)
        self.assertLessEqual(result.position_error, 1e-4)
        self.assertIsNotNone(result.joint_positions)

    def test_unreachable_target_is_rejected_without_a_solution(self):
        result = solve_ik(self.model, [2.0, 2.0, 2.0])
        self.assertFalse(result.success)
        self.assertIsNone(result.joint_positions)

    def test_checkik_cartesian_target_matches_real_mujoco_frame_within_runtime_tolerance(self):
        target = [0.20, 0.0, 0.15]
        solution = solve_ik(self.model, target)
        self.assertTrue(solution.success, solution.message)
        simulation = MuJoCoSimulation()
        self.assertTrue(simulation.available, simulation.error)
        actual = simulation.predict_end_effector(list(solution.joint_positions) + [0.0])
        error = sum((float(a) - float(b)) ** 2 for a, b in zip(actual, target, strict=True)) ** 0.5
        self.assertLessEqual(error, 0.02, f"URDF/MuJoCo frame error was {error * 1000:.2f} mm")

    def test_workspace_frame_sweep_reports_systematic_urdf_mujoco_offset(self):
        import numpy as np
        simulation = MuJoCoSimulation()
        self.assertTrue(simulation.available, simulation.error)
        errors = []
        failures = []
        for pan in (-1.0, -0.5, 0.0, 0.5, 1.0):
            for lift in (-1.1, -0.8, -0.5):
                for elbow in (0.3, 0.8, 1.2):
                    for wrist in (-0.8, -0.4, 0.0):
                        q = [pan, lift, elbow, wrist, 0.0]
                        target = self.model.forward_kinematics(q).position
                        solved = solve_ik(self.model, target, initial_q=np.zeros(5), multi_start=False, max_iterations=100)
                        if not solved.success:
                            failures.append((q, solved.message))
                            continue
                        self.assertEqual(tuple(self.model.joint_names), JOINTS[:5])
                        prediction = simulation.predict_end_effector(list(solved.joint_positions) + [-0.1])
                        errors.append(float(np.linalg.norm(np.asarray(prediction) - target)))
        self.assertEqual(failures, [])
        self.assertEqual(len(errors), 135)
        self.assertLessEqual(max(errors), 0.02)
        self.assertGreater(min(errors), 0.0198, "Frame mismatch unexpectedly disappeared; recheck model versions and frames.")

    def test_cartesian_target_reaches_only_guarded_simulation_sink(self):
        runtime = EdgeRuntime()
        simulation = FakeGuardedSimulation()
        runtime.mujoco = simulation
        response = runtime.handle({"id": "ik", "method": "cartesian_move", "params": {"position": [0.2, 0.0, 0.15]}})
        self.assertEqual(response["mode"], "SIMULATION")
        self.assertEqual(response["kinematics"], "checkIk SO-101 URDF/FK-verified IK")
        self.assertEqual(len(simulation.applied), 1)
        self.assertEqual(len(simulation.applied[0]), 6)
        self.assertFalse(response["motionEnabled"])

    def test_estop_and_invalid_joint_target_never_reach_simulation(self):
        runtime = EdgeRuntime()
        simulation = FakeGuardedSimulation()
        runtime.mujoco = simulation
        runtime.safety.emergency_stop("test")
        with self.assertRaises(PermissionError):
            runtime.handle({"id": "ik", "method": "cartesian_move", "params": {"position": [0.2, 0.0, 0.15]}})
        self.assertEqual(simulation.applied, [])
        runtime.safety = LocalSafetyController()
        with self.assertRaises(ValueError):
            runtime.handle({"id": "ik", "method": "cartesian_move", "params": {"position": [float("nan"), 0.0, 0.15]}})
        self.assertEqual(simulation.applied, [])


if __name__ == "__main__":
    unittest.main()
