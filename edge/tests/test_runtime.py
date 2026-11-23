import io
import json
import subprocess
import sys
import unittest
from types import SimpleNamespace
from pathlib import Path

from edge.runtime import EdgeRuntime, RUNTIME_VERSION, serve


class FakePhysical:
    mode = "PHYSICAL ROBOT READ ONLY"

    def __init__(self):
        self.connected = False
        self.calls = []

    def ports(self):
        return [{"path": "/dev/test-serial", "likelyRobot": True}]

    def status(self):
        return {"mode": self.mode, "connected": self.connected, "calibrated": False, "motionEnabled": False}

    def connect(self, port, device_id):
        self.calls.append((port, device_id))
        self.connected = True
        return self.status()

    def disconnect(self):
        self.connected = False
        return self.status()

    def joint_state(self):
        return {"measured": True, "joints": {}}


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.physical = FakePhysical()
        self.runtime = EdgeRuntime(physical=self.physical)

    def test_health_and_status_are_separate_simulation_from_physical(self):
        health = self.runtime.handle({"id": "health", "method": "health"})
        status = self.runtime.handle({"id": "status", "method": "status"})
        self.assertEqual(health["version"], RUNTIME_VERSION)
        self.assertEqual(health["mode"], "SIMULATION")
        self.assertIn("mujoco", health["drivers"])
        self.assertEqual(status["physical"]["mode"], "PHYSICAL ROBOT READ ONLY")
        self.assertFalse(status["motionEnabled"])

    def test_fixture_policy_runs_through_mujoco_and_emits_twin_telemetry(self):
        class FixturePolicy:
            config = SimpleNamespace(input_features={"observation.state": SimpleNamespace(shape=(6,))})
            def validate_metadata(self, _record): pass
            def act(self, _observation, prompt=None):
                self.prompt = prompt
                return {"jointPositions": [0, -0.55, 1.05, -0.5, 0, -0.1], "unit": "rad",
                        "jointNames": ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]}
            def reset(self): pass
            def unload(self): pass

        policy = FixturePolicy()
        self.runtime.policies.loader = lambda _record, _device: policy
        self.runtime.policies._items["fixture"] = {
            "policyId": "fixture", "architecture": "act", "supportsPrompt": False,
            "status": "NOT_LOADED", "path": ".",
        }
        self.runtime.policies.load("fixture")
        frames = []
        result = self.runtime.handle({"id": "policy-run", "method": "policy_run",
                                      "params": {"prompt": "ignore this task"}}, on_event=frames.append)
        self.assertIsNone(policy.prompt)
        self.assertFalse(result["promptUsed"])
        self.assertEqual(result["simulation"]["engine"], "MuJoCo")
        self.assertFalse(result["motionEnabled"])
        self.assertGreater(len(frames), 0)
        self.assertEqual(frames[-1]["controller_id"], "local-policy-mujoco")
        self.assertEqual(len(frames[-1]["measured"]), 6)

    def test_physical_connection_requires_mode_confirmation_and_explicit_port(self):
        with self.assertRaises(PermissionError):
            self.runtime.handle({"id": "1", "method": "connect", "params": {"mode": "PHYSICAL ROBOT READ ONLY", "port": "/dev/test-serial", "deviceId": "lab-1"}})
        with self.assertRaises(ValueError):
            self.runtime.handle({"id": "2", "method": "connect", "params": {"mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True, "port": "/dev/guess", "deviceId": "lab-1"}})
        result = self.runtime.handle({"id": "3", "method": "connect", "params": {"mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True, "port": "/dev/test-serial", "deviceId": "lab-1"}})
        self.assertTrue(result["connected"])
        self.assertFalse(result["motionEnabled"])
        self.assertEqual(self.physical.calls, [("/dev/test-serial", "lab-1")])

    def test_leader_and_follower_use_distinct_roles_and_cannot_claim_the_same_port(self):
        ports = self.runtime.handle({"id": "ports", "method": "ports"})
        self.assertEqual(ports["items"], [{"path": "/dev/test-serial", "likelyRobot": True}])
        self.runtime.handle({"id": "follower", "method": "connect", "params": {
            "mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True,
            "role": "follower", "port": "/dev/test-serial", "deviceId": "follower-a"}})
        with self.assertRaises(ValueError):
            self.runtime.handle({"id": "leader", "method": "connect", "params": {
                "mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True,
                "role": "leader", "port": "/dev/test-serial", "deviceId": "leader-a"}})
        self.assertEqual(self.physical.calls, [("/dev/test-serial", "follower-a")])

    def test_calibration_requires_explicit_confirmation_and_discovered_port(self):
        with self.assertRaises(PermissionError):
            self.runtime.handle({"id": "cal", "method": "calibration_start", "params": {
                "role": "leader", "port": "/dev/test-serial", "profileId": "leader-a", "confirmed": False}})
        with self.assertRaises(ValueError):
            self.runtime.handle({"id": "cal2", "method": "calibration_start", "params": {
                "role": "leader", "port": "/dev/guess", "profileId": "leader-a", "confirmed": True}})

    def test_stdio_protocol_reports_errors_and_gracefully_stops(self):
        reader = io.StringIO('\n'.join([
            json.dumps({"id": "a", "method": "health"}),
            json.dumps({"id": "b", "method": "unsupported"}),
            json.dumps({"id": "c", "method": "stop"}),
        ]) + '\n')
        writer = io.StringIO()
        serve(self.runtime, reader, writer)
        responses = [json.loads(line) for line in writer.getvalue().splitlines()]
        self.assertEqual([row["id"] for row in responses], ["a", "b", "c"])
        self.assertTrue(responses[0]["ok"])
        self.assertFalse(responses[1]["ok"])
        self.assertFalse(self.physical.connected)

    def test_electron_style_child_process_exchange_without_hardware(self):
        root = Path(__file__).resolve().parents[2]
        requests = "\n".join(json.dumps({"id": str(index), "method": method}) for index, method in enumerate(("health", "status", "stop"))) + "\n"
        result = subprocess.run(
            [sys.executable, str(root / "edge" / "runtime.py")],
            input=requests,
            text=True,
            capture_output=True,
            timeout=10,
            check=True,
        )
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(len(responses), 3)
        self.assertTrue(all(row["ok"] for row in responses))
        self.assertEqual(responses[0]["result"]["mode"], "SIMULATION")
        self.assertFalse(responses[1]["result"]["motionEnabled"])


if __name__ == "__main__":
    unittest.main()
