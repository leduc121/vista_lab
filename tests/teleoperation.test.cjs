'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Edge JSON-lines fake teleoperation drives only Twin simulation feedback and e-stop blocks follow-up', () => {
  const root = path.resolve(__dirname, '..');
  const methods = [
    { id: 'connect', method: 'teleop_configure', params: { pairId: 'pair-a', leaderPort: 'fake://pair-a/leader', followerPort: 'fake://pair-a/follower', confirmed: true } },
    { id: 'arm', method: 'teleop_enable', params: { pairId: 'pair-a', confirmed: true } },
    { id: 'hold', method: 'teleop_deadman', params: { pairId: 'pair-a', held: true, confirmed: true } },
    { id: 'step', method: 'teleop_step', params: { pairId: 'pair-a', leader: { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 0 }, sequence: 1, timestamp: Date.now() / 1000, deadmanHeld: true } },
    { id: 'stop', method: 'teleop_estop', params: { pairId: 'pair-a' } },
    { id: 'blocked', method: 'teleop_step', params: { pairId: 'pair-a', leader: { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 0 }, sequence: 2, timestamp: Date.now() / 1000, deadmanHeld: true } },
    { id: 'shutdown', method: 'stop', params: {} }
  ];
  const run = spawnSync(process.env.VISTA_EDGE_PYTHON || 'python3', [path.join(root, 'edge', 'runtime.py')], {
    cwd: root, input: methods.map((item) => JSON.stringify(item)).join('\n') + '\n',
    encoding: 'utf8', timeout: 10000, env: { ...process.env, PYTHONPATH: root }
  });
  assert.equal(run.status, 0, run.stderr);
  const rows = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(rows.length, methods.length);
  assert.equal(rows[3].result.accepted, true);
  assert.equal(rows[3].result.frame.source_mode, 'SIMULATION');
  assert.equal(rows[3].result.frame.robot_id, 'local-so101-pair-a');
  assert.equal(rows[3].result.frame.measured.length, 6);
  assert.equal(rows[3].result.status.physicalOutputEnabled, false);
  assert.equal(rows[4].result.state, 'STOPPED');
  assert.equal(rows[5].result.accepted, false);
  assert.equal(rows[5].result.reason, 'estop_latched');
  assert.equal(rows[6].result.stopping, true);
});

test('physical motion lock has a dedicated state and Electron exposes no physical motion IPC channel', () => {
  const root = path.resolve(__dirname, '..');
  const renderer = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const smoke = fs.readFileSync(path.join(root, 'scripts', 'desktop-smoke.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  assert.match(renderer, /data-physical-motion-lock': 'disabled'/);
  assert.match(smoke, /\[data-physical-motion-lock\]/);
  assert.match(smoke, /primaryAction\?\.label\.includes\('Connect fake pair'\)/);
  assert.doesNotMatch(smoke, /robot-teleop-panel button\.primary', \(button\) => button\.disabled/);
  for (const source of [main, preload]) {
    assert.doesNotMatch(source, /(?:edge|robot):(?:physical-command|move|actuate|follower-command)/i);
  }
  assert.match(main, /mode: 'PHYSICAL ROBOT READ ONLY'/);
});

test('Chromium Demo fake adapter follows isolated connect, arm, deadman, stop, and reset states', async () => {
  const root = path.resolve(__dirname, '..');
  const sandbox = { window: {}, setTimeout, clearTimeout, Date };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'dev', 'shim.js'), 'utf8'), sandbox);
  const demo = sandbox.window.vista;
  const disconnected = await demo.teleopStatus();
  assert.equal(disconnected['pair-a'].state, 'DISCONNECTED');
  assert.equal(disconnected['pair-b'].state, 'DISCONNECTED');
  assert.equal(disconnected['pair-a'].physicalOutputEnabled, false);
  await assert.rejects(demo.teleopDeadman('pair-a', true, true), /not safely armed/i);

  const connected = await demo.teleopConfigurePair('pair-a', true);
  assert.equal(connected.state, 'DISABLED');
  assert.equal((await demo.teleopStatus())['pair-b'].state, 'DISCONNECTED');
  assert.equal((await demo.teleopEnable('pair-a', true)).state, 'ARMED');
  await demo.teleopDeadman('pair-a', true, true);
  const now = Date.now() / 1000;
  const leader = { shoulder_pan: 0.1, shoulder_lift: 0.2, elbow_flex: 0.3, wrist_flex: 0.4, wrist_roll: 0.5, gripper: 0.6 };
  const accepted = await demo.teleopStep({ pairId: 'pair-a', leader, sequence: 1, timestamp: now, deadmanHeld: true });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.status.state, 'ACTIVE');
  assert.equal(accepted.status.physicalOutputEnabled, false);
  assert.equal(accepted.frame.source_mode, 'SIMULATION');
  assert.equal(accepted.frame.measured.length, 6);
  assert.equal((await demo.teleopDeadman('pair-a', false, true)).state, 'ARMED');
  assert.equal((await demo.teleopEmergencyStop('pair-a')).state, 'STOPPED');
  assert.equal((await demo.teleopStep({ pairId: 'pair-a', leader, sequence: 2, timestamp: Date.now() / 1000, deadmanHeld: true })).accepted, false);
  assert.equal((await demo.teleopReset('pair-a', true)).state, 'DISABLED');
  assert.equal((await demo.teleopStatus())['pair-b'].state, 'DISCONNECTED');
  await demo.teleopDisconnect('pair-a');
});
