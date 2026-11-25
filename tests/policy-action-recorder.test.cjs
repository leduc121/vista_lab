const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PolicyActionRecorder } = require('../policy-action-recorder');

test('records only simulation VLA proposals with model latency and experiment scope', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-vla-action-'));
  try {
    const recorder = new PolicyActionRecorder(root);
    const jointNames = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
    const proposal = { jointNames, unit: 'rad', jointPositions: [0, -0.2, 0.3, -0.1, 0, 0.2] };
    const result = { motionEnabled: false, providerKind: 'MOCK_MODEL', inferenceLatencyMs: 4,
      model: { architecture: 'mock' }, action: proposal,
      observationSummary: { jointNames, jointPositionsRad: [0, 0, 0, 0, 0, 0], imageViews: ['observation.images.front'] },
      simulation: { mode: 'SIMULATION', engine: 'MuJoCo', final: { sequence: 3 } } };
    const context = { experimentId: 'exp-1', episodeId: 'episode-1' };
    const saved = recorder.record(result, 'place block safely', context);
    const event = JSON.parse(fs.readFileSync(path.join(root, 'recordings/vla-actions/actions.ndjson'), 'utf8'));
    assert.equal(saved.saved, true);
    assert.equal(event.providerKind, 'MOCK_MODEL');
    assert.equal(event.runtimeKind, 'SIMULATION');
    assert.equal(event.inferenceLatencyMs, 4);
    assert.deepEqual(event.experiment, context);
    assert.equal(event.proposal.jointPositions.length, 6);
    assert.equal(event.observation.imageViews[0], 'observation.images.front');
    assert.equal(JSON.stringify(event).includes('place block safely'), false);
    const actionFile = path.join(root, 'recordings/vla-actions/actions.ndjson');
    if (process.platform === 'win32') {
      // Windows does not expose distinct owner/group/other mode bits; verify the actual NTFS ACL instead.
      const escapedPath = actionFile.replace(/'/g, "''");
      const script = [
        `$path = '${escapedPath}'`,
        '$acl = Get-Acl -LiteralPath $path',
        "$broadSids = @('S-1-1-0', 'S-1-5-4', 'S-1-5-11', 'S-1-5-32-545')",
        '$readWrite = [System.Security.AccessControl.FileSystemRights]::Read -bor [System.Security.AccessControl.FileSystemRights]::Write -bor [System.Security.AccessControl.FileSystemRights]::Modify -bor [System.Security.AccessControl.FileSystemRights]::FullControl',
        "$broadAllow = $acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -in $broadSids -and ($_.FileSystemRights -band $readWrite) -ne 0 }",
        "if ($broadAllow) { Write-Output 'shared'; exit 1 } else { Write-Output 'private' }"
      ].join('; ');
      assert.equal(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim(), 'private');
    } else {
      assert.equal(fs.statSync(actionFile).mode & 0o077, 0);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects non-simulation and malformed action proposals', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-vla-action-'));
  try {
    const recorder = new PolicyActionRecorder(root);
    assert.throws(() => recorder.record({ motionEnabled: true, simulation: { mode: 'PHYSICAL_ROBOT' } }), /Only validated simulation/);
    assert.throws(() => recorder.record({ motionEnabled: false, simulation: { mode: 'SIMULATION' }, action: { unit: 'rad' } }), /six-joint/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
