'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const vm = require('node:vm');

test('Edge JSON-lines fake teleoperation drives only Twin simulation feedback and e-stop blocks follow-up', async () => {
  const root = path.resolve(__dirname, '..');
  const child = spawn(process.env.VISTA_EDGE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    [path.join(root, 'edge', 'runtime.py')], {
      cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONPATH: root }
    });
  const exited = once(child, 'exit');
  const lines = readline.createInterface({ input: child.stdout });
  let pending = null;
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-5000); });
  lines.on('line', (line) => {
    let response;
    try { response = JSON.parse(line); } catch { return; }
    if (!pending || response.id !== pending.id) return;
    clearTimeout(pending.timer);
    pending.resolve(response);
    pending = null;
  });
  child.on('exit', (code, signal) => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.reject(new Error(`Edge runtime exited before replying (code=${code}, signal=${signal}): ${stderr}`));
    pending = null;
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (pending) return reject(new Error('Only one Edge JSON-lines request may be outstanding in this test.'));
    const id = `${method}-${Date.now()}-${Math.random()}`;
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error(`Timed out waiting for Edge method ${method}: ${stderr}`));
    }, 15000);
    pending = { id, timer, resolve, reject };
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
      if (!error || pending?.id !== id) return;
      clearTimeout(timer);
      pending = null;
      reject(error);
    });
  });
  try {
    const connect = await request('teleop_configure', { pairId: 'pair-a', leaderPort: 'fake://pair-a/leader', followerPort: 'fake://pair-a/follower', confirmed: true });
    assert.equal(connect.ok, true, connect.error);
    const arm = await request('teleop_enable', { pairId: 'pair-a', confirmed: true });
    assert.equal(arm.ok, true, arm.error);
    const deadman = await request('teleop_deadman', { pairId: 'pair-a', held: true, confirmed: true });
    assert.equal(deadman.ok, true, deadman.error);
    const step = await request('teleop_step', {
      pairId: 'pair-a', leader: { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 0 },
      sequence: 1, timestamp: Date.now() / 1000, deadmanHeld: true
    });
    assert.equal(step.result.accepted, true);
    assert.equal(step.result.frame.source_mode, 'SIMULATION');
    assert.equal(step.result.frame.robot_id, 'local-so101-pair-a');
    assert.equal(step.result.frame.measured.length, 6);
    assert.equal(step.result.status.physicalOutputEnabled, false);
    const stop = await request('teleop_estop', { pairId: 'pair-a' });
    assert.equal(stop.result.state, 'STOPPED');
    const blocked = await request('teleop_step', {
      pairId: 'pair-a', leader: { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 0 },
      sequence: 2, timestamp: Date.now() / 1000, deadmanHeld: true
    });
    assert.equal(blocked.result.accepted, false);
    assert.equal(blocked.result.reason, 'estop_latched');
    const shutdown = await request('stop');
    assert.equal(shutdown.result.stopping, true);
    const [code, signal] = await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Edge runtime did not exit after stop.')), 5000))
    ]);
    assert.equal(code, 0, `Edge runtime signal=${signal}: ${stderr}`);
  } finally {
    lines.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
  }
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
