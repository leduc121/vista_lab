'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EdgeRobotRuntime } = require('../robot-runtime');

const attempt = { id: 'attempt-123', status: 'in_progress' };
const command = (id = 'command-123') => ({ id, expiresAt: Date.now() + 5000, steps: [
  { type: 'arm.select', arm: 'left' },
  { type: 'gripper.open', arm: 'left' },
  { type: 'gripper.close', arm: 'left' }
] });
const authorized = { attemptId: attempt.id, allowed: true, expiresAt: Date.now() + 5000 };

test('simulated execution requires active attempt, backend authorization and explicit confirmation', async () => {
  const runtime = new EdgeRobotRuntime();
  await assert.rejects(runtime.execute({ command: command(), attempt, authorization: authorized, confirmation: '' }), /confirmation/);
  await assert.rejects(runtime.execute({ command: command(), attempt: { ...attempt, status: 'submitted' }, authorization: authorized, confirmation: 'RUN_SIMULATION' }), /active lab attempt/);
  await assert.rejects(runtime.execute({ command: command(), attempt, authorization: { ...authorized, allowed: false }, confirmation: 'RUN_SIMULATION' }), /authorization/);
  const result = await runtime.execute({ command: command(), attempt, authorization: authorized, confirmation: 'RUN_SIMULATION' });
  assert.equal(result.mode, 'SIMULATION');
  assert.equal(result.result.gripper, 0);
});

test('duplicate, expired, malformed and unsafe commands fail closed', async () => {
  const runtime = new EdgeRobotRuntime();
  const args = (value) => ({ command: value, attempt, authorization: authorized, confirmation: 'RUN_SIMULATION' });
  const first = command();
  await runtime.execute(args(first));
  await assert.rejects(runtime.execute(args(first)), /Duplicate/);
  await assert.rejects(runtime.execute(args({ ...command('expired-01'), expiresAt: Date.now() - 1 })), /schema or expiry/);
  await assert.rejects(runtime.execute(args({ ...command('unsupported'), steps: [{ type: 'preview.move_xyz', position: { x: 1, y: 2, z: 3 } }] })), /not supported/);
  await assert.rejects(runtime.execute(args({ ...command('invalid-wait'), steps: [{ type: 'wait', durationMs: 99_999 }] })), /Wait duration/);
});

test('physical mode is never enabled by runtime configuration', async () => {
  const runtime = new EdgeRobotRuntime({ adapter: { mode: 'PHYSICAL ROBOT', connected: true, status: () => ({}), apply: async () => {} } });
  assert.equal(runtime.status().physicalAvailable, false);
  await assert.rejects(runtime.execute({ command: command(), attempt, authorization: authorized, confirmation: 'RUN_SIMULATION' }), /Only explicit SIMULATION/);
});

test('authorization revocation interrupts an in-progress bounded wait', async () => {
  const runtime = new EdgeRobotRuntime();
  const pending = runtime.execute({
    attempt,
    authorization: { ...authorized, expiresAt: Date.now() + 10_000 },
    confirmation: 'RUN_SIMULATION',
    command: { id: 'wait-command', expiresAt: Date.now() + 10_000, steps: [{ type: 'wait', durationMs: 500 }] }
  });
  setTimeout(() => runtime.revokeAuthorization(), 50);
  await assert.rejects(pending, /revoked/);
});
