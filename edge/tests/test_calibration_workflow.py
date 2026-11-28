import time
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from edge.calibration import CalibrationWorkflow


class FakeBus:
    def __init__(self):
        self.motors = {name: type("Motor", (), {"id": index})() for index, name in enumerate(
            ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"), 1
        )}
        self.reads = 0
        self.calls = []

    def disable_torque(self): self.calls.append(("disable_torque",))
    def write(self, register, motor, value): self.calls.append((register, motor, value))
    def reset_calibration(self): self.calls.append(("reset_calibration",))
    def _get_half_turn_homings(self, values): return {name: 0 for name in values}
    def sync_read(self, register, normalize=False):
        self.reads += 1
        value = 1000 + min(max(self.reads - 1, 0) * 100, 300)
        return {name: value for name in self.motors}
    def write_calibration(self, calibration): self.calls.append(("write_calibration", calibration))


class FakeDevice:
    def __init__(self):
        self.bus = FakeBus()
        self.is_connected = False
        self.saved = False
        self.connect_args = []
    def connect(self, calibrate=False):
        self.connect_args.append(calibrate)
        self.is_connected = True
    def _save_calibration(self): self.saved = True
    def disconnect(self): self.is_connected = False


class CalibrationWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.device = FakeDevice()
        self.created = []
        self.workflow = CalibrationWorkflow(
            device_factory=lambda role, port, profile: self.created.append((role, port, profile)) or self.device,
            port_provider=lambda: [{"path": "/dev/fake-so101"}],
            motor_calibration_factory=lambda **values: values,
            position_mode=1,
        )

    def wait_for(self, predicate):
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if predicate(): return
            time.sleep(0.01)
        self.fail("calibration state did not reach the expected state")

    def test_calibration_requires_confirmation_and_a_discovered_port(self):
        with self.assertRaises(PermissionError):
            self.workflow.start("leader", "/dev/fake-so101", "leader-profile", False)
        with self.assertRaises(ValueError):
            self.workflow.start("leader", "/dev/guess", "leader-profile", True)
        self.assertEqual(self.created, [])

    def test_guided_range_recording_saves_only_after_step_confirmation(self):
        started = self.workflow.start("leader", "/dev/fake-so101", "leader-profile", True)
        self.assertTrue(started["active"])
        self.assertEqual(started["deviceState"], "CALIBRATING")
        self.wait_for(lambda: self.workflow.status()["status"] == "recording"
                      and self.device.bus.reads >= 4)
        self.workflow.complete_step()
        self.wait_for(lambda: not self.workflow.status()["active"])
        status = self.workflow.status()
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["deviceState"], "CALIBRATED")
        self.assertTrue(status["calibrated"])
        self.assertFalse(status["motionEnabled"])
        self.assertEqual(self.created, [("leader", "/dev/fake-so101", "leader-profile")])
        self.assertEqual(self.device.connect_args, [False])
        self.assertTrue(self.device.saved)
        self.assertFalse(self.device.is_connected)
        self.assertIn(("disable_torque",), self.device.bus.calls)

    def test_stopping_range_recording_does_not_mark_profile_calibrated(self):
        self.workflow.start("follower", "/dev/fake-so101", "follower-profile", True)
        self.wait_for(lambda: self.workflow.status()["status"] == "recording")
        status = self.workflow.stop()
        self.assertFalse(status["active"])
        self.assertEqual(status["status"], "cancelled")
        self.assertFalse(status["calibrated"])
        self.assertEqual(status["deviceState"], "DISCONNECTED")
        self.assertFalse(self.device.saved)

    def test_every_calibration_bus_write_uses_authorization_callback(self):
        authorized = []
        def authorize(operation):
            authorized.append(operation)
            if operation.startswith("Homing_Offset:"):
                raise PermissionError("maintenance authorization revoked")
        workflow = CalibrationWorkflow(
            device_factory=lambda *_: self.device,
            port_provider=lambda: [{"path": "/dev/fake-so101"}],
            motor_calibration_factory=lambda **values: values,
            position_mode=1, write_authorizer=authorize,
        )
        workflow.start("follower", "/dev/fake-so101", "follower-a", True)
        deadline = time.monotonic() + 2
        while workflow.status()["active"] and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertFalse(workflow.status()["active"])
        self.assertEqual(workflow.status()["status"], "error")
        self.assertIn("reset_calibration", authorized)
        self.assertTrue(any(item.startswith("Homing_Offset:") for item in authorized))
        self.assertFalse(any(call[0] == "Homing_Offset" for call in self.device.bus.calls))
        self.assertFalse(self.device.saved)

    def test_calibration_slot_must_match_role(self):
        with self.assertRaises(ValueError):
            self.workflow.start("leader", "/dev/fake-so101", "leader-profile", True, "follower-b")
        self.assertEqual(self.workflow.status()["deviceState"], "DISCONNECTED")

    def test_profile_listing_is_role_scoped_and_ignores_symlinks(self):
        with tempfile.TemporaryDirectory(prefix="vista-calibration-profiles-") as directory, patch.dict(
            os.environ, {"HF_LEROBOT_CALIBRATION": directory}
        ):
            leader_dir = Path(directory) / "teleoperators" / "so_leader"
            follower_dir = Path(directory) / "robots" / "so_follower"
            leader_dir.mkdir(parents=True)
            follower_dir.mkdir(parents=True)
            (leader_dir / "leader-a.json").write_text("{}")
            (follower_dir / "follower-a.json").write_text("{}")
            (leader_dir / "external.json").symlink_to(follower_dir / "follower-a.json")
            self.assertEqual([item["id"] for item in CalibrationWorkflow.profiles("leader")["items"]], ["leader-a"])
            self.assertEqual([item["id"] for item in CalibrationWorkflow.profiles("follower")["items"]], ["follower-a"])
            leader_profile = CalibrationWorkflow.profiles("leader")["items"][0]
            self.assertFalse(leader_profile["valid"])
            self.assertIn("six SO-101", leader_profile["error"])

    def test_calibration_never_overwrites_existing_profile(self):
        with tempfile.TemporaryDirectory(prefix="vista-calibration-protect-") as directory, patch.dict(
            os.environ, {"HF_LEROBOT_CALIBRATION": directory}
        ):
            profile = Path(directory) / "teleoperators" / "so_leader" / "leader-a.json"
            profile.parent.mkdir(parents=True)
            profile.write_text('{"owner":"existing"}')
            before = profile.read_bytes()
            with self.assertRaisesRegex(FileExistsError, "will not overwrite"):
                self.workflow.start("leader", "/dev/fake-so101", "leader-a", True)
            self.assertEqual(profile.read_bytes(), before)
            self.assertEqual(self.created, [])

    def test_valid_calibration_profile_schema_matches_lerobot_motor_calibration(self):
        import json
        with tempfile.TemporaryDirectory(prefix="vista-calibration-valid-") as directory, patch.dict(
            os.environ, {"HF_LEROBOT_CALIBRATION": directory}
        ):
            profile = Path(directory) / "robots" / "so_follower" / "follower-a.json"
            profile.parent.mkdir(parents=True)
            calibration = {name: {"id": i, "drive_mode": 0, "homing_offset": 0,
                                  "range_min": 100, "range_max": 3900}
                          for i, name in enumerate(("shoulder_pan", "shoulder_lift", "elbow_flex",
                                                   "wrist_flex", "wrist_roll", "gripper"), 1)}
            profile.write_text(json.dumps(calibration))
            item = CalibrationWorkflow.profiles("follower")["items"][0]
            self.assertTrue(item["valid"])
            self.assertIsNone(item["error"])


if __name__ == "__main__":
    unittest.main()
