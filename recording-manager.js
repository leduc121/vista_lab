'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
const LIMITS = { shoulder_pan: [-1.91986,1.91986], shoulder_lift: [-1.74533,1.74533], elbow_flex: [-1.69,1.69], wrist_flex: [-1.65806,1.65806], wrist_roll: [-2.7438473,2.8412063], gripper: [-0.174533,1.74533] };
class RecordingManager {
  constructor(root) { this.root = root; this.active = null; fs.mkdirSync(root, { recursive: true, mode: 0o700 }); this.recover(); }
  recover() {
    for (const id of fs.readdirSync(this.root)) {
      const dir = path.join(this.root, id); if (!fs.statSync(dir).isDirectory()) continue;
      const file = path.join(dir, 'manifest.json');
      try { const m = JSON.parse(fs.readFileSync(file, 'utf8')); if (m.status === 'RECORDING') { m.status = 'INTERRUPTED'; m.endedAtMs = Date.now(); this.writeManifest(dir, m); } } catch {}
    }
  }
  writeManifest(dir, m) { const tmp = path.join(dir, 'manifest.tmp'); fs.writeFileSync(tmp, JSON.stringify(m, null, 2), { mode: 0o600 }); fs.renameSync(tmp, path.join(dir, 'manifest.json')); }
  list() {
    return fs.readdirSync(this.root).flatMap((id) => { try { const dir = path.join(this.root, id); const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); const artifact = path.join(dir, 'trajectory.ndjson'); return [{ ...m, bytes: fs.statSync(artifact).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex') }]; } catch { return []; } }).sort((a,b) => b.startedAtMs-a.startedAtMs);
  }
  start({ experimentId, robotId, slot, deviceId, runtimeKind, calibrated = false }) {
    if (this.active) throw Error('Another episode is recording.');
    if (![experimentId, robotId, deviceId].every((x) => typeof x === 'string' && x.length && x.length <= 128)) throw Error('Experiment and device identity are required.');
    const episodeId = crypto.randomUUID(); const dir = path.join(this.root, episodeId); fs.mkdirSync(dir, { mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'trajectory.ndjson'), '', { mode: 0o600 });
    const manifest = { schema: 'vista.robot.recording.v1', episodeId, robotId, experimentId, slot, deviceId, startedAtMs: Date.now(), endedAtMs: null, declaredRuntimeKind: ['SIMULATION','MOCK_RUNTIME','PHYSICAL_ROBOT','UNVERIFIED_RUNTIME'].includes(runtimeKind) ? runtimeKind : 'UNVERIFIED_RUNTIME', status: 'RECORDING', frames: 0, droppedFrames: 0, calibrationReference: calibrated ? { deviceId, status: 'VERIFIED' } : null };
    this.writeManifest(dir, manifest); this.active = { dir, manifest, sequence: 0, lastAt: 0 }; return { ...manifest };
  }
  append(jointState) {
    if (!this.active) return null;
    const state = jointState || {}; const joints = state.joints || {};
    const readings = JOINTS.map((name) => ({ name, position: Number(joints[name]), unit: state.unit || 'deg' }));
    if (this.active.manifest.declaredRuntimeKind === 'UNVERIFIED_RUNTIME' || state.measured !== true || !readings.every((r) => Number.isFinite(r.position) && (() => { const radians = r.unit === 'deg' ? r.position * Math.PI / 180 : r.position; return radians >= LIMITS[r.name][0] && radians <= LIMITS[r.name][1]; })()) || !['deg','rad'].includes(state.unit)) { this.active.manifest.droppedFrames++; return null; }
    if (Date.now() - this.active.lastAt < 50) { this.active.manifest.droppedFrames++; return null; }
    if (this.active.manifest.frames >= 200000) throw Error('Episode frame limit reached.');
    const at = Number.isFinite(state.timestamp) ? Math.floor(state.timestamp * 1000) : Date.now();
    const frame = { schema_version: 1, robot_id: this.active.manifest.robotId, source_mode: this.active.manifest.declaredRuntimeKind === 'PHYSICAL_ROBOT' ? 'LIVE_PHYSICAL' : 'SIMULATION', controller_id: this.active.manifest.deviceId, measured_at: new Date(at).toISOString(), sequence: this.active.sequence++, connection: 'connected', measured: readings, calibration_status: this.active.manifest.calibrationReference ? 'VERIFIED' : 'UNCALIBRATED', ...(this.active.manifest.calibrationReference ? { calibrated: readings } : {}) };
    const artifact = path.join(this.active.dir, 'trajectory.ndjson');
    fs.appendFileSync(artifact, JSON.stringify(frame) + '\n', { mode: 0o600 });
    this.active.lastAt = Date.now(); this.active.manifest.frames++; if (this.active.manifest.frames % 20 === 0) { const fd = fs.openSync(artifact, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } this.writeManifest(this.active.dir, this.active.manifest); } return frame;
  }
  stop(status = 'LOCAL_RECORDED') {
    if (!this.active) return null; const { dir, manifest } = this.active; this.active = null;
    manifest.endedAtMs = Date.now(); manifest.status = status; this.writeManifest(dir, manifest);
    const file = path.join(dir, 'trajectory.ndjson'); const bytes = fs.readFileSync(file);
    return { ...manifest, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  directory(episodeId) { if (!/^[0-9a-f-]{36}$/i.test(String(episodeId))) throw Error('Invalid episode id.'); return path.join(this.root, episodeId); }
  updateStatus(episodeId, status, details = {}) { const dir = this.directory(episodeId); const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); manifest.status = status; Object.assign(manifest, details); this.writeManifest(dir, manifest); return manifest; }
  get(episodeId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(episodeId))) throw Error('Invalid episode id.');
    const dir = path.join(this.root, episodeId); const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const frames = fs.readFileSync(path.join(dir, 'trajectory.ndjson'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    return { manifest, frames };
  }
}
module.exports = { RecordingManager, JOINTS };
