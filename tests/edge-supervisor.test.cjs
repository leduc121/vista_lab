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
    const state = await supervisor.request('joint_state');
    assert.equal(state.mode, 'SIMULATION');
    assert.equal(state.measured, false);
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
