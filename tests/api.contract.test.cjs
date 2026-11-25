const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createClient } = require('../api');
const { isTrustedMainFrame, validateTwinWsUrl, validateEvidenceDownloadUrl } = require('../ipc-security');

test('Demo assignment fixtures declare the Blockly programming contract', async () => {
  const client = createClient({ mock: true });
  const labs = await client.listLabs();
  assert.ok(labs.length > 0);
  for (const lab of labs) {
    assert.equal(lab.constraints?.kind, 'symbolic_program', `assignment ${lab.id} must open in the Blockly workspace`);
    assert.ok(Array.isArray(lab.allowed_blocks) && lab.allowed_blocks.length > 0, `assignment ${lab.id} must define its allowed blocks`);
    assert.ok(lab.allowed_blocks.every((block) => ['arm.select', 'home', 'preview.move_xyz', 'gripper.open', 'gripper.close', 'wait'].includes(block)), `assignment ${lab.id} must use canonical Blockly action identifiers`);
  }
});

test('refreshes an expired access token through public Supabase auth and retries the API request', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/auth/students/login')) return new Response(JSON.stringify({ access_token: 'old-access', refresh_token: 'private-refresh', expires_in: 3600 }), { status: 200 });
    if (String(url).includes('/auth/v1/token?grant_type=refresh_token')) return new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'rotated-refresh', expires_in: 3600 }), { status: 200 });
    if (String(url).endsWith('/me') && options.headers.Authorization === 'Bearer old-access') return new Response('{}', { status: 401 });
    if (String(url).endsWith('/me')) return new Response(JSON.stringify({ id: 'student', fullName: 'Student' }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'public-anon-key' });
  await client.login({ schoolCode: 'school', studentCode: 'student', password: 'password' });
  await client.me();
  assert.equal(requests[1].url, 'https://api.example.test/api/v1/me');
  assert.equal(requests[2].url, 'https://project.supabase.co/auth/v1/token?grant_type=refresh_token');
  assert.equal(JSON.parse(requests[2].options.body).refresh_token, 'private-refresh');
  assert.equal(requests[2].options.headers.apikey, 'public-anon-key');
  assert.equal(requests[3].options.headers.Authorization, 'Bearer new-access');
  assert.equal(client.getSession().refresh_token, 'rotated-refresh');
});

test('expired Supabase refresh fails closed and drops the in-memory session', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => String(url).includes('/auth/v1/token')
    ? new Response('{"error":"invalid_grant"}', { status: 400 }) : new Response('{}', { status: 401 });
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'public-anon-key' });
  client.setSession({ access_token: 'expired', refresh_token: 'revoked' });
  await assert.rejects(client.restoreSession({ access_token: 'expired', refresh_token: 'revoked', expires_at: 1 }), { code: 'SESSION_EXPIRED' });
  assert.equal(client.getSession(), null);
});

test('logout clears local session even when Supabase cannot be reached', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { throw new Error('offline'); };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'public-anon-key' });
  client.setSession({ access_token: 'access', refresh_token: 'refresh' });
  await client.logout();
  assert.equal(client.getSession(), null);
});

test('a transient network failure keeps the student session for an explicit retry', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response(JSON.stringify([{ classroom_assignment_id: 'test-assignment' }]), { status: 200 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'student-token', refresh_token: 'refresh-token' });
  await assert.rejects(client.listLabs(), /fetch failed/);
  assert.equal(client.getSession().access_token, 'student-token');
  assert.equal((await client.listLabs()).length, 1);
});

test('a refreshed token rejected by the Education API expires the student session', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => String(url).includes('/auth/v1/token')
    ? new Response(JSON.stringify({ access_token: 'refreshed', refresh_token: 'rotated', expires_in: 3600 }), { status: 200 })
    : new Response(JSON.stringify({ message: 'token not accepted' }), { status: 401 });
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'public-anon-key' });
  client.setSession({ access_token: 'expired', refresh_token: 'valid-refresh' });
  await assert.rejects(client.me(), { code: 'SESSION_EXPIRED' });
  assert.equal(client.getSession(), null);
});

test('SESSION_ROTATED is preserved and clears the stale session without refreshing it', async (t) => {
  const originalFetch = global.fetch;
  let refreshCalls = 0;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/token')) refreshCalls++;
    return new Response(JSON.stringify({ code: 'SESSION_ROTATED', message: 'password changed' }), { status: 401 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon' });
  client.setSession({ access_token: 'stale', refresh_token: 'stale-refresh' });
  await assert.rejects(client.me(), { code: 'SESSION_ROTATED', status: 401 });
  assert.equal(refreshCalls, 0);
  assert.equal(client.getSession(), null);
});

test('Blockly versions and attempt-bound viewer scope use verified student routes', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => { requests.push({ url: String(url), options }); return new Response('{}', { status: 200 }); };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'student-token', refresh_token: 'refresh' });
  const programId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const attemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const robotId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await client.programVersions(programId);
  await client.issueTwinViewerScope(attemptId, { robotId, labSessionId: 'lab-session-1' });
  assert.equal(requests[0].url, `https://api.example.test/api/v1/me/programs/${programId}/versions`);
  assert.equal(requests[1].url, `https://api.example.test/api/v1/me/attempts/${attemptId}/digital-twin/viewer-scope`);
  assert.equal(requests[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[1].options.body), { robotId, labSessionId: 'lab-session-1' });
  assert.equal(requests[1].options.headers.Authorization, 'Bearer student-token');
});

test('experiment evidence listing and download use only the authenticated student routes', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify(requests.length === 1
      ? [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', type: 'other', availability: 'available' }]
      : { status: 'available', url: 'https://objects.example.test/signed-evidence' }), { status: 200 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'student-token', refresh_token: 'refresh-token' });
  const experimentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const artifactId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert.equal((await client.experimentArtifacts(experimentId))[0].availability, 'available');
  assert.deepEqual(await client.experimentArtifactDownload(experimentId, artifactId), { status: 'available', url: 'https://objects.example.test/signed-evidence' });
  assert.equal(requests[0].url, `https://api.example.test/api/v1/me/experiments/${experimentId}/artifacts`);
  assert.equal(requests[1].url, `https://api.example.test/api/v1/me/experiments/${experimentId}/artifacts/${artifactId}/download`);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer student-token');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer student-token');
  assert.throws(() => client.experimentArtifactDownload('not-an-id', artifactId), /không hợp lệ/i);
});

test('recording upload authorization and retrieval use the deployed student routes', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => { calls.push({ url: String(url), options }); return new Response('{}', { status: 200 }); };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'student-token', refresh_token: 'refresh' });
  const experiment = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const artifact = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const request = { episodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', files: [] };
  await client.requestRecordingUpload(experiment, request);
  await client.experimentRecordings(experiment);
  await client.recordingDownload(experiment, artifact);
  assert.deepEqual(calls.map(({ url }) => url), [
    `https://api.example.test/api/v1/me/experiments/${experiment}/recordings/uploads`,
    `https://api.example.test/api/v1/me/experiments/${experiment}/recordings`,
    `https://api.example.test/api/v1/me/experiments/${experiment}/recordings/${artifact}/download`
  ]);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), request);
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer student-token'));
  assert.throws(() => client.requestRecordingUpload('invalid', request), /không hợp lệ/i);
});

test('program update unwraps the Education API RETURNING row for version creation', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const programId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const updated = { id: programId, workspace_json: { blocks: {} }, validation_result: { valid: true } };
  global.fetch = async (_url, options) => {
    assert.equal(options.method, 'PATCH');
    return new Response(JSON.stringify([updated]), { status: 200 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'student-token', refresh_token: 'refresh-token' });
  assert.deepEqual(await client.updateProgram(programId, { workspaceJson: updated.workspace_json }), updated);
});

test('temporary-password login remains restricted across refresh and changes through the verified route', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/auth/students/login')) return new Response(JSON.stringify({ access_token: 'restricted', refresh_token: 'r1', expires_in: 1, password_change_required: true }), { status: 201 });
    if (String(url).includes('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'restricted2', refresh_token: 'r2', expires_in: 3600 }), { status: 200 });
    if (String(url).includes('/auth/students/password')) return new Response(JSON.stringify({ access_token: 'public', refresh_token: 'r3', expires_in: 3600 }), { status: 200 });
    if (String(url).endsWith('/me')) return new Response(JSON.stringify({ fullName: 'Student' }), { status: 200 });
    return new Response(JSON.stringify({ code: 'PASSWORD_CHANGE_REQUIRED' }), { status: 403 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon' });
  const login = await client.login({ schoolCode: 'S', studentCode: 'ST', password: 'temporary' });
  assert.equal(login.password_change_required, true);
  await assert.rejects(client.listLabs(), { code: 'PASSWORD_CHANGE_REQUIRED', status: 403 });
  const session = client.getSession();
  session.expires_at = Math.floor(Date.now() / 1000) - 1;
  const restored = await client.restoreSession(session);
  assert.deepEqual(restored, { passwordChangeRequired: true });
  const changed = await client.changeStudentPassword({ currentPassword: 'temporary', newPassword: 'long-secure-password' });
  assert.equal(changed.access_token, 'public');
  assert.equal((await client.me()).name, 'Student');
  assert.ok(requests.some((r) => r.url.endsWith('/auth/students/password') && r.options.method === 'PATCH'));
});

test('Electron accepts only the trusted main frame and exact packaged page', () => {
  const expectedPagePath = path.resolve('app', 'renderer', 'index.html');
  const frame = { url: pathToFileURL(expectedPagePath).href, isMainFrame: true };
  const window = { webContents: { mainFrame: frame } };
  assert.equal(isTrustedMainFrame({ sender: window.webContents, senderFrame: frame }, window, expectedPagePath), true);
  assert.equal(isTrustedMainFrame({ sender: {}, senderFrame: frame }, window, expectedPagePath), false);
  assert.equal(isTrustedMainFrame({ sender: window.webContents, senderFrame: { ...frame, url: 'https://evil.invalid/' } }, window, expectedPagePath), false);
  assert.equal(isTrustedMainFrame({ sender: window.webContents, senderFrame: { ...frame, isMainFrame: false } }, window, expectedPagePath), false);
});

test('Twin endpoint allows secure remote and loopback development URLs only', () => {
  assert.equal(validateTwinWsUrl('wss://twin.example.edu/ws/twin'), 'wss://twin.example.edu/ws/twin');
  assert.equal(validateTwinWsUrl('ws://127.0.0.1:8767/ws/twin'), 'ws://127.0.0.1:8767/ws/twin');
  for (const url of [
    'ws://twin.example.edu/ws/twin', 'https://twin.example.edu/ws/twin',
    'wss://user:secret@twin.example.edu/ws/twin', 'wss://twin.example.edu/ws/twin?token=secret',
    'wss://twin.example.edu/other'
  ]) assert.throws(() => validateTwinWsUrl(url));
});

test('signed evidence downloads allow HTTPS or loopback HTTP and reject unsafe URL schemes', () => {
  assert.equal(validateEvidenceDownloadUrl('https://objects.example.test/evidence?signature=short-lived'), 'https://objects.example.test/evidence?signature=short-lived');
  assert.equal(validateEvidenceDownloadUrl('http://127.0.0.1:9000/evidence?signature=local'), 'http://127.0.0.1:9000/evidence?signature=local');
  for (const url of ['http://objects.example.test/evidence', 'file:///etc/passwd', 'https://user:pass@objects.example.test/evidence', 'https://objects.example.test/evidence#fragment']) {
    assert.throws(() => validateEvidenceDownloadUrl(url), /unsafe evidence download URL/i);
  }
});

test('API failures preserve forbidden status for feature-level denial handling', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 });
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'access', refresh_token: 'refresh' });
  await assert.rejects(client.listLabs(), (error) => error.status === 403 && error.code === 'FORBIDDEN');
});

test('student login follows the Education API contract and uses bearer auth for student routes', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/auth/students/login')) {
      return new Response(JSON.stringify({ access_token: 'access-test', refresh_token: 'refresh-test', expires_in: 3600 }), { status: 201 });
    }
    if (String(url).endsWith('/me')) return new Response(JSON.stringify({ id: 'student-id', fullName: 'Student Test' }), { status: 200 });
    if (String(url).endsWith('/me/learning')) return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const client = createClient({ mock: false, educationApi: 'https://api.skynex.best/api/v1' });
  await client.login({ schoolCode: 'SCHOOL-1', studentCode: 'STUDENT-1', password: 'not-saved' });
  assert.deepEqual(JSON.parse(requests[0].options.body), { schoolCode: 'SCHOOL-1', studentCode: 'STUDENT-1', password: 'not-saved' });
  await client.me();
  await client.listLabs();
  assert.equal(requests[1].url, 'https://api.skynex.best/api/v1/me');
  assert.equal(requests[2].url, 'https://api.skynex.best/api/v1/me/learning');
  assert.equal(requests[2].options.headers.Authorization, 'Bearer access-test');
  assert.equal(client.getSession().refresh_token, 'refresh-test');
});

test('student course progress uses the authenticated learning-path and enrollment contracts', async (t) => {
  const requests = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify(String(url).endsWith('/me/enrollments') ? [] : { courses: [] }), { status: 200 });
  };
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  client.setSession({ access_token: 'student-access', refresh_token: 'student-refresh' });
  await client.enrollments();
  await client.learningPath();
  assert.deepEqual(requests.map((request) => request.url), [
    'https://api.example.test/api/v1/me/enrollments',
    'https://api.example.test/api/v1/me/learning-path'
  ]);
  assert.ok(requests.every((request) => request.options.headers.Authorization === 'Bearer student-access'));
});

test('unknown temporary-password challenge responses fail closed and are not persisted', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(JSON.stringify({ status: 'password_change_required', changeToken: 'opaque-test-challenge' }), { status: 200 });
  const client = createClient({ mock: false, educationApi: 'https://api.example.test/api/v1' });
  await assert.rejects(client.login({ schoolCode: 'school', studentCode: 'student', password: 'temporary-test-password' }), /invalid student session/i);
  assert.equal(client.getSession(), null);
  assert.equal(client.changeTemporaryPassword, undefined, 'do not fabricate a password-change route before backend contract verification');
});

test('physical execution mutation methods are not exposed and issue no request', async (t) => {
  let requestCount = 0;
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { requestCount++; return new Response('{}', { status: 200 }); };
  const client = createClient({ mock: false, educationApi: 'https://api.skynex.best/api/v1' });
  assert.equal(client.preparePhysicalExecution, undefined);
  assert.equal(client.startPhysicalExecution, undefined);
  assert.equal(client.stopPhysicalExecution, undefined);
  assert.equal(requestCount, 0);
});

test('student identifiers in REST paths must be UUIDs', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response('{}', { status: 200 });
  const client = createClient({ mock: false, educationApi: 'https://api.skynex.best/api/v1' });
  assert.throws(() => client.startAttempt('not-a-uuid'), /không hợp lệ/i);
});

test('Education API configuration rejects lookalike loopback hosts and embedded credentials before fetch', async (t) => {
  const originalFetch = global.fetch;
  let requestCount = 0;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { requestCount++; throw new Error('unexpected request'); };
  for (const url of ['http://localhost.evil.test/api/v1', 'https://name:secret@api.example.test/api/v1', 'https://api.example.test/api/v1?token=secret', 'http://api.example.test/api/v1']) {
    const client = createClient({ mock: false, educationApi: url });
    await assert.rejects(client.login({ schoolCode: 'school', studentCode: 'student', password: 'test' }));
  }
  const unconfigured = createClient({ mock: false, educationApi: '' });
  await assert.rejects(unconfigured.login({ schoolCode: 'school', studentCode: 'student', password: 'test' }), /Configure VISTA_EDUCATION_API/);
  assert.equal(requestCount, 0);
});

test('Linux session persistence rejects Electron basic_text fallback', () => {
  const { secureStorageAvailable } = require('../session-security');
  const storage = (backend, encrypted = true) => ({
    isEncryptionAvailable: () => encrypted,
    getSelectedStorageBackend: () => backend
  });
  assert.equal(secureStorageAvailable(storage('basic_text'), 'linux'), false);
  assert.equal(secureStorageAvailable(storage('unknown'), 'linux'), false);
  assert.equal(secureStorageAvailable(storage('gnome_libsecret'), 'linux'), true);
  assert.equal(secureStorageAvailable(storage('kwallet6'), 'linux'), true);
  assert.equal(secureStorageAvailable(storage('gnome_libsecret', false), 'linux'), false);
  assert.equal(secureStorageAvailable(storage('unknown'), 'win32'), true);
});

test('Twin parser requires six measured SO-101 joints and rejects wrong robot frames', () => {
  const esbuild = require('esbuild');
  const Module = require('node:module');
  const path = require('node:path');
  const entry = path.resolve(__dirname, '../renderer/twin-viewer.js');
  const output = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const loaded = new Module(entry, module);
  loaded.filename = entry;
  loaded.paths = Module._nodeModulePaths(__dirname);
  loaded._compile(output, entry);
  const { parseTwinFrame, frameJointTargets } = loaded.exports;
  const measured = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper']
    .map((name) => ({ name, position: 0, unit: 'rad' }));
  const frame = { schema_version: 1, robot_id: 'robot-a', source_mode: 'SIMULATION', connection: 'connected',
    calibration_status: 'NOT_APPLICABLE', sequence: 1, controller_id: 'test', measured_at: new Date(10000).toISOString(), measured };
  assert.equal(parseTwinFrame(frame, 'robot-a'), frame);
  assert.equal(parseTwinFrame({ ...frame, measured: undefined }, 'robot-a'), null);
  assert.equal(parseTwinFrame({ ...frame, measured: measured.slice(1) }, 'robot-a'), null);
  assert.equal(parseTwinFrame(frame, 'robot-b'), null);
  const readings = [...measured].reverse().map((reading) => ({ ...reading }));
  readings.find((reading) => reading.name === 'shoulder_pan').position = 45;
  readings.find((reading) => reading.name === 'shoulder_pan').unit = 'deg';
  readings.find((reading) => reading.name === 'gripper').position = 50;
  readings.find((reading) => reading.name === 'gripper').unit = 'percent';
  assert.deepEqual(frameJointTargets({ ...frame, measured: readings }, 10000), {
    shoulder_pan: Math.PI / 4, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0
  });
  assert.deepEqual(frameJointTargets({ ...frame, connection: 'stale' }, 10000), {});
  assert.deepEqual(frameJointTargets(frame, 15001), {});
  assert.deepEqual(frameJointTargets(null, 10000), {});
  const live = { ...frame, source_mode: 'LIVE_PHYSICAL', calibration_status: 'UNCALIBRATED' };
  assert.deepEqual(frameJointTargets(live, 10000), {}, 'uncalibrated physical telemetry must not animate the twin');
  assert.deepEqual(frameJointTargets({ ...live, calibration_status: 'VERIFIED', calibrated: measured }, 10000), {
    shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper: 0
  });
});

test('Twin WebSocket client uses the viewer subprotocol, wires frames before open, and bounds a stalled handshake', async () => {
  const esbuild = require('esbuild');
  const Module = require('node:module');
  const path = require('node:path');
  const entry = path.resolve(__dirname, '../renderer/twin-connection.js');
  const output = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const loaded = new Module(entry, module); loaded.filename = entry; loaded.paths = Module._nodeModulePaths(__dirname); loaded._compile(output, entry);
  const { connectTwinSocket, twinHeartbeatStatus } = loaded.exports;
  class FakeWebSocket {
    static CONNECTING = 0;
    constructor(url, protocols) { this.url = url; this.protocols = protocols; this.readyState = FakeWebSocket.CONNECTING; FakeWebSocket.last = this; }
    open() { this.readyState = 1; this.onopen?.({ type: 'open' }); }
    send(data) { this.onmessage?.({ data }); }
    close(code = 1000, reason = '') { this.readyState = 3; this.closeArgs = [code, reason]; }
  }
  let messages = 0;
  const connection = connectTwinSocket('wss://twin.example.test/ws/twin', 'opaque-scope-token', {
    WebSocketImpl: FakeWebSocket, timeoutMs: 50, onMessage: () => messages++
  });
  assert.deepEqual(connection.socket.protocols, ['vista.twin.opaque-scope-token']);
  connection.socket.open();
  await connection.opened;
  connection.socket.send('{}');
  assert.equal(messages, 1);

  const stalled = connectTwinSocket('wss://twin.example.test/ws/twin', 'fresh-scope-token', { WebSocketImpl: FakeWebSocket, timeoutMs: 5 });
  await assert.rejects(stalled.opened, /handshake timed out/i);
  assert.deepEqual(stalled.socket.closeArgs, [1000, 'viewer handshake timeout']);
  assert.throws(() => connectTwinSocket('wss://twin.example.test/ws/twin', 'bad token', { WebSocketImpl: FakeWebSocket }), /invalid Twin viewer scope/i);
  assert.equal(twinHeartbeatStatus(null, 10000), 'Connected · awaiting telemetry');
  assert.equal(twinHeartbeatStatus(8000, 10000), 'Connected · heartbeat');
  assert.equal(twinHeartbeatStatus(4000, 10000), 'Stale telemetry · connection heartbeat active');
});
