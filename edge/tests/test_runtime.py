import io
import json
import subprocess
import sys
import unittest
from types import SimpleNamespace
from pathlib import Path

from edge.runtime import EdgeRuntime, LeRobotSO101Adapter, RUNTIME_VERSION, normalize_joint_positions, serve, JOINTS
from edge.safety_controller import LocalSafetyController


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

    def test_mqtt_shadow_state_is_derived_from_safety_and_selected_runtime(self):
        self.runtime._mqtt_config = {"runtimeKind": "SIMULATION"}
        simulation = self.runtime._mqtt_shadow_state()
        self.assertEqual(simulation["adapterMode"], "mujoco")
        self.assertFalse(simulation["hardwareEnabled"])
        self.assertFalse(simulation["armed"])
        self.assertTrue(simulation["calibrationReady"])
        self.assertTrue(simulation["stopped"])
        self.assertIsNone(simulation["activeRunId"])

        self.runtime._mqtt_config = {"runtimeKind": "PHYSICAL_ROBOT"}
        physical = self.runtime._mqtt_shadow_state()
        self.assertEqual(physical["adapterMode"], "so101_follower")
        self.assertFalse(physical["hardwareEnabled"])
        self.assertFalse(physical["calibrationReady"])
        self.assertIsNone(physical["fault"])

        self.runtime._mqtt_config = {"runtimeKind": "SIMULATION"}
        self.runtime.safety.acquire("follower-a", "teleoperation", runtime_kind="SIMULATION",
            robot_id="local-follower-a", calibrated=True, device_role="follower")
        self.runtime.safety.set_continuous("follower-a", "teleoperation", True)
        running = self.runtime._mqtt_shadow_state()
        self.assertTrue(running["armed"])
        self.assertFalse(running["stopped"])

    def test_physical_lerobot_connection_requires_injected_owner_authorization(self):
        calls = []
        class SyntheticFollower:
            is_connected = False
            is_calibrated = True
            def connect(self, calibrate=False):
                calls.append(("connect", calibrate))
                self.is_connected = True
            def disconnect(self):
                calls.append(("disconnect",))
                self.is_connected = False

        def make_adapter():
            return LeRobotSO101Adapter("follower", "follower-a",
                device_factory=lambda *_args: SyntheticFollower(),
                port_provider=lambda: [{"path": "/dev/synthetic"}],
                safe_stop=lambda _robot: "synthetic-stop")
        denied = EdgeRuntime(physical=make_adapter())
        request = {"id": "connect", "method": "connect", "params": {
            "mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True,
            "role": "follower", "slot": "follower-a", "port": "/dev/synthetic", "deviceId": "fake-only"}}
        with self.assertRaisesRegex(PermissionError, "owner authorization"):
            denied.handle(request)
        self.assertEqual(calls, [])
        denied.close()

        approved = EdgeRuntime(physical=make_adapter(), hardware_connect_authorizer=lambda slot: slot == "follower-a")
        connected = approved.handle(request)
        self.assertEqual(connected["adapterMode"], "so101_follower")
        self.assertTrue(connected["connected"])
        self.assertEqual(calls, [("connect", False)])
        approved.close()

    def test_physical_adapter_exposes_only_gated_send_action(self):
        adapter = LeRobotSO101Adapter("follower", "follower-a")
        self.assertTrue(callable(adapter.send_action))
        self.assertFalse(any(callable(getattr(adapter, name, None)) for name in ("apply", "write", "set_action")))
        self.assertFalse(self.runtime.safety.mqtt_ready())

    def test_mock_lerobot_send_action_runs_inside_safety_sink(self):
        from types import SimpleNamespace
        from edge.safety_controller import JOINTS
        from edge.teleoperation import LIMITS, MAX_VELOCITY
        class MockFollower:
            is_connected = True
            def __init__(self): self.actions = []
            def send_action(self, action): self.actions.append(dict(action)); return action
        robot = MockFollower()
        adapter = LeRobotSO101Adapter("follower", "follower-a", position_limits_rad=LIMITS,
                                      velocity_limits_rad=MAX_VELOCITY,
                                      safe_stop=lambda _robot: "mock-safe-stop")
        adapter.robot, adapter.calibration_ready, adapter.device_id = robot, True, "mock-arm"
        safety = LocalSafetyController(fake_robot=False, hardware_enabled=True)
        safety._physical_calibration_ready = True
        safety.acquire("follower-a", "manual-control", runtime_kind="PHYSICAL_ROBOT", robot_id="mock-arm",
                       hardware_authorized=True, calibrated=True)
        def authorize(*, positions_rad, sequence, occurred_at, hardware_authorized, sink):
            return safety.validate_joint_action(resource="follower-a", source="manual-control", robot_id="mock-arm",
                joint_names=JOINTS, positions=positions_rad, unit="rad", position_limits=LIMITS,
                sequence=sequence, occurred_at=occurred_at, runtime_kind="PHYSICAL_ROBOT",
                calibrated=True, hardware_authorized=hardware_authorized,
                velocity_limits=MAX_VELOCITY, sink=sink)
        response = adapter.send_action([0.1, 0.2, -0.1, 0.0, 0.1, 0.0], authorize=authorize,
                                       sequence=1, occurred_at=__import__("time").time(), hardware_authorized=True)
        self.assertTrue(response["accepted"])
        self.assertEqual(len(robot.actions), 1)
        self.assertAlmostEqual(robot.actions[0]["shoulder_pan.pos"], 5.72957795)
        self.assertGreaterEqual(robot.actions[0]["gripper.pos"], 0)
        self.assertLessEqual(robot.actions[0]["gripper.pos"], 100)

    def test_mock_send_action_rejects_without_safety_gate_or_stop_strategy(self):
        from edge.teleoperation import LIMITS
        robot = type("MockFollower", (), {"is_connected": True, "send_action": lambda *_: self.fail("write bypassed safety")})()
        adapter = LeRobotSO101Adapter("follower", "follower-a", position_limits_rad=LIMITS)
        adapter.robot, adapter.calibration_ready = robot, True
        with self.assertRaisesRegex(PermissionError, "Verified position/velocity limits"):
            adapter.send_action([0.0] * 6, authorize=None, sequence=1,
                                occurred_at=__import__("time").time(), hardware_authorized=True)

    def test_dual_physical_teleop_wiring_uses_pair_specific_leader_and_follower_safety_lease(self):
        from edge.teleoperation import LIMITS, MAX_VELOCITY
        from edge.safety_controller import LocalSafetyController
        class MockRobot:
            is_connected = True
            def __init__(self, leader=False): self.actions = []; self.leader = leader
            def get_action(self): return {f"{name}.pos": 0.0 for name in JOINTS}
            def send_action(self, action): self.actions.append(dict(action)); return action
        adapters = {}
        robots = {}
        for pair, leader_slot, follower_slot in (("a", "leader-a", "follower-a"), ("b", "leader-b", "follower-b")):
            leader, follower = LeRobotSO101Adapter("leader", leader_slot), LeRobotSO101Adapter("follower", follower_slot,
                position_limits_rad=LIMITS, velocity_limits_rad=MAX_VELOCITY, safe_stop=lambda _robot: True)
            leader.robot, follower.robot = MockRobot(True), MockRobot()
            leader.device_id, follower.device_id = f"mock-leader-{pair}", f"mock-follower-{pair}"
            leader.port, follower.port = f"leader-{pair}", f"follower-{pair}"
            leader.calibration_ready = follower.calibration_ready = True
            adapters[leader_slot], adapters[follower_slot] = leader, follower
            robots[follower_slot] = follower.robot
        runtime = EdgeRuntime(arms=adapters, hardware_authorizer=lambda _slot: True)
        runtime.safety = LocalSafetyController(fake_robot=False, hardware_enabled=True)
        runtime.safety._physical_calibration_ready = True
        for pair, follower_slot in (("pair-a", "follower-a"), ("pair-b", "follower-b")):
            runtime.handle({"id": pair, "method": "physical_teleop_start", "params": {"pairId": pair, "confirmed": True}})
            response = runtime.handle({"id": pair + "-step", "method": "physical_teleop_step", "params": {
                "pairId": pair, "sequence": 1, "occurredAt": __import__("time").time(), "deadman": True}})
            self.assertEqual(response["state"], "EXECUTING")
            self.assertEqual(len(robots[follower_slot].actions), 1)
            runtime.handle({"id": pair + "-stop", "method": "physical_teleop_stop", "params": {"pairId": pair}})
        self.assertEqual(set(runtime.safety.status()["owners"]), set())

    def test_physical_teleop_fails_closed_with_default_hardware_policy(self):
        class MockRobot:
            is_connected = True
        for slot, role in (("leader-a", "leader"), ("follower-a", "follower")):
            adapter = LeRobotSO101Adapter(role, slot)
            adapter.robot, adapter.calibration_ready, adapter.device_id = MockRobot(), True, slot
            if role == "follower":
                from edge.teleoperation import LIMITS, MAX_VELOCITY
                adapter.position_limits_rad, adapter.velocity_limits_rad = LIMITS, MAX_VELOCITY
                adapter.safe_stop_handler = lambda _robot: True
            self.runtime.arms[slot] = adapter
        self.runtime._hardware_authorizer = lambda _slot: True
        with self.assertRaisesRegex(PermissionError, "hardware_disabled|hardware_not_authorized"):
            self.runtime.handle({"id": "physical-arm", "method": "physical_teleop_start", "params": {
                "pairId": "pair-a", "confirmed": True}})

    def test_serial_read_disconnect_latches_shared_emergency_stop(self):
        self.runtime.handle({"id": "connect", "method": "connect", "params": {
            "mode": "PHYSICAL ROBOT READ ONLY", "confirmed": True, "role": "follower",
            "slot": "follower-a", "port": "/dev/test-serial", "deviceId": "follower-a"}})
        def fail_read():
            self.physical.connected = False
            raise ConnectionError("USB removed")
        self.physical.joint_state = fail_read
        with self.assertRaisesRegex(ConnectionError, "USB removed"):
            self.runtime.handle({"id": "read", "method": "joint_state", "params": {"role": "follower", "slot": "follower-a"}})
        safety = self.runtime.handle({"id": "safety", "method": "safety_status"})
        self.assertTrue(safety["emergencyStopLatched"])
        self.assertEqual(safety["state"], "ESTOPPED")

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
            "policyId": "fixture", "architecture": "act", "providerKind": "MOCK_MODEL", "supportsPrompt": False,
            "status": "NOT_LOADED", "path": ".",
        }
        self.runtime.policies.load("fixture")
        frames = []
        result = self.runtime.handle({"id": "policy-run", "method": "policy_run",
                                      "params": {"prompt": "ignore this task", "experiment": {"experimentId": "123e4567-e89b-42d3-a456-426614174000"}}}, on_event=frames.append)
        self.assertIsNone(policy.prompt)
        self.assertFalse(result["promptUsed"])
        self.assertEqual(result["simulation"]["engine"], "MuJoCo")
        self.assertFalse(result["motionEnabled"])
        self.assertEqual(result["providerKind"], "MOCK_MODEL")
        self.assertEqual(result["experiment"]["experimentId"], "123e4567-e89b-42d3-a456-426614174000")
        self.assertGreaterEqual(result["inferenceLatencyMs"], 0)
        self.assertGreater(len(frames), 0)
        self.assertEqual(frames[-1]["controller_id"], "local-policy-mujoco")
        self.assertEqual(len(frames[-1]["measured"]), 6)
        safety = self.runtime.handle({"id": "safety", "method": "safety_status"})
        self.assertEqual(safety["state"], "READY")
        self.assertIsNone(safety["activeControlSource"])
        self.assertEqual(safety["lastEvent"], "VLA released on local-so101-simulation")

    def test_runtime_fake_teleoperation_uses_shared_gate_and_global_latched_estop(self):
        self.runtime.handle({"id": "configure", "method": "teleop_configure", "params": {
            "pairId": "pair-a", "leaderPort": "fake://pair-a/leader", "followerPort": "fake://pair-a/follower", "confirmed": True}})
        self.runtime.handle({"id": "configure-b", "method": "teleop_configure", "params": {
            "pairId": "pair-b", "leaderPort": "fake://pair-b/leader", "followerPort": "fake://pair-b/follower", "confirmed": True}})
        self.runtime.handle({"id": "enable", "method": "teleop_enable", "params": {"pairId": "pair-a", "confirmed": True}})
        self.runtime.handle({"id": "enable-b", "method": "teleop_enable", "params": {"pairId": "pair-b", "confirmed": True}})
        self.runtime.handle({"id": "deadman", "method": "teleop_deadman", "params": {"pairId": "pair-a", "held": True, "confirmed": True}})
        safety = self.runtime.handle({"id": "status", "method": "safety_status"})
        self.assertEqual(safety["state"], "EXECUTING")
        self.assertEqual(safety["activeControlSource"], "teleoperation")
        self.assertEqual(set(safety["owners"]), {"follower-a", "follower-b"})
        with self.assertRaisesRegex(PermissionError, "execution_owned_by_another_source"):
            self.runtime.safety.acquire("follower-a", "MQTT", runtime_kind="SIMULATION", robot_id="local-follower-a")
        stopped = self.runtime.handle({"id": "estop", "method": "safety_estop"})
        self.assertEqual(stopped["state"], "ESTOPPED")
        self.assertTrue(stopped["emergencyStopLatched"])
        with self.assertRaisesRegex(PermissionError, "emergency stop"):
            self.runtime.handle({"id": "arm-blocked", "method": "teleop_enable", "params": {"pairId": "pair-a", "confirmed": True}})
        reset = self.runtime.handle({"id": "reset", "method": "safety_reset", "params": {"confirmed": True}})
        self.assertFalse(reset["emergencyStopLatched"])
        self.assertEqual(reset["state"], "READY")
        self.assertIsNone(reset["activeControlSource"])
        self.runtime.handle({"id": "rearm", "method": "teleop_enable", "params": {"pairId": "pair-a", "confirmed": True}})
        self.assertEqual(self.runtime.handle({"id": "after-rearm", "method": "safety_status"})["state"], "ARMED")
        self.runtime.close()
        self.assertEqual(self.runtime.handle({"id": "closed-state", "method": "safety_status"})["state"], "ESTOPPED")

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
        with self.assertRaisesRegex(PermissionError, "hardware_disabled"):
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
