const { strict: assert } = require('node:assert');

const env = process.env;
const required = [
  'VISTA_TEST_EDUCATION_API_URL', 'VISTA_TEST_SCHOOL_CODE', 'VISTA_TEST_STUDENT_CODE',
  'VISTA_TEST_STUDENT_PASSWORD', 'VISTA_TEST_SUPABASE_URL', 'VISTA_TEST_SUPABASE_ANON_KEY',
  'VISTA_TEST_OTHER_SCHOOL_CODE', 'VISTA_TEST_OTHER_STUDENT_CODE',
  'VISTA_TEST_OTHER_STUDENT_PASSWORD', 'VISTA_TEST_ATTEMPT_ID'
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error(`Integration acceptance not run. Missing test-only variables: ${missing.join(', ')}`);
  process.exit(2);
}
const temporaryKeys = ['VISTA_TEST_TEMP_SCHOOL_CODE', 'VISTA_TEST_TEMP_STUDENT_CODE', 'VISTA_TEST_TEMP_PASSWORD', 'VISTA_TEST_TEMP_NEW_PASSWORD'];
const hasTemporarySuite = temporaryKeys.some((key) => Boolean(env[key]));
if (hasTemporarySuite && temporaryKeys.some((key) => !env[key])) throw new Error(`Temporary-password suite requires all variables: ${temporaryKeys.join(', ')}`);
if (hasTemporarySuite && (env.VISTA_TEST_TEMP_NEW_PASSWORD.length < 12 || env.VISTA_TEST_TEMP_NEW_PASSWORD === env.VISTA_TEST_TEMP_PASSWORD)) throw new Error('Temporary-password test requires a different new password of at least 12 characters.');

const api = new URL(env.VISTA_TEST_EDUCATION_API_URL);
const supabase = new URL(env.VISTA_TEST_SUPABASE_URL);
const isLocal = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
const isKnownProduction = api.hostname === 'api.skynex.best';
if (isKnownProduction) throw new Error('Refusing to run integration acceptance against the Production Education API.');
if (!isLocal(api) || !isLocal(supabase)) {
  if (env.VISTA_TEST_ALLOW_STAGING !== '1' || !/(^|[.-])staging([.-]|$)/i.test(api.hostname)) {
    throw new Error('Remote integration tests require VISTA_TEST_ALLOW_STAGING=1 and an Education API hostname containing a staging label.');
  }
  const ref = env.VISTA_TEST_SUPABASE_PROJECT_REF;
  if (!ref || !supabase.hostname.startsWith(`${ref}.`)) throw new Error('Remote Supabase must match VISTA_TEST_SUPABASE_PROJECT_REF for the isolated staging project.');
}
if (!/^https?:$/.test(api.protocol) || !/^https?:$/.test(supabase.protocol)) throw new Error('Integration API and Supabase URLs must use HTTP(S).');
if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(env.VISTA_TEST_ATTEMPT_ID)) throw new Error('VISTA_TEST_ATTEMPT_ID must be a test-owned UUID.');

async function login(schoolCode, studentCode, password) {
  const response = await loginResponse(schoolCode, studentCode, password);
  const data = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `test account login failed with HTTP ${response.status}`);
  assert.ok(data.access_token, 'login response did not contain access_token');
  assert.ok(data.refresh_token, 'login response did not contain refresh_token');
  return data;
}
async function loginResponse(schoolCode, studentCode, password) {
  return fetch(new URL('auth/students/login', ensureApiSlash(api)), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ schoolCode, studentCode, password }), signal: AbortSignal.timeout(12000)
  });
}

function ensureApiSlash(url) { return `${url.origin}${url.pathname.replace(/\/$/, '')}/`; }
async function request(url, token, method = 'GET', body) {
  return fetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000)
  });
}
async function json(response) { return response.json().catch(() => ({})); }
async function expectDenied(response, label) {
  assert.ok([403, 404].includes(response.status), `${label} must be denied; received HTTP ${response.status}`);
  await response.arrayBuffer();
}
async function expectCode(response, expected, label) {
  const body = await json(response);
  assert.equal(response.status, expected === 'SESSION_ROTATED' ? 401 : 403, `${label} returned HTTP ${response.status}`);
  assert.equal(body.code, expected, `${label} returned an unexpected error code`);
}

async function runTemporaryPasswordAcceptance() {
  if (!hasTemporarySuite) return false;
  const temporary = await login(env.VISTA_TEST_TEMP_SCHOOL_CODE, env.VISTA_TEST_TEMP_STUDENT_CODE, env.VISTA_TEST_TEMP_PASSWORD);
  assert.equal(temporary.password_change_required, true, 'disposable student must be provisioned with a temporary password');
  await expectCode(await request(new URL('me', ensureApiSlash(api)), temporary.access_token), 'PASSWORD_CHANGE_REQUIRED', 'restricted /me');
  const changedResponse = await fetch(new URL('auth/students/password', ensureApiSlash(api)), {
    method: 'PATCH', headers: { Authorization: `Bearer ${temporary.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentPassword: env.VISTA_TEST_TEMP_PASSWORD, newPassword: env.VISTA_TEST_TEMP_NEW_PASSWORD }), signal: AbortSignal.timeout(12000)
  });
  const changed = await json(changedResponse);
  assert.equal(changedResponse.ok, true, `temporary password change failed with HTTP ${changedResponse.status}`);
  assert.ok(changed.access_token && changed.refresh_token, 'password change did not return a replacement session');
  await expectCode(await request(new URL('me', ensureApiSlash(api)), temporary.access_token), 'SESSION_ROTATED', 'pre-change access token');
  const refreshed = await fetch(new URL('auth/v1/token?grant_type=refresh_token', `${supabase.origin}/`), {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.VISTA_TEST_SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: changed.refresh_token }), signal: AbortSignal.timeout(12000)
  });
  const session = await json(refreshed);
  assert.equal(refreshed.ok, true, `replacement session refresh failed with HTTP ${refreshed.status}`);
  const profile = await request(new URL('me', ensureApiSlash(api)), session.access_token);
  assert.equal(profile.ok, true, `post-change /me failed with HTTP ${profile.status}`);
  await profile.arrayBuffer();
  return true;
}

(async () => {
  const contractFailures = [];
  const temporaryPasswordPassed = await runTemporaryPasswordAcceptance();
  let first = await login(env.VISTA_TEST_SCHOOL_CODE, env.VISTA_TEST_STUDENT_CODE, env.VISTA_TEST_STUDENT_PASSWORD);
  assert.notEqual(first.password_change_required, true, 'standard integration student must not be a temporary-password account');
  assert.equal((await loginResponse(env.VISTA_TEST_SCHOOL_CODE, env.VISTA_TEST_STUDENT_CODE, `${env.VISTA_TEST_STUDENT_PASSWORD}-wrong`)).status, 401, 'invalid password must be rejected');
  assert.equal((await loginResponse(env.VISTA_TEST_OTHER_SCHOOL_CODE, env.VISTA_TEST_STUDENT_CODE, env.VISTA_TEST_STUDENT_PASSWORD)).status, 401, 'wrong school must be rejected');
  assert.equal((await request(new URL('me', ensureApiSlash(api)), '')).status, 401, 'missing student token must be rejected');
  const refresh = await fetch(new URL('auth/v1/token?grant_type=refresh_token', `${supabase.origin}/`), {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.VISTA_TEST_SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: first.refresh_token }), signal: AbortSignal.timeout(12000)
  });
  const rotated = await json(refresh);
  assert.equal(refresh.ok, true, `Supabase refresh failed with HTTP ${refresh.status}`);
  assert.ok(rotated.access_token && rotated.refresh_token, 'Supabase refresh did not return rotated session tokens');
  first = rotated;
  if (env.VISTA_TEST_EXPIRED_ACCESS_TOKEN) {
    const expired = await request(new URL('me', ensureApiSlash(api)), env.VISTA_TEST_EXPIRED_ACCESS_TOKEN);
    assert.equal(expired.status, 401, 'expired access token was accepted');
    await expired.arrayBuffer();
  }

  const profileUrl = new URL('me', ensureApiSlash(api));
  const learningUrl = new URL('me/learning', ensureApiSlash(api));
  const enrollmentsUrl = new URL('me/enrollments', ensureApiSlash(api));
  const learningPathUrl = new URL('me/learning-path', ensureApiSlash(api));
  const [profile, learning, enrollments, learningPath] = await Promise.all([
    request(profileUrl, first.access_token), request(learningUrl, first.access_token),
    request(enrollmentsUrl, first.access_token), request(learningPathUrl, first.access_token)
  ]);
  assert.equal(profile.ok, true, `/me failed with HTTP ${profile.status}`);
  assert.equal(learning.ok, true, `/me/learning failed with HTTP ${learning.status}`);
  assert.equal(enrollments.ok, true, `/me/enrollments failed with HTTP ${enrollments.status}`);
  assert.equal(learningPath.ok, true, `/me/learning-path failed with HTTP ${learningPath.status}`);
  await profile.arrayBuffer();
  const assignments = await json(learning);
  const enrollmentRows = await json(enrollments);
  const coursePath = await json(learningPath);
  assert.ok(Array.isArray(assignments), '/me/learning must return the assigned-lab array');
  for (const row of assignments) {
    assert.ok(typeof row.classroom_assignment_id === 'string' && typeof row.title === 'string', 'assigned lab requires its real assignment ID and title');
    assert.ok(typeof row.course_title === 'string' && typeof row.status === 'string', 'assigned lab requires its course and server status');
    assert.ok(Object.hasOwn(row, 'due_at'), 'assigned lab response must include due_at (null is valid)');
  }
  assert.ok(Array.isArray(enrollmentRows) || Array.isArray(enrollmentRows?.items), '/me/enrollments must return enrollment rows');
  assert.ok(Array.isArray(coursePath?.courses), '/me/learning-path must return enrolled course progress');
  for (const course of coursePath.courses) {
    assert.ok(typeof course.id === 'string' && typeof course.title === 'string', 'course progress requires server course identity and title');
    assert.ok(Number.isFinite(course.progressPercent) && course.progressPercent >= 0 && course.progressPercent <= 100, 'course progress must be server-reported in the 0–100 range');
  }

  let ownedAttemptId = env.VISTA_TEST_ATTEMPT_ID;
  let ownedProgramId;
  let ownedVersionId;
  let twinConnected = false;
  if (env.VISTA_TEST_ENABLE_MUTATIONS === '1') {
    const requiredForWrites = ['VISTA_TEST_ASSIGNMENT_ID', 'VISTA_TEST_WORKSPACE_JSON', 'VISTA_TEST_ROBOT_PROGRAM_JSON'];
    const missingWrites = requiredForWrites.filter((key) => !env[key]);
    assert.deepEqual(missingWrites, [], `fresh disposable Blockly write resources are required: ${missingWrites.join(', ')}`);
    const assignmentId = env.VISTA_TEST_ASSIGNMENT_ID;
    const detail = await request(new URL(`classroom-assignments/${assignmentId}`, ensureApiSlash(api)), first.access_token);
    assert.equal(detail.ok, true, `assigned lab detail failed with HTTP ${detail.status}`);
    await detail.arrayBuffer();
    const started = await request(new URL(`classroom-assignments/${assignmentId}/attempts`, ensureApiSlash(api)), first.access_token, 'POST', {});
    assert.equal(started.ok, true, `attempt creation failed with HTTP ${started.status}`);
    const attempt = await json(started);
    assert.match(attempt.id || '', /^[0-9a-f-]{36}$/i, 'attempt creation response missing UUID id');
    ownedAttemptId = attempt.id;
    const resumedResponse = await request(new URL(`classroom-assignments/${assignmentId}/attempts`, ensureApiSlash(api)), first.access_token, 'POST', {});
    assert.equal(resumedResponse.ok, true, `attempt resume failed with HTTP ${resumedResponse.status}`);
    const resumedAttempt = await json(resumedResponse);
    assert.equal(resumedAttempt.id, ownedAttemptId, 'start/resume created a duplicate active attempt');
    const attemptRead = await request(new URL(`me/attempts/${ownedAttemptId}`, ensureApiSlash(api)), first.access_token);
    assert.equal(attemptRead.ok, true, `attempt read failed with HTTP ${attemptRead.status}`);
    await attemptRead.arrayBuffer();

    const workspaceJson = JSON.parse(env.VISTA_TEST_WORKSPACE_JSON);
    const robotProgram = JSON.parse(env.VISTA_TEST_ROBOT_PROGRAM_JSON);
    const created = await request(new URL(`me/attempts/${ownedAttemptId}/program`, ensureApiSlash(api)), first.access_token, 'POST', { title: 'Disposable acceptance program', workspaceJson, robotProgram });
    assert.equal(created.ok, true, `program save/validation failed with HTTP ${created.status}`);
    const program = await json(created);
    assert.match(program.id || '', /^[0-9a-f-]{36}$/i, 'program response missing UUID id');
    ownedProgramId = program.id;
    assert.equal(program.validation_result?.valid, true, 'server did not validate the saved program');
    const reloaded = await request(new URL(`me/attempts/${ownedAttemptId}/program`, ensureApiSlash(api)), first.access_token);
    assert.equal(reloaded.ok, true, `program reload failed with HTTP ${reloaded.status}`);
    const reloadedProgram = await json(reloaded);
    assert.equal(reloadedProgram.id, program.id, 'reloaded program differs from the saved program');
    assert.deepEqual(reloadedProgram.workspace_json, workspaceJson, 'saved Blockly workspace did not round-trip');

    const updated = await request(new URL(`me/programs/${program.id}`, ensureApiSlash(api)), first.access_token, 'PATCH', { workspaceJson, robotProgram });
    assert.equal(updated.ok, true, `program update failed with HTTP ${updated.status}`);
    const updatedRows = await json(updated);
    assert.equal(Array.isArray(updatedRows) ? updatedRows[0]?.id : updatedRows?.id, program.id, 'updated program response has no matching row');
    const versionResponse = await request(new URL(`me/programs/${program.id}/versions`, ensureApiSlash(api)), first.access_token, 'POST', { changeSummary: 'Disposable integration acceptance' });
    assert.equal(versionResponse.ok, true, `version creation failed with HTTP ${versionResponse.status}`);
    const version = await json(versionResponse);
    assert.match(version.id || '', /^[0-9a-f-]{36}$/i, 'version response missing UUID id');
    ownedVersionId = version.id;
    const history = await request(new URL(`me/programs/${program.id}/versions`, ensureApiSlash(api)), first.access_token);
    assert.equal(history.ok, true, `version history failed with HTTP ${history.status}`);
    const versions = await json(history);
    assert.ok(Array.isArray(versions) && versions.some((item) => item.id === version.id), 'new immutable version was absent from history');
    assert.deepEqual(version.workspace_json, workspaceJson, 'version workspace differs from the submitted draft');

    if (env.VISTA_TEST_ENABLE_SIMULATION === '1') {
      const experimentResponse = await request(new URL(`me/attempts/${ownedAttemptId}/experiments`, ensureApiSlash(api)), first.access_token, 'POST', { programVersionId: ownedVersionId, executionMode: 'schematic' });
      assert.equal(experimentResponse.ok, true, `schematic creation failed with HTTP ${experimentResponse.status}`);
      const experiment = await json(experimentResponse);
      assert.match(experiment.id || '', /^[0-9a-f-]{36}$/i, 'schematic response missing UUID id');
      let run = await request(new URL(`me/experiments/${experiment.id}/run-schematic`, ensureApiSlash(api)), first.access_token, 'POST', {});
      assert.equal(run.ok, true, `schematic start failed with HTTP ${run.status}`);
      let status = await json(run);
      const terminal = ['succeeded', 'failed', 'cancelled', 'stopped', 'timed_out', 'preflight_failed'];
      const deadline = Date.now() + 60000;
      while (!terminal.includes(String(status.status || '').toLowerCase()) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const poll = await request(new URL(`me/experiments/${experiment.id}`, ensureApiSlash(api)), first.access_token);
        assert.equal(poll.ok, true, `schematic status read failed with HTTP ${poll.status}`);
        status = await json(poll);
      }
      assert.ok(terminal.includes(String(status.status || '').toLowerCase()), 'schematic did not reach a terminal state within 60 seconds');
      const [events, result] = await Promise.all([
        request(new URL(`me/experiments/${experiment.id}/events`, ensureApiSlash(api)), first.access_token),
        request(new URL(`me/experiments/${experiment.id}/result`, ensureApiSlash(api)), first.access_token)
      ]);
      assert.equal(String(status.status).toLowerCase(), 'succeeded', `schematic did not succeed: ${status.status}`);
      if (!events.ok) {
        const failure = `GET /me/experiments/:experimentId/events returned HTTP ${events.status}`;
        contractFailures.push(failure);
        console.error(`KNOWN BACKEND CONTRACT FAILURE: ${failure}; continuing independent result, submission, and persistence checks.`);
      }
      assert.equal(result.ok, true, `schematic result returned HTTP ${result.status}`);
      const resultRows = await json(result);
      assert.ok(Array.isArray(resultRows) && resultRows.length > 0, 'successful schematic result was not persisted');
      await events.arrayBuffer();
    }

    if (env.VISTA_TEST_ENABLE_TWIN === '1') {
      for (const key of ['VISTA_TEST_ROBOT_ID', 'VISTA_TEST_TWIN_WS_URL']) assert.ok(env[key], `Twin acceptance requires ${key}`);
      assert.match(env.VISTA_TEST_ROBOT_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Twin robot must be a test-owned UUID');
      const twinUrl = new URL(env.VISTA_TEST_TWIN_WS_URL);
      const twinLocal = isLocal(twinUrl);
      assert.ok(twinUrl.protocol === 'wss:' || (twinUrl.protocol === 'ws:' && twinLocal), 'test Twin endpoint must use WSS or loopback WS');
      assert.equal(twinUrl.pathname, '/ws/twin'); assert.ok(!twinUrl.username && !twinUrl.password && !twinUrl.search && !twinUrl.hash, 'Twin URL cannot contain credentials/query/fragment');
      if (!twinLocal) assert.ok(env.VISTA_TEST_ALLOW_STAGING === '1' && /(^|[.-])staging([.-]|$)/i.test(twinUrl.hostname), 'remote Twin endpoint must be explicitly isolated staging');
      const scopeResponse = await request(new URL(`me/attempts/${ownedAttemptId}/digital-twin/viewer-scope`, ensureApiSlash(api)), first.access_token, 'POST', { robotId: env.VISTA_TEST_ROBOT_ID });
      assert.equal(scopeResponse.ok, true, `attempt-bound Twin scope failed with HTTP ${scopeResponse.status}`);
      const scope = await json(scopeResponse);
      assert.equal(scope.attemptId, ownedAttemptId); assert.equal(scope.robotId, env.VISTA_TEST_ROBOT_ID);
      assert.ok(scope.token && Date.parse(scope.expiresAt) > Date.now(), 'Twin scope missing token/valid expiry');
      await expectDenied(await request(new URL(`me/attempts/${ownedAttemptId}/digital-twin/viewer-scope`, ensureApiSlash(api)), (await login(env.VISTA_TEST_OTHER_SCHOOL_CODE, env.VISTA_TEST_OTHER_STUDENT_CODE, env.VISTA_TEST_OTHER_STUDENT_PASSWORD)).access_token, 'POST', { robotId: env.VISTA_TEST_ROBOT_ID }), 'cross-school Twin scope');
      twinConnected = await new Promise((resolve, reject) => {
        const socket = new WebSocket(env.VISTA_TEST_TWIN_WS_URL, [`vista.twin.${scope.token}`]);
        const timer = setTimeout(() => { socket.close(); reject(new Error('Twin WebSocket did not connect within 10 seconds')); }, 10000);
        socket.addEventListener('open', () => { clearTimeout(timer); socket.close(1000, 'acceptance check'); resolve(true); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Twin WebSocket connection failed')); }, { once: true });
      });
    }
    const submission = await request(new URL(`me/attempts/${ownedAttemptId}/submission`, ensureApiSlash(api)), first.access_token, 'POST', { programVersionId: ownedVersionId, reflection: 'Disposable acceptance test.' });
    assert.equal(submission.ok, true, `authorized submission failed with HTTP ${submission.status}`);
    const submitted = await json(submission);
    assert.equal(submitted.program_version_id, ownedVersionId, 'submission did not pin the selected immutable version');
    const finalAttempt = await request(new URL(`me/attempts/${ownedAttemptId}`, ensureApiSlash(api)), first.access_token);
    assert.equal(finalAttempt.ok, true, `submitted attempt read failed with HTTP ${finalAttempt.status}`);
    const finalAttemptData = await json(finalAttempt);
    assert.ok(['submitted', 'evaluated'].includes(finalAttemptData.status), 'attempt remained editable after submission');
    const webLearningResponse = await request(new URL('me/learning', ensureApiSlash(api)), first.access_token);
    assert.equal(webLearningResponse.ok, true, `Web LMS learning projection failed with HTTP ${webLearningResponse.status}`);
    const webLearningRows = await json(webLearningResponse);
    const webLearningAttempt = webLearningRows.find((row) => row.classroom_assignment_id === assignmentId);
    assert.ok(webLearningAttempt, 'submitted assignment is absent from the same student /me/learning projection used by Web LMS');
    assert.equal(webLearningAttempt.attempt_id, ownedAttemptId, 'Web LMS learning projection references a different attempt');
    assert.ok(['submitted', 'evaluated'].includes(webLearningAttempt.attempt_status || webLearningAttempt.status), 'Web LMS learning projection did not reflect submission');
    if (finalAttemptData.score !== undefined && finalAttemptData.score !== null) assert.equal(webLearningAttempt.score, finalAttemptData.score, 'Web LMS learning projection score differs from the submitted attempt');
    const afterSubmitUpdate = await request(new URL(`me/programs/${program.id}`, ensureApiSlash(api)), first.access_token, 'PATCH', { workspaceJson, robotProgram });
    assert.ok([403, 404, 409].includes(afterSubmitUpdate.status), `submitted program remained writable: HTTP ${afterSubmitUpdate.status}`);
    await afterSubmitUpdate.arrayBuffer();
    if (env.VISTA_TEST_ENABLE_TWIN === '1') {
      const closedScope = await request(new URL(`me/attempts/${ownedAttemptId}/digital-twin/viewer-scope`, ensureApiSlash(api)), first.access_token, 'POST', { robotId: env.VISTA_TEST_ROBOT_ID });
      assert.equal(closedScope.status, 404, 'submitted attempt was still granted a new Twin viewer scope');
      await closedScope.arrayBuffer();
    }
  }

  const other = await login(env.VISTA_TEST_OTHER_SCHOOL_CODE, env.VISTA_TEST_OTHER_STUDENT_CODE, env.VISTA_TEST_OTHER_STUDENT_PASSWORD);
  const denialAttemptId = env.VISTA_TEST_ENABLE_MUTATIONS === '1' ? ownedAttemptId : env.VISTA_TEST_ATTEMPT_ID;
  await expectDenied(await request(new URL(`me/attempts/${encodeURIComponent(denialAttemptId)}`, ensureApiSlash(api)), other.access_token), 'cross-school attempt read');
  if (env.VISTA_TEST_ENABLE_MUTATIONS === '1') {
    await expectDenied(await request(new URL(`classroom-assignments/${env.VISTA_TEST_ASSIGNMENT_ID}`, ensureApiSlash(api)), other.access_token), 'cross-school assignment detail');
    await expectDenied(await request(new URL(`me/attempts/${ownedAttemptId}`, ensureApiSlash(api)), other.access_token), 'foreign attempt read');
  }
  if (ownedVersionId) {
    await expectDenied(await request(new URL(`me/attempts/${ownedAttemptId}/submission`, ensureApiSlash(api)), other.access_token, 'POST', { programVersionId: ownedVersionId }), 'foreign submission');
  }

  const logout = await fetch(new URL('auth/v1/logout', `${supabase.origin}/`), {
    method: 'POST', headers: { apikey: env.VISTA_TEST_SUPABASE_ANON_KEY, Authorization: `Bearer ${first.access_token}` },
    signal: AbortSignal.timeout(12000)
  });
  assert.equal(logout.ok, true, `Supabase logout failed with HTTP ${logout.status}`);
  await logout.arrayBuffer();
  if (ownedAttemptId && ownedProgramId && ownedVersionId) {
    // IDs are test-scoped UUIDs only; the runner uses them for independent DB readback.
    console.log(`VISTA_ACCEPTANCE_IDS ${JSON.stringify({ attemptId: ownedAttemptId, programId: ownedProgramId, versionId: ownedVersionId })}`);
  }
  const loggedOutRefresh = await fetch(new URL('auth/v1/token?grant_type=refresh_token', `${supabase.origin}/`), {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.VISTA_TEST_SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: first.refresh_token }), signal: AbortSignal.timeout(12000)
  });
  assert.equal(loggedOutRefresh.ok, false, 'logged-out refresh token remained usable');
  await loggedOutRefresh.arrayBuffer();

  const completedChecks = `${temporaryPasswordPassed ? 'temporary login/change/refresh/session rotation, ' : ''}login, Supabase refresh, /me, /me/learning (${Array.isArray(assignments) ? assignments.length : 'response'} assignment payload), course enrollments/progress, and cross-school attempt denial${ownedVersionId ? ', attempt start/resume, Blockly save/update/version/history/submit, Web LMS learning projection refresh, and foreign submission denial' : ''}${env.VISTA_TEST_ENABLE_SIMULATION === '1' ? ', persisted schematic experiment result' : ''}${twinConnected ? ', attempt-bound Twin scope and WebSocket connect' : ''}.`;
  console.log(`Isolated integration checks ${contractFailures.length ? 'completed with reported contract failures' : 'passed'}: ${completedChecks}`);
  if (!temporaryPasswordPassed) console.log('Temporary-password acceptance skipped: provide a fresh disposable account using VISTA_TEST_TEMP_* variables.');
  if (env.VISTA_TEST_ENABLE_TWIN !== '1') console.log('Twin scope/WebSocket acceptance skipped: set VISTA_TEST_ENABLE_TWIN=1 and isolated test-owned robot/endpoint variables.');
  if (contractFailures.length) throw new Error(`Acceptance contract failures: ${contractFailures.join('; ')}`);
})().catch((error) => {
  console.error(`Isolated integration acceptance failed: ${error.message}`);
  process.exitCode = 1;
});
