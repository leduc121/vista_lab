import unittest

from edge.safety_controller import JOINTS, LocalSafetyController
from edge.teleoperation import LIMITS, MAX_VELOCITY


class Clock:
    def __init__(self): self.now = 100.0
    def __call__(self): return self.now


class SafetyControllerTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.safety = LocalSafetyController(clock=self.clock, watchdog_seconds=.2)
        self.values = [0.0] * 6

    def acquire(self, resource="arm-a", source="teleoperation"):
        return self.safety.acquire(resource, source, runtime_kind="SIMULATION", robot_id=resource)

    def validate(self, *, resource="arm-a", source="teleoperation", sequence=1, at=None, values=None, **overrides):
        args = dict(resource=resource, source=source, robot_id=resource, joint_names=JOINTS,
                    positions=self.values if values is None else values, unit="rad", position_limits=LIMITS,
                    sequence=sequence, occurred_at=self.clock.now if at is None else at,
                    runtime_kind="SIMULATION", calibrated=True, velocity_limits=MAX_VELOCITY)
        args.update(overrides)
        return self.safety.validate_joint_action(**args)

    def test_rejects_uncalibrated_or_hardware_disabled_physical_actions(self):
        uncalibrated = LocalSafetyController(clock=self.clock, calibration_ready=False)
        self.assertEqual(uncalibrated.status()["state"], "UNCALIBRATED")
        with self.assertRaisesRegex(PermissionError, "calibration_required"):
            uncalibrated.acquire("arm-a", "VLA", runtime_kind="SIMULATION", robot_id="arm-a")
        enabled_but_uncalibrated = LocalSafetyController(fake_robot=False, hardware_enabled=True, clock=self.clock)
        with self.assertRaisesRegex(PermissionError, "calibration_required"):
            enabled_but_uncalibrated.acquire("follower-a", "manual", runtime_kind="PHYSICAL_ROBOT", robot_id="robot-1", calibrated=False, hardware_authorized=True)
        with self.assertRaisesRegex(PermissionError, "hardware_disabled"):
            self.safety.acquire("follower-a", "manual", runtime_kind="PHYSICAL_ROBOT", robot_id="robot-1", calibrated=True, hardware_authorized=True)
        self.assertFalse(self.safety.mqtt_ready())

    def test_validates_identity_order_units_finiteness_and_position_bounds(self):
        self.acquire()
        with self.assertRaisesRegex(PermissionError, "robot_identity_mismatch"):
            self.validate(robot_id="other")
        with self.assertRaisesRegex(PermissionError, "device_role_mismatch"):
            self.validate(device_role="leader")
        with self.assertRaisesRegex(PermissionError, "joint_order_invalid"):
            self.validate(joint_names=list(reversed(JOINTS)))
        with self.assertRaisesRegex(PermissionError, "joint_unit_must_be_rad"):
            self.validate(unit="deg")
        with self.assertRaisesRegex(PermissionError, "invalid_joint_value"):
            self.validate(values=[float("nan"), 0, 0, 0, 0, 0])
        bad = list(self.values); bad[0] = LIMITS[JOINTS[0]][1] + 0.01
        with self.assertRaisesRegex(PermissionError, "position_limit"):
            self.validate(values=bad)

    def test_rejects_stale_duplicate_and_velocity_limited_actions(self):
        self.acquire()
        with self.assertRaisesRegex(PermissionError, "stale_command"):
            self.validate(at=self.clock.now - 1)
        self.validate()
        with self.assertRaisesRegex(PermissionError, "stale_or_duplicate_sequence"):
            self.validate(sequence=1)
        self.clock.now += .05
        moved = [0.0] * 6; moved[0] = .2
        with self.assertRaisesRegex(PermissionError, "velocity_limit"):
            self.validate(sequence=2, values=moved)

    def test_execution_ownership_conflict_and_independent_dual_arm_leases(self):
        self.acquire("follower-a", "teleoperation")
        with self.assertRaisesRegex(PermissionError, "execution_owned_by_another_source"):
            self.acquire("follower-a", "MQTT")
        with self.assertRaisesRegex(PermissionError, "execution_already_active"):
            self.acquire("follower-a", "teleoperation")
        self.acquire("follower-b", "teleoperation")
        self.assertEqual(set(self.safety.status()["owners"]), {"follower-a", "follower-b"})

    def test_estop_is_global_latched_and_reset_does_not_rearm(self):
        self.acquire()
        stopped = self.safety.emergency_stop()
        self.assertEqual(stopped["state"], "ESTOPPED")
        with self.assertRaisesRegex(PermissionError, "estop_latched"):
            self.acquire()
        with self.assertRaisesRegex(PermissionError, "explicit_estop_reset_required"):
            self.safety.reset_emergency_stop(False)
        reset = self.safety.reset_emergency_stop(True)
        self.assertFalse(reset["emergencyStopLatched"])
        self.assertEqual(reset["state"], "READY")
        self.assertIsNone(reset["activeControlSource"])

    def test_estop_rejects_before_the_sink_is_called(self):
        self.acquire()
        self.safety.emergency_stop()
        calls = []
        with self.assertRaisesRegex(PermissionError, "estop_latched"):
            self.validate(sink=lambda: calls.append("write"))
        self.assertEqual(calls, [])

    def test_watchdog_disconnect_and_runtime_shutdown_fail_closed(self):
        self.acquire()
        self.validate()
        self.clock.now += .21
        status = self.safety.status()
        self.assertEqual(status["state"], "FAULT")
        self.assertEqual(status["fault"], "command_watchdog_timeout")
        self.safety.reconnect()
        self.assertEqual(self.safety.status()["owners"], {})
        self.safety.disconnect("runtime_shutdown")
        self.assertEqual(self.safety.status()["state"], "DISCONNECTED")
        self.assertFalse(self.safety.mqtt_ready())

    def test_runtime_heartbeat_timeout_clears_ownership(self):
        heartbeat = LocalSafetyController(clock=self.clock, heartbeat_timeout=.1)
        heartbeat.acquire("arm-a", "teleoperation", robot_id="arm-a")
        self.clock.now += .11
        status = heartbeat.status()
        self.assertEqual(status["state"], "FAULT")
        self.assertEqual(status["watchdog"], "FAULT")
        self.assertEqual(status["owners"], {})


if __name__ == "__main__": unittest.main()
