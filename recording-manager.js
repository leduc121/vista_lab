'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
const LIMITS = { shoulder_pan: [-1.91986,1.91986], shoulder_lift: [-1.74533,1.74533], elbow_flex: [-1.69,1.69], wrist_flex: [-1.65806,1.65806], wrist_roll: [-2.7438473,2.8412063], gripper: [-0.174533,1.74533] };
function inspectArtifact(filename) {
  assertRegularFile(filename);
  const fd = fs.openSync(filename, 'r'); const hash = crypto.createHash('sha256'); const buffer = Buffer.allocUnsafe(128 * 1024);
  let bytes = 0, lineFeeds = 0, lastByte = null;
  try {
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      const chunk = buffer.subarray(0, read); hash.update(chunk); bytes += read; lastByte = chunk[read - 1];
      for (let offset = 0; (offset = chunk.indexOf(10, offset)) !== -1; offset++) lineFeeds++;
    }
  } finally { fs.closeSync(fd); }
  return { bytes, sha256: hash.digest('hex'), lineCount: lineFeeds + (bytes && lastByte !== 10 ? 1 : 0) };
}
function assertRegularFile(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Recording artifact must be a regular file inside its episode directory.');
}
function validateFrames(frames, manifest) {
  if (!Array.isArray(frames) || frames.length !== manifest.frames) throw Error('Recording frame count does not match its manifest.');
  const expectedMode = manifest.declaredRuntimeKind === 'PHYSICAL_ROBOT' ? 'LIVE_PHYSICAL'
    : ['SIMULATION', 'MOCK_RUNTIME'].includes(manifest.declaredRuntimeKind) ? 'SIMULATION' : null;
  if (!expectedMode && frames.length) throw Error('Unverified recordings cannot contain measured frames.');
  let previousAt = -Infinity;
  frames.forEach((frame, index) => {
    if (!frame || frame.schema_version !== 1 || frame.robot_id !== manifest.robotId
      || frame.source_mode !== expectedMode || frame.controller_id !== manifest.deviceId
      || frame.sequence !== index || frame.connection !== 'connected'
      || typeof frame.measured_at !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(frame.measured_at)
      || !['VERIFIED','UNCALIBRATED'].includes(frame.calibration_status)
      || (manifest.calibrationReference?.status === 'VERIFIED') !== (frame.calibration_status === 'VERIFIED')
      || (frame.calibration_status === 'VERIFIED' && (!Array.isArray(frame.calibrated) || frame.calibrated.length !== JOINTS.length))) {
      throw Error(`Recording frame ${index} has invalid identity, order, or schema.`);
    }
    const measuredAt = Date.parse(frame.measured_at);
    if (!Number.isFinite(measuredAt) || measuredAt <= previousAt) throw Error(`Recording frame ${index} timestamp is invalid or out of order.`);
    previousAt = measuredAt;
    if (!Array.isArray(frame.measured) || frame.measured.length !== JOINTS.length
      || frame.measured.some((reading, jointIndex) => !reading || reading.name !== JOINTS[jointIndex]
        || !Number.isFinite(reading.position) || !['rad', 'deg', ...(reading.name === 'gripper' ? ['percent'] : [])].includes(reading.unit))) {
      throw Error(`Recording frame ${index} must contain six ordered SO-101 measurements.`);
    }
    for (const reading of frame.measured) {
      const value = reading.unit === 'deg' ? reading.position * Math.PI / 180 : reading.position;
      if (reading.unit === 'percent' ? reading.position < 0 || reading.position > 100
        : value < LIMITS[reading.name][0] || value > LIMITS[reading.name][1]) {
        throw Error(`Recording frame ${index} contains an out-of-range ${reading.name} value.`);
      }
    }
    if (frame.calibration_status === 'VERIFIED' && frame.calibrated.some((reading, jointIndex) => {
      const measured = frame.measured[jointIndex];
      return !reading || reading.name !== JOINTS[jointIndex] || !Number.isFinite(reading.position)
        || !['deg', 'rad', ...(reading.name === 'gripper' ? ['percent'] : [])].includes(reading.unit)
        || reading.position !== measured.position || reading.unit !== measured.unit;
    })) throw Error(`Recording frame ${index} calibration mapping is inconsistent.`);
  });
}
class RecordingManager {
  constructor(root) { this.root = root; this.active = null; fs.mkdirSync(root, { recursive: true, mode: 0o700 }); this.recover(); }
  recover() {
    for (const id of fs.readdirSync(this.root)) {
      const dir = path.join(this.root, id);
      try {
        const info = fs.lstatSync(dir); if (!info.isDirectory() || info.isSymbolicLink()) continue;
        const m = this.readManifest(dir);
        if (m.status === 'RECORDING') { m.status = 'INTERRUPTED'; m.endedAtMs = Date.now(); this.writeManifest(dir, m); }
      } catch {}
    }
  }
  readManifest(dir) { const file = path.join(dir, 'manifest.json'); assertRegularFile(file); return JSON.parse(fs.readFileSync(file, 'utf8')); }
  writeManifest(dir, m) {
    const info = fs.lstatSync(dir); if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Recording episode directory is not a local directory.');
    const tmp = path.join(dir, `.manifest-${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, path.join(dir, 'manifest.json'));
  }
  list() {
    return fs.readdirSync(this.root).flatMap((id) => {
      try {
        const dir = this.directory(id);
        if (!fs.lstatSync(dir).isDirectory()) return [];
        const m = this.readManifest(dir);
        return [{ ...m, ...this.verify(id) }];
      } catch (error) { return [{ episodeId: id, status: 'CORRUPT', integrity: 'MISMATCH', integrityError: String(error.message).slice(0, 160) }]; }
    }).sort((a,b) => (b.startedAtMs || 0)-(a.startedAtMs || 0));
  }
  start({ experimentId, robotId, slot, deviceId, runtimeKind, calibrated = false, attemptId, labSessionId, programVersionId, submissionId, commandId, runId }) {
    if (this.active) throw Error('Another episode is recording.');
    if (![experimentId, robotId, deviceId].every((x) => typeof x === 'string' && x.length && x.length <= 128)) throw Error('Experiment and device identity are required.');
    if (!['simulation','leader-a','follower-a','leader-b','follower-b'].includes(slot)) throw Error('Select a valid SO-101 arm slot.');
    if (typeof calibrated !== 'boolean') throw Error('Calibration metadata must be explicit.');
    for (const [key, value] of Object.entries({ attemptId, labSessionId, programVersionId, submissionId, commandId, runId })) {
      if (value !== undefined && (typeof value !== 'string' || !value.length || value.length > 128)) throw Error(`Recording ${key} metadata is invalid.`);
    }
    const episodeId = crypto.randomUUID(); const dir = path.join(this.root, episodeId); fs.mkdirSync(dir, { mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'trajectory.ndjson'), '', { mode: 0o600 });
    const correlation = Object.fromEntries(Object.entries({ attemptId, labSessionId, programVersionId, submissionId, commandId, runId }).filter(([, value]) => typeof value === 'string' && value.length > 0 && value.length <= 128));
    const manifest = { schema: 'vista.robot.recording.v1', episodeId, robotId, experimentId, ...correlation, slot, deviceId, startedAtMs: Date.now(), endedAtMs: null, declaredRuntimeKind: ['SIMULATION','MOCK_RUNTIME','PHYSICAL_ROBOT','UNVERIFIED_RUNTIME'].includes(runtimeKind) ? runtimeKind : 'UNVERIFIED_RUNTIME', status: 'RECORDING', frames: 0, droppedFrames: 0, calibrationReference: calibrated ? { deviceId, profileId: deviceId, status: 'VERIFIED' } : null };
    this.writeManifest(dir, manifest); this.active = { dir, manifest, sequence: 0, lastAt: 0, lastTimestampMs: -Infinity }; return { ...manifest };
  }
  append(jointState) {
    if (!this.active) return null;
    const state = jointState || {}; const joints = state.joints || {};
    const readings = JOINTS.map((name) => ({ name, position: Number(joints[name]), unit: state.unit || 'deg' }));
    if (this.active.manifest.declaredRuntimeKind === 'UNVERIFIED_RUNTIME' || state.measured !== true || !readings.every((r) => Number.isFinite(r.position) && (() => { const radians = r.unit === 'deg' ? r.position * Math.PI / 180 : r.position; return radians >= LIMITS[r.name][0] && radians <= LIMITS[r.name][1]; })()) || !['deg','rad'].includes(state.unit)) { this.active.manifest.droppedFrames++; return null; }
    if (Date.now() - this.active.lastAt < 50) { this.active.manifest.droppedFrames++; return null; }
    if (this.active.manifest.frames >= 200000) throw Error('Episode frame limit reached.');
    const at = Number.isFinite(state.timestamp) ? Math.floor(state.timestamp * 1000) : NaN;
    if (!Number.isFinite(at) || at <= this.active.lastTimestampMs || at > Date.now() + 2000) { this.active.manifest.droppedFrames++; return null; }
    const frame = { schema_version: 1, robot_id: this.active.manifest.robotId, source_mode: this.active.manifest.declaredRuntimeKind === 'PHYSICAL_ROBOT' ? 'LIVE_PHYSICAL' : 'SIMULATION', controller_id: this.active.manifest.deviceId, measured_at: new Date(at).toISOString(), sequence: this.active.sequence++, connection: 'connected', measured: readings, calibration_status: this.active.manifest.calibrationReference ? 'VERIFIED' : 'UNCALIBRATED', ...(this.active.manifest.calibrationReference ? { calibrated: readings } : {}) };
    const artifact = path.join(this.active.dir, 'trajectory.ndjson');
    assertRegularFile(artifact);
    fs.appendFileSync(artifact, JSON.stringify(frame) + '\n', { mode: 0o600 });
    this.active.lastAt = Date.now(); this.active.lastTimestampMs = at; this.active.manifest.frames++; if (this.active.manifest.frames % 20 === 0) { const fd = fs.openSync(artifact, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } this.writeManifest(this.active.dir, this.active.manifest); } return frame;
  }
  stop(status = 'LOCAL_RECORDED') {
    if (!this.active) return null;
    if (!['LOCAL_RECORDED','CANCELLED','INTERRUPTED','FAILED'].includes(status)) throw Error('Recording terminal status is invalid.');
    const { dir, manifest } = this.active; this.active = null;
    manifest.endedAtMs = Date.now(); manifest.status = status;
    const artifactPath = path.join(dir, 'trajectory.ndjson'); const fd = fs.openSync(artifactPath, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const artifact = inspectArtifact(artifactPath);
    manifest.artifactIntegrity = { algorithm: 'SHA-256', bytes: artifact.bytes, sha256: artifact.sha256 };
    this.writeManifest(dir, manifest);
    return { ...manifest, bytes: artifact.bytes, sha256: artifact.sha256, integrity: 'VERIFIED' };
  }
  cancel() { return this.stop('CANCELLED'); }
  directory(episodeId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(episodeId))) throw Error('Invalid episode id.');
    const dir = path.join(this.root, episodeId); const info = fs.lstatSync(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Recording episode must be a local directory.');
    return dir;
  }
  updateStatus(episodeId, status, details = {}) { const dir = this.directory(episodeId); const manifest = this.readManifest(dir); manifest.status = status; Object.assign(manifest, details); this.writeManifest(dir, manifest); return manifest; }
  verify(episodeId) {
    const dir = this.directory(episodeId);
    const manifest = this.readManifest(dir);
    if (manifest.schema !== 'vista.robot.recording.v1' || manifest.episodeId !== episodeId
      || typeof manifest.robotId !== 'string' || typeof manifest.experimentId !== 'string'
      || typeof manifest.deviceId !== 'string' || !Number.isFinite(manifest.startedAtMs)
      || !Number.isInteger(manifest.frames) || manifest.frames < 0
      || !Number.isFinite(manifest.endedAtMs) || manifest.endedAtMs < manifest.startedAtMs
      || !Number.isInteger(manifest.droppedFrames) || manifest.droppedFrames < 0
      || !['SIMULATION','MOCK_RUNTIME','PHYSICAL_ROBOT','UNVERIFIED_RUNTIME'].includes(manifest.declaredRuntimeKind)
      || (manifest.calibrationReference !== null && manifest.calibrationReference?.status !== 'VERIFIED')) {
      return { integrity: 'MISMATCH', validationError: 'Recording manifest metadata is invalid.' };
    }
    const artifact = inspectArtifact(path.join(dir, 'trajectory.ndjson'));
    const seal = manifest.artifactIntegrity;
    let structureValid = false; let validationError;
    try {
      const text = fs.readFileSync(path.join(dir, 'trajectory.ndjson'), 'utf8');
      const frames = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      validateFrames(frames, manifest); structureValid = true;
    } catch (error) { validationError = String(error.message).slice(0, 200); }
    const verified = seal?.algorithm === 'SHA-256' && seal.bytes === artifact.bytes && seal.sha256 === artifact.sha256
      && artifact.lineCount === manifest.frames && structureValid;
    return { bytes: artifact.bytes, sha256: artifact.sha256, integrity: !seal ? 'UNSEALED' : verified ? 'VERIFIED' : 'MISMATCH', ...(validationError ? { validationError } : {}) };
  }
  metadata(episodeId) {
    const dir = this.directory(episodeId);
    const manifest = this.readManifest(dir);
    const integrity = this.verify(episodeId);
    if (integrity.integrity === 'MISMATCH') throw Error('Recording artifact checksum does not match its sealed manifest.');
    return { manifest, integrity };
  }
  get(episodeId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(episodeId))) throw Error('Invalid episode id.');
    const dir = this.directory(episodeId); const { manifest, integrity } = this.metadata(episodeId);
    if (integrity.integrity !== 'VERIFIED') throw Error('Recording must be sealed and structurally verified before replay.');
    const artifactPath = path.join(dir, 'trajectory.ndjson'); assertRegularFile(artifactPath);
    const frames = fs.readFileSync(artifactPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    return { manifest, frames, integrity };
  }
}
module.exports = { RecordingManager, JOINTS };
