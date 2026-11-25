'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];

class PolicyActionRecorder {
  constructor(userDataPath) {
    this.root = path.join(userDataPath, 'recordings', 'vla-actions');
    this.file = path.join(this.root, 'actions.ndjson');
  }

  record(result, instruction = '', experiment = {}) {
    if (!result || result.motionEnabled !== false || result.simulation?.mode !== 'SIMULATION') {
      throw new Error('Only validated simulation proposals can be recorded by the VLA action recorder.');
    }
    const proposal = result.action;
    if (!proposal || proposal.unit !== 'rad' || !Array.isArray(proposal.jointNames) ||
        proposal.jointNames.length !== JOINTS.length || proposal.jointNames.some((name, i) => name !== JOINTS[i]) ||
        !Array.isArray(proposal.jointPositions) || proposal.jointPositions.length !== JOINTS.length ||
        proposal.jointPositions.some((value) => !Number.isFinite(value))) {
      throw new Error('VLA proposal does not match the validated six-joint SO-101 contract.');
    }
    if (typeof instruction !== 'string' || instruction.length > 1000) throw new Error('VLA instruction is invalid.');
    const observation = result.observationSummary;
    if (!observation || !Array.isArray(observation.jointNames) || observation.jointNames.some((name, i) => name !== JOINTS[i]) ||
        !Array.isArray(observation.jointPositionsRad) || observation.jointPositionsRad.length !== JOINTS.length ||
        observation.jointPositionsRad.some((value) => !Number.isFinite(value)) || !Array.isArray(observation.imageViews) ||
        observation.imageViews.some((key) => !['observation.images.top','observation.images.front','observation.images.right','observation.images.wrist'].includes(key))) {
      throw new Error('VLA observation summary is invalid.');
    }
    const allowedContext = ['experimentId', 'attemptId', 'episodeId'];
    if (!experiment || typeof experiment !== 'object' || Array.isArray(experiment) ||
        Object.keys(experiment).some((key) => !allowedContext.includes(key)) ||
        Object.values(experiment).some((value) => typeof value !== 'string' || value.length > 128)) {
      throw new Error('VLA experiment metadata is invalid.');
    }
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    try {
      if (fs.statSync(this.file).size > MAX_LOG_BYTES) fs.renameSync(this.file, `${this.file}.1`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const event = {
      schema: 'vista.vla.action.v1', eventId: crypto.randomUUID(), occurredAtMs: Date.now(),
      providerKind: result.providerKind || 'UNVERIFIED_MODEL',
      model: result.model || {}, inferenceLatencyMs: result.inferenceLatencyMs,
      runtimeKind: 'SIMULATION', instructionSha256: crypto.createHash('sha256').update(instruction).digest('hex'),
      experiment: { ...experiment }, proposal: { jointNames: [...proposal.jointNames], unit: proposal.unit, jointPositions: [...proposal.jointPositions] },
      observation: { jointNames: [...observation.jointNames], jointPositionsRad: [...observation.jointPositionsRad], imageViews: [...observation.imageViews] },
      simulation: { engine: result.simulation.engine || null, finalSequence: result.simulation.final?.sequence ?? null }
    };
    fs.appendFileSync(this.file, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(this.root, 0o700); fs.chmodSync(this.file, 0o600); } catch {}
    return { saved: true, eventId: event.eventId };
  }
}

module.exports = { PolicyActionRecorder };
