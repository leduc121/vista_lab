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
    const episode = manager.start({ experimentId: 'experiment', robotId: 'robot', slot: 'follower-a', deviceId: 'usb-1', runtimeKind: 'SIMULATION', attemptId: 'attempt-1', programVersionId: 'program-version-1', commandId: 'command-1' });
    const joints = Object.fromEntries(['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper'].map((name) => [name, 0]));
    const first = manager.append({ measured: true, unit: 'deg', joints, timestamp: Date.now()/1000 });
    assert.equal(first.schema_version, 1);
    assert.deepEqual(first.measured.map((x) => x.name), ['shoulder_pan','shoulder_lift','elbow_flex','wrist_flex','wrist_roll','gripper']);
    assert.equal(manager.append({ measured: true, unit: 'deg', joints, timestamp: Date.now()/1000 }), null);
    const saved = manager.stop();
    assert.equal(saved.status, 'LOCAL_RECORDED');
    assert.match(saved.sha256, /^[a-f0-9]{64}$/);
    assert.equal(saved.artifactIntegrity.algorithm, 'SHA-256');
    assert.equal(saved.artifactIntegrity.bytes, saved.bytes);
    const loaded = manager.get(episode.episodeId);
    assert.equal(loaded.frames.length, 1);
    assert.equal(loaded.integrity.integrity, 'VERIFIED');
    assert.equal(loaded.manifest.attemptId, 'attempt-1');
    assert.equal(loaded.manifest.programVersionId, 'program-version-1');
    assert.equal(loaded.manifest.commandId, 'command-1');
    fs.appendFileSync(path.join(root, episode.episodeId, 'trajectory.ndjson'), '{"tampered":true}\n');
    assert.equal(manager.verify(episode.episodeId).integrity, 'MISMATCH');
    assert.throws(() => manager.get(episode.episodeId), /checksum/i);
    assert.equal(manager.list().find((row) => row.episodeId === episode.episodeId).integrity, 'MISMATCH');
    const artifactPath = path.join(root, episode.episodeId, 'trajectory.ndjson');
    const originalPath = path.join(root, episode.episodeId, 'trajectory.original');
    const outsidePath = path.join(root, 'outside-trajectory.ndjson');
    fs.writeFileSync(outsidePath, '{"private":"outside"}\n');
    fs.renameSync(artifactPath, originalPath);
    try {
      fs.symlinkSync(outsidePath, artifactPath);
      assert.throws(() => manager.verify(episode.episodeId), /regular file/i);
      assert.throws(() => manager.get(episode.episodeId), /regular file/i);
    } finally {
      try { fs.unlinkSync(artifactPath); } catch {}
      fs.renameSync(originalPath, artifactPath);
      fs.rmSync(outsidePath, { force: true });
    }

    const linkedDirectoryId = '12345678-1234-4234-8234-123456789abc';
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-recording-outside-'));
    try {
      fs.writeFileSync(path.join(outsideDir, 'manifest.json'), JSON.stringify({ schema: 'vista.robot.recording.v1', status: 'RECORDING', frames: 0 }));
      fs.writeFileSync(path.join(outsideDir, 'trajectory.ndjson'), '');
      fs.symlinkSync(outsideDir, path.join(root, linkedDirectoryId), 'dir');
      new RecordingManager(root);
      assert.equal(JSON.parse(fs.readFileSync(path.join(outsideDir, 'manifest.json'), 'utf8')).status, 'RECORDING');
      assert.equal(manager.list().find((row) => row.episodeId === linkedDirectoryId).status, 'CORRUPT');
    } finally { fs.rmSync(path.join(root, linkedDirectoryId), { force: true }); fs.rmSync(outsideDir, { recursive: true, force: true }); }
    const pending = manager.start({ experimentId: 'e', robotId: 'r', slot: 'leader-a', deviceId: 'usb-2', runtimeKind: 'UNVERIFIED_RUNTIME' });
    const recovered = new RecordingManager(root).list().find((x) => x.episodeId === pending.episodeId);
    assert.equal(recovered.status, 'INTERRUPTED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
