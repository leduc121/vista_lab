import io
import json
import subprocess
import sys
import unittest
from types import SimpleNamespace
from pathlib import Path

from edge.runtime import EdgeRuntime, LeRobotSO101Adapter, RUNTIME_VERSION, normalize_joint_positions, serve, JOINTS


class FakePhysical:
    mode = "PHYSICAL ROBOT READ ONLY"

    def __init__(self, role="follower", slot="follower-a", ports=None):
        self.role = role
        self.slot = slot
        self.available_ports = ports or ["/dev/test-serial"]
        self.connected = False
        self.port = None
        self.calls = []
        self.disconnect_calls = 0

    def ports(self):
        return [{"path": port, "likelyRobot": True} for port in self.available_ports]

    def status(self):
        return {"mode": self.mode, "role": self.role, "slot": self.slot, "port": self.port,
                "connected": self.connected, "calibrated": False, "motionEnabled": False}

    def connect(self, port, device_id):
        self.calls.append((port, device_id))
        self.connected = True
        self.port = port
        return self.status()

    def disconnect(self):
        self.disconnect_calls += 1
        self.connected = False
        self.port = None
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
        self.assertEqual(set(status["arms"]), {"leader-a", "follower-a", "leader-b", "follower-b"})

    def test_four_arm_slots_are_independent_and_serial_ports_are_exclusive(self):
        ports = ["/dev/fake-a", "/dev/fake-b", "/dev/fake-c", "/dev/fake-d"]
        adapters = {
            "leader-a": FakePhysical("leader", "leader-a", ports),
            "follower-a": FakePhysical("follower", "follower-a", ports),
            "leader-b": FakePhysical("leader", "leader-b", ports),
            "follower-b": FakePhysical("follower", "follower-b", ports),
        }
        runtime = EdgeRuntime(physical=adapters["follower-a"], leader=adapters["leader-a"], arms=adapters)
        def connect(slot, port):
            return runtime.handle({"id": slot, "method": "connect", "params": {
                "mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True,
                "role": "leader" if slot.startswith("leader") else "follower",
                "slot": slot, "port": port, "deviceId": slot}})
        connect("leader-a", ports[0])
        connect("follower-a", ports[1])
        with self.assertRaises(ValueError):
            connect("leader-b", ports[0])
        connect("leader-b", ports[2])
        connect("follower-b", ports[3])
        snapshot = runtime.handle({"id": "status", "method": "status"})["arms"]
        self.assertEqual({slot for slot, state in snapshot.items() if state["connected"]}, set(adapters))
        runtime.handle({"id": "disconnect-b", "method": "disconnect", "params": {"slot": "follower-b"}})
        self.assertTrue(adapters["leader-b"].connected)
        self.assertFalse(adapters["follower-b"].connected)

    def test_shutdown_attempts_disconnect_for_every_arm_even_when_one_fails(self):
        ports = ["/dev/fake-a"]
        adapters = {slot: FakePhysical("leader" if slot.startswith("leader") else "follower", slot, ports)
                    for slot in ("leader-a", "follower-a", "leader-b", "follower-b")}
        runtime = EdgeRuntime(physical=adapters["follower-a"], leader=adapters["leader-a"], arms=adapters)
        def fail_disconnect():
            adapters["leader-b"].disconnect_calls += 1
            raise OSError("simulated bus close failure")
        adapters["leader-b"].disconnect = fail_disconnect
        runtime.close()
        self.assertEqual({arm.disconnect_calls for arm in adapters.values()}, {1})

    def test_joint_normalization_requires_all_named_finite_values_and_ignores_order(self):
        reordered = {f"{name}.pos": index + 0.25 for index, name in enumerate(reversed(JOINTS))}
        normalized = normalize_joint_positions(reordered)
        self.assertEqual(list(normalized), list(JOINTS))
        self.assertEqual(normalized[JOINTS[0]], 5.25)
        for invalid in ({}, {**reordered, "gripper.pos": float("nan")}, {**reordered, "gripper.pos": float("inf")}):
            with self.assertRaises(ValueError):
                normalize_joint_positions(invalid)

    def test_leader_reads_public_get_action_and_follower_reads_public_observation(self):
        class FakeLeRobotDevice:
            is_connected = True
            def __init__(self, method): self.method = method
            def get_action(self): return {f"{name}.pos": index for index, name in enumerate(reversed(JOINTS))}
            def get_observation(self): return {name: index + 0.5 for index, name in enumerate(JOINTS)}
            def disconnect(self): self.is_connected = False

        leader = LeRobotSO101Adapter("leader", "leader-a")
        leader.robot = FakeLeRobotDevice("get_action")
        leader.calibration_ready = True
        leader.device_id = "leader-a-id"
        lead_frame = leader.joint_state()
        self.assertEqual(lead_frame["jointNames"], list(JOINTS))
        self.assertEqual(lead_frame["unit"], "deg")
        self.assertEqual(lead_frame["joints"][JOINTS[0]], 5.0)
        self.assertEqual(lead_frame["slot"], "leader-a")

        follower = LeRobotSO101Adapter("follower", "follower-b")
        follower.robot = FakeLeRobotDevice("get_observation")
        follower.calibration_ready = True
        follower_frame = follower.joint_state()
        self.assertEqual(follower_frame["joints"][JOINTS[0]], 0.5)
        self.assertEqual(follower_frame["slot"], "follower-b")

    def test_failed_usb_joint_read_disconnects_and_does_not_reuse_values(self):
        class UnpluggedDevice:
            is_connected = True
            def get_action(self): raise OSError("USB device removed")
            def disconnect(self): self.is_connected = False
        adapter = LeRobotSO101Adapter("leader", "leader-a")
        adapter.robot = UnpluggedDevice()
        adapter.calibration_ready = True
        with self.assertRaisesRegex(ConnectionError, "disconnected after read failure"):
            adapter.joint_state()
        self.assertFalse(adapter.status()["connected"])
        self.assertEqual(adapter.status()["state"], "ERROR")

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
