'use strict';

const MAX_COMMANDS = 200;
const JOINTS = Object.freeze(['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll']);
const LIMITS_DEG = Object.freeze([[-110, 110], [-100, 100], [-100, 100], [-100, 100], [-110, 110]]);
const MAX_STEP_DEG = 3;
const MAX_COMMAND_AGE_MS = 30_000;

class SimulatedSO101 {
  constructor() { this.mode = 'SIMULATION'; this.connected = true; this.joints = [0, -35, 70, -35, 0]; this.gripper = 50; }
  status() { return { mode: this.mode, connected: this.connected, joints: [...this.joints], gripper: this.gripper }; }
  async apply(command) {
    if (command.type === 'gripper.open') this.gripper = 100;
    if (command.type === 'gripper.close') this.gripper = 0;
    if (command.type === 'home') { this.joints = [0, -35, 70, -35, 0]; this.gripper = 50; }
    return this.status();
  }
  async disconnect() { this.connected = false; }
}

class EdgeRobotRuntime {
  constructor({ adapter = new SimulatedSO101(), now = Date.now } = {}) {
    this.adapter = adapter;
    this.now = now;
    this.seen = new Map();
    this.authorizationEpoch = 0;
  }

  status() {
    return { state: 'READY', mode: this.adapter.mode, physicalAvailable: false,
      physicalReason: 'CHECKIK driver packaging and hardware acceptance are not verified.',
      robot: this.adapter.status() };
  }

  revokeAuthorization() { this.authorizationEpoch += 1; this.seen.clear(); }

  async execute({ command, attempt, authorization, confirmation } = {}) {
    if (this.adapter.mode !== 'SIMULATION') throw new Error('Only explicit SIMULATION mode is enabled.');
    if (!attempt || attempt.status !== 'in_progress' || !attempt.id) throw new Error('An active lab attempt is required.');
    if (!authorization || authorization.attemptId !== attempt.id || authorization.allowed !== true || authorization.expiresAt <= this.now()) {
      throw new Error('Lab authorization is missing, mismatched, or expired.');
    }
    if (confirmation !== 'RUN_SIMULATION') throw new Error('Explicit simulation confirmation is required.');
    validateCommand(command, this.now());
    if (this.seen.has(command.id)) throw new Error('Duplicate command rejected.');
    this.seen.set(command.id, this.now());
    for (const [id, at] of this.seen) if (this.now() - at > MAX_COMMAND_AGE_MS) this.seen.delete(id);
    const authorizationEpoch = this.authorizationEpoch;
    for (const step of command.steps) {
      if (authorizationEpoch !== this.authorizationEpoch || authorization.expiresAt <= this.now()) throw new Error('Authorization was revoked or expired.');
      if (!this.adapter.connected) throw new Error('Robot adapter disconnected.');
      if (step.type === 'wait') {
        const until = this.now() + step.durationMs;
        while (this.now() < until) {
          if (authorizationEpoch !== this.authorizationEpoch || authorization.expiresAt <= this.now()) throw new Error('Authorization was revoked or expired.');
          await new Promise((resolve) => setTimeout(resolve, Math.min(20, until - this.now())));
        }
      }
      else await this.adapter.apply(step);
    }
    return { ok: true, commandId: command.id, mode: 'SIMULATION', result: this.adapter.status() };
  }
}

function validateCommand(command, now) {
  if (!command || typeof command !== 'object' || !/^[A-Za-z0-9_-]{8,80}$/.test(command.id || '') ||
      !Number.isFinite(command.expiresAt) || command.expiresAt <= now || command.expiresAt > now + MAX_COMMAND_AGE_MS ||
      !Array.isArray(command.steps) || command.steps.length < 1 || command.steps.length > MAX_COMMANDS) {
    throw new Error('Command schema or expiry is invalid.');
  }
  let waitTotal = 0;
  for (const step of command.steps) {
    if (!step || !['arm.select', 'home', 'gripper.open', 'gripper.close', 'wait'].includes(step.type)) throw new Error('Command step type is not supported by the local simulation adapter.');
    if (step.type === 'arm.select' && !['left', 'right'].includes(step.arm)) throw new Error('Arm selection is invalid.');
    if (['home', 'gripper.open', 'gripper.close'].includes(step.type) && step.arm !== undefined && !['left', 'right'].includes(step.arm)) throw new Error('Arm selection is invalid.');
    if (step.type === 'wait') {
      if (!Number.isInteger(step.durationMs) || step.durationMs < 0 || step.durationMs > 5000) throw new Error('Wait duration is invalid.');
      waitTotal += step.durationMs;
    }
  }
  if (waitTotal > 15_000) throw new Error('Simulation wait budget exceeded.');
}

module.exports = { EdgeRobotRuntime, SimulatedSO101, validateCommand, JOINTS, LIMITS_DEG };
