'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { EdgeSupervisor } = require('../edge-supervisor');

test('Electron supervisor exchanges health/status with local Python process and shuts it down', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-edge-supervisor-'));
  const supervisor = new EdgeSupervisor({ app: { isPackaged: false }, logPath: path.join(temp, 'edge.log') });
  try {
    assert.equal(supervisor.start(), true);
    const result = await supervisor.diagnostics();
    assert.ok(['READY', 'ACTION REQUIRED'].includes(result.state));
    assert.equal(result.health.mode, 'SIMULATION');
    assert.equal(result.health.version, '0.1.0');
    assert.equal(result.status.motionEnabled, false);
    await assert.rejects(supervisor.request('joint_state'), /physical SO-101 arm is disconnected/i);
  } finally {
    await supervisor.stop();
    fs.rmSync(temp, { recursive: true, force: true });
  }
  assert.equal(supervisor.child, null);
});

test('packaged runtime missing is a closed diagnostic state', async () => {
  const supervisor = new EdgeSupervisor({ app: { isPackaged: true }, platform: 'invalid' });
  assert.equal(supervisor.start(), false);
  const result = await supervisor.diagnostics();
  assert.equal(result.state, 'BLOCKED');
  assert.match(result.error, /missing/i);
  await supervisor.stop();
});

test('robotics profile is not ready until the physical follower is connected and calibrated', async () => {
  const supervisor = new EdgeSupervisor({ app: { isPackaged: false }, runtimeProfile: 'robotics' });
  supervisor.request = async (method) => method === 'health'
    ? { version: '0.1.0', drivers: { lerobot: true, pyserial: true }, simulation: { available: true } }
    : { arms: { 'follower-a': { adapterMode: 'so101_follower', connected: false, calibrated: false } } };
  const disconnected = await supervisor.diagnostics();
  assert.equal(disconnected.state, 'ACTION REQUIRED');
  assert.equal(disconnected.profileReady, false);
  assert.equal(disconnected.physicalFollowerReady, false);

  supervisor.request = async (method) => method === 'health'
    ? { version: '0.1.0', drivers: { lerobot: true, pyserial: true }, simulation: { available: true } }
    : { arms: { 'follower-a': { adapterMode: 'so101_follower', connected: true, calibrated: true } } };
  const connected = await supervisor.diagnostics();
  assert.equal(connected.profileReady, true);
  assert.equal(connected.physicalFollowerReady, true);
});
