import unittest
import time

from edge.teleoperation import JOINTS, LIMITS, MAX_INPUT_AGE, Teleoperation
from edge.runtime import EdgeRuntime


class FakeClock:
    def __init__(self):
        self.monotonic_value = 100.0
        self.wall_value = 1_800_000_000.0

    def monotonic(self):
        return self.monotonic_value

    def wall(self):
        return self.wall_value

    def advance(self, seconds):
        self.monotonic_value += seconds
        self.wall_value += seconds


class TeleoperationTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.teleop = Teleoperation(self.clock.monotonic, self.clock.wall)
        self.pair = self.teleop.pairs['pair-a']
        self.teleop.configure('pair-a', 'fake://pair-a/leader', 'fake://pair-a/follower', True)

    def enable_and_hold(self):
        self.teleop.enable('pair-a', True)
        self.teleop.set_deadman('pair-a', True, True)

    def values(self, changed=None):
        values = {name: 0.0 for name in JOINTS}
        if changed:
            values.update(changed)
        return values

    def step(self, sequence=1, changed=None, age=0.0, deadman=True):
        return self.teleop.step('pair-a', self.values(changed), sequence,
                                self.clock.wall() - age, deadman)

    def test_normal_fake_leader_state_maps_to_follower_and_twin_frame(self):
        self.enable_and_hold()
        result = self.step(changed={name: 0.03 for name in JOINTS})
        self.assertTrue(result['accepted'])
        self.assertAlmostEqual(self.pair.follower.commands[-1]['shoulder_pan'], 0.03)
        for name in JOINTS:
            self.assertAlmostEqual(self.pair.follower.commands[-1][name], 0.03)
        frame = result['frame']
        self.assertEqual(frame['robot_id'], 'local-so101-pair-a')
        self.assertEqual(frame['source_mode'], 'SIMULATION')
        self.assertEqual({row['name'] for row in frame['measured']}, set(JOINTS))
        self.assertTrue(all(abs(row['position'] - 0.03) < 1e-9 for row in frame['measured']))
        self.assertFalse(result['status']['physicalOutputEnabled'])

    def test_deadman_released_sends_no_command(self):
        self.teleop.enable('pair-a', True)
        result = self.step(deadman=False)
        self.assertFalse(result['accepted'])
        self.assertEqual(result['reason'], 'deadman_released')
        self.assertEqual(self.pair.command_count, 0)

    def test_emergency_stop_rejects_immediately_and_requires_explicit_reset(self):
        self.enable_and_hold()
        self.assertTrue(self.step().get('accepted'))
        stopped = self.teleop.emergency_stop('pair-a')
        self.assertEqual(stopped['state'], 'STOPPED')
        self.assertTrue(stopped['emergencyStopLatched'])
        result = self.step(sequence=2)
        self.assertFalse(result['accepted'])
        self.assertEqual(result['reason'], 'estop_latched')
        self.assertEqual(self.pair.command_count, 1)
        with self.assertRaises(PermissionError):
            self.teleop.reset_estop('pair-a', False)
        reset = self.teleop.reset_estop('pair-a', True)
        self.assertEqual(reset['state'], 'DISABLED')
        self.assertFalse(reset['enabled'])

    def test_joint_limits_are_rejected_before_fake_follower_command(self):
        self.enable_and_hold()
        result = self.step(changed={'elbow_flex': LIMITS['elbow_flex'][1] + 0.01})
        self.assertFalse(result['accepted'])
        self.assertEqual(result['reason'], 'invalid_input')
        self.assertEqual(self.pair.command_count, 0)
        self.assertEqual(self.pair.status()['state'], 'FAULT')

    def test_stale_input_and_replayed_sequence_are_rejected(self):
        self.enable_and_hold()
        stale = self.step(age=MAX_INPUT_AGE + 0.01)
        self.assertEqual(stale['reason'], 'stale_input')
        self.assertEqual(self.pair.command_count, 0)
        with self.assertRaises(RuntimeError):
            self.teleop.enable('pair-a', True)
        # Reconnect/re-arm after a latched input fault, then prove sequence replay is rejected.
        self.teleop.disconnect('pair-a')
        self.teleop.configure('pair-a', 'fake://pair-a/leader', 'fake://pair-a/follower', True)
        self.enable_and_hold()
        self.assertTrue(self.step(sequence=4).get('accepted'))
        replay = self.step(sequence=4)
        self.assertEqual(replay['reason'], 'stale_sequence')
        self.assertEqual(self.pair.command_count, 1)

    def test_connection_loss_closes_command_path(self):
        self.enable_and_hold()
        self.pair.follower.connected = False
        result = self.step()
        self.assertEqual(result['reason'], 'connection_lost')
        self.assertEqual(self.pair.status()['state'], 'FAULT')
        self.assertEqual(self.pair.command_count, 0)
        self.teleop.disconnect('pair-a')
        reconnected = self.teleop.configure('pair-a', 'fake://pair-a/leader', 'fake://pair-a/follower', True)
        self.assertEqual(reconnected['state'], 'DISABLED')

    def test_pairs_are_isolated_and_duplicate_virtual_port_ownership_is_rejected(self):
        self.enable_and_hold()
        with self.assertRaises(ValueError):
            self.teleop.configure('pair-b', 'fake://pair-a/leader', 'fake://pair-b/follower', True)
        other = self.teleop.configure('pair-b', 'fake://pair-b/leader', 'fake://pair-b/follower', True)
        self.assertEqual(other['pairId'], 'pair-b')
        self.step(changed={'shoulder_pan': 0.03})
        self.assertEqual(self.teleop.pairs['pair-b'].command_count, 0)

    def test_same_leader_and_follower_port_is_rejected(self):
        with self.assertRaises(ValueError):
            self.teleop.configure('pair-b', 'fake://pair-b/same', 'fake://pair-b/same', True)

    def test_non_fake_ports_and_missing_confirmation_are_rejected(self):
        with self.assertRaises(ValueError):
            self.teleop.configure('pair-b', '/dev/ttyUSB0', 'fake://pair-b/follower', True)
        with self.assertRaises(PermissionError):
            self.teleop.configure('pair-b', 'fake://pair-b/leader', 'fake://pair-b/follower', False)

    def test_explicit_disable_clears_deadman_and_requires_reenable(self):
        self.enable_and_hold()
        self.step()
        status = self.teleop.disable('pair-a')
        self.assertEqual(status['state'], 'DISABLED')
        self.assertFalse(status['enabled'])
        self.assertFalse(status['deadmanHeld'])
        self.assertEqual(self.step(sequence=2)['reason'], 'not_armed')
        self.assertEqual(self.pair.command_count, 1)

    def test_reconnect_starts_disabled_and_requires_rearming(self):
        self.enable_and_hold()
        self.step()
        self.teleop.disconnect('pair-a')
        state = self.teleop.configure('pair-a', 'fake://pair-a/leader', 'fake://pair-a/follower', True)
        self.assertEqual(state['state'], 'DISABLED')
        self.assertFalse(state['enabled'])
        self.assertFalse(state['deadmanHeld'])
        rejected = self.step(sequence=8)
        self.assertFalse(rejected['accepted'])
        self.assertEqual(self.pair.command_count, 0)

    def test_velocity_and_rate_limits_reject_unsafe_command_changes(self):
        self.enable_and_hold()
        self.step()
        rate_limited = self.step(sequence=2)
        self.assertEqual(rate_limited['reason'], 'rate_limited')
        self.clock.advance(0.05)
        too_fast = self.step(sequence=3, changed={'shoulder_pan': 0.10})
        self.assertEqual(too_fast['reason'], 'velocity_limit')
        self.assertEqual(self.pair.command_count, 1)

    def test_deadman_timeout_fails_closed(self):
        self.enable_and_hold()
        self.step()
        self.clock.advance(MAX_INPUT_AGE + 0.001)
        status = self.teleop.status()['pair-a']
        self.assertEqual(status['state'], 'FAULT')
        self.assertEqual(status['fault'], 'deadman_timeout')
        self.assertFalse(status['deadmanHeld'])

    def test_real_watchdog_timer_stops_when_deadman_heartbeat_disappears(self):
        live = Teleoperation()
        live.configure('pair-a', 'fake://pair-a/leader', 'fake://pair-a/follower', True)
        live.enable('pair-a', True)
        live.set_deadman('pair-a', True, True)
        time.sleep(MAX_INPUT_AGE + 0.08)
        self.assertEqual(live.status()['pair-a']['fault'], 'deadman_timeout')
        live.disconnect('pair-a')

    def test_runtime_exposes_fake_teleop_without_enabling_physical_output(self):
        runtime = EdgeRuntime()
        try:
            connected = runtime.handle({'id': '1', 'method': 'teleop_configure', 'params': {
                'pairId': 'pair-a', 'leaderPort': 'fake://pair-a/leader',
                'followerPort': 'fake://pair-a/follower', 'confirmed': True}})
            self.assertEqual(connected['state'], 'DISABLED')
            runtime.handle({'id': '2', 'method': 'teleop_enable', 'params': {'pairId': 'pair-a', 'confirmed': True}})
            runtime.handle({'id': '3', 'method': 'teleop_deadman', 'params': {'pairId': 'pair-a', 'held': True, 'confirmed': True}})
            result = runtime.handle({'id': '4', 'method': 'teleop_step', 'params': {
                'pairId': 'pair-a', 'leader': self.values(), 'sequence': 1,
                'timestamp': time.time(), 'deadmanHeld': True}})
            self.assertTrue(result['accepted'])
            self.assertFalse(result['status']['physicalOutputEnabled'])
            self.assertFalse(runtime.physical.status()['connected'])
        finally:
            runtime.close()

    def test_edge_runtime_has_no_physical_motion_dispatch_method(self):
        runtime = EdgeRuntime()
        try:
            with self.assertRaisesRegex(ValueError, "Method is not supported"):
                runtime.handle({'id': 'physical-motion-probe', 'method': 'physical_move', 'params': {
                    'role': 'follower', 'positions': self.values()}})
            self.assertFalse(runtime.physical.status()['motionEnabled'])
        finally:
            runtime.close()


if __name__ == '__main__':
    unittest.main()
