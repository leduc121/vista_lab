const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RecordingManager } = require('../recording-manager');

test('recording writes bounded-rate schema frames, integrity metadata, and recovers interrupted sessions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-recording-'));
  try {
    const manager = new RecordingManager(root);
    const episode = manager.start({ experimentId: 'experiment', robotId: 'robot', slot: 'follower-a', deviceId: 'usb-1', runtimeKind: 'SIMULATION' });
    const joints = Object.fromEntries(['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper'].map((name) => [name, 0]));
    const first = manager.append({ measured: true, unit: 'deg', joints, timestamp: Date.now()/1000 });
    assert.equal(first.schema_version, 1);
    assert.deepEqual(first.measured.map((x) => x.name), ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']);
    assert.equal(manager.append({ measured: true, unit: 'deg', joints, timestamp: Date.now()/1000 }), null);
    const saved = manager.stop();
    assert.equal(saved.status, 'LOCAL_RECORDED');
    assert.match(saved.sha256, /^[a-f0-9]{64}$/);
    assert.equal(manager.get(episode.episodeId).frames.length, 1);
    const pending = manager.start({ experimentId: 'e', robotId: 'r', slot: 'leader-a', deviceId: 'usb-2', runtimeKind: 'UNVERIFIED_RUNTIME' });
    const recovered = new RecordingManager(root).list().find((x) => x.episodeId === pending.episodeId);
    assert.equal(recovered.status, 'INTERRUPTED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
