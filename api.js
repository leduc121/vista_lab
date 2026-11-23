// Client for the VISTA Education API contracts in services/education-api.
// All routes here are prefixed by /api/v1; Electron keeps tokens in its main process.
const TERMINAL = ['succeeded', 'failed', 'cancelled', 'stopped', 'timed_out', 'preflight_failed'];

function trustedBase(value, pathname, label) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error(`Configure ${label} before signing in.`); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error(`${label} must use HTTPS; HTTP is allowed only on loopback.`);
  if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, '') !== pathname) throw new Error(`${label} contains an unsupported path or credentials.`);
  return `${url.origin}${pathname}`;
}

function realClient(cfg) {
  let session = null;
  let refreshPromise = null;
  const base = String(cfg.educationApi || '').replace(/\/+$/, '');

  async function refresh() {
    if (!session?.refresh_token) return false;
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const url = `${trustedBase(cfg.supabaseUrl, '', 'VISTA_SUPABASE_URL')}/auth/v1/token?grant_type=refresh_token`;
        const response = await fetch(url, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
          signal: AbortSignal.timeout(10000)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.access_token || !data.refresh_token) {
          session = null;
          throw sessionExpired();
        }
        const passwordChangeRequired = session.password_change_required;
        session = normalizeSession(data);
        session.password_change_required = passwordChangeRequired;
        return true;
      })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  async function request(path, options = {}, retried = false) {
    const response = await fetch(`${trustedBase(base, '/api/v1', 'VISTA_EDUCATION_API')}${path}`, {
      ...options,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && data.code === 'SESSION_ROTATED') {
      session = null;
      const error = new Error(typeof data.message === 'string' ? data.message : 'This student session was replaced. Sign in again.');
      error.status = 401; error.code = 'SESSION_ROTATED'; throw error;
    }
    if (response.status === 401 && !retried && session?.refresh_token && await refresh()) {
      return request(path, options, true);
    }
    if (response.status === 401 && retried) { session = null; throw sessionExpired(); }
    if (response.status === 401 && session && !retried) throw sessionExpired();
    if (!response.ok) {
      const message = typeof data.message === 'string' ? data.message : `Education API trả về HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.code = typeof data.code === 'string' ? data.code : (response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : undefined);
      throw error;
    }
    return data;
  }

  const get = (path) => request(path);
  const post = (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) });
  const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
  return {
    setSession(next) { session = next ? normalizeSession(next) : null; },
    getSession() { return session; },
    async restoreSession(saved) {
      session = saved ? normalizeSession(saved) : null;
      if (!session) return null;
      if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 30) {
        if (!await refresh()) throw sessionExpired();
      }
      if (session.password_change_required) return { passwordChangeRequired: true };
      return this.me();
    },
    async login({ schoolCode, studentCode, password }) {
      const result = await post('/auth/students/login', { schoolCode, studentCode, password });
      session = normalizeSession(result);
      session.password_change_required = result.password_change_required === true;
      return result;
    },
    async changeStudentPassword({ currentPassword, newPassword }) {
      const result = await patch('/auth/students/password', { currentPassword, newPassword });
      session = normalizeSession(result);
      return result;
    },
    async setupStudent({ schoolCode, studentCode, setupCode, password }) {
      const result = await post('/auth/students/setup', { schoolCode, studentCode, setupCode, password });
      if (result.access_token) session = normalizeSession(result);
      return result;
    },
    async recoverStudent({ schoolCode, studentCode, recoveryCode, password }) {
      return post('/auth/students/recover', { schoolCode, studentCode, recoveryCode, password });
    },
    async logout() {
      const current = session;
      session = null;
      if (!current?.access_token || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
      try {
        await fetch(`${trustedBase(cfg.supabaseUrl, '', 'VISTA_SUPABASE_URL')}/auth/v1/logout`, {
          method: 'POST',
          redirect: 'error',
          headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${current.access_token}` },
          signal: AbortSignal.timeout(5000)
        });
      } catch { /* Local logout is authoritative even when the network is offline. */ }
    },
    async me() {
      const profile = await get('/me');
      return { ...profile, name: profile.fullName || profile.full_name || 'Student', studentCode: profile.studentCode || profile.id };
    },
    listLabs: () => get('/me/learning'),
    enrollments: () => get('/me/enrollments'),
    learningPath: () => get('/me/learning-path'),
    history: () => get('/me/experiments'),
    assignment: (id) => get(`/classroom-assignments/${uuid(id)}`),
    startAttempt: (classroomAssignmentId) => post(`/classroom-assignments/${uuid(classroomAssignmentId)}/attempts`),
    getAttempt: (id) => get(`/me/attempts/${uuid(id)}`),
    async getProgram(attemptId) {
      try { return await get(`/me/attempts/${uuid(attemptId)}/program`); }
      catch (error) { if (error.status === 404) return null; throw error; }
    },
    createProgram: (attemptId, body) => post(`/me/attempts/${uuid(attemptId)}/program`, body),
    async updateProgram(programId, body) {
      const result = await patch(`/me/programs/${uuid(programId)}`, body);
      // The current Education API returns Prisma UPDATE ... RETURNING rows here.
      const program = Array.isArray(result) ? result[0] : result;
      if (!program?.id || program.id !== programId) throw new Error('Education API returned an invalid updated program.');
      return program;
    },
    createProgramVersion: (programId, body = {}) => post(`/me/programs/${uuid(programId)}/versions`, body),
    submitAttempt: (attemptId, body) => post(`/me/attempts/${uuid(attemptId)}/submission`, body),
    createSchematicExperiment: (attemptId, body) => post(`/me/attempts/${uuid(attemptId)}/experiments`, body),
    runSchematic: (experimentId) => post(`/me/experiments/${uuid(experimentId)}/run-schematic`),
    experimentStatus: (experimentId) => get(`/me/experiments/${uuid(experimentId)}`),
    experimentEvents: (experimentId) => get(`/me/experiments/${uuid(experimentId)}/events`),
    experimentResult: (experimentId) => get(`/me/experiments/${uuid(experimentId)}/result`),
    // Evidence is produced and uploaded by the authorized Education API runtime;
    // Desktop can only list/download evidence through learner-owned routes.
    experimentArtifacts: (experimentId) => get(`/me/experiments/${uuid(experimentId)}/artifacts`),
    experimentArtifactDownload: (experimentId, artifactId) => get(`/me/experiments/${uuid(experimentId)}/artifacts/${uuid(artifactId)}/download`),
    programVersions: (programId) => get(`/me/programs/${uuid(programId)}/versions`),
    digitalTwinAvailability: () => get('/robots/digital-twin/availability'),
    issueTwinViewerScope: (attemptId, { robotId, labSessionId } = {}) => post(`/me/attempts/${uuid(attemptId)}/digital-twin/viewer-scope`, { robotId, ...(labSessionId ? { labSessionId } : {}) }),
    physicalEligibility: (attemptId) => get(`/me/attempts/${uuid(attemptId)}/physical-execution-eligibility`),
    activePhysicalExecution: (attemptId) => get(`/me/attempts/${uuid(attemptId)}/physical-executions/active`),
    physicalStatus: (experimentId) => get(`/me/physical-executions/${uuid(experimentId)}`)
  };
}

function normalizeSession(s) {
  if (!s || typeof s.access_token !== 'string' || !s.access_token || typeof s.refresh_token !== 'string' || !s.refresh_token) {
    throw new Error('Education API returned an invalid student session.');
  }
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type || 'bearer',
    expires_at: Number(s.expires_at || (Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600))),
    password_change_required: s.password_change_required === true
  };
}

function sessionExpired() {
  const error = new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  error.code = 'SESSION_EXPIRED';
  return error;
}

function uuid(value) {
  const id = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Mã tham chiếu không hợp lệ.');
  }
  return encodeURIComponent(id);
}

function mockClient() {
  const assignments = [
    { id: '00000000-0000-4000-8000-000000000001', classroom_assignment_id: '00000000-0000-4000-8000-000000000001', title: 'Gắp và đặt vật thể', instructions: 'Dùng Blockly tạo một chu trình gắp thả.', course_title: 'Robotics Fundamentals', classroom_name: '8A2 · Demo', due_at: null, attempt_id: null, status: 'assigned', learning_status: 'assigned', constraints: { kind: 'symbolic_program' }, allowed_blocks: ['arm.select','gripper.open','gripper.close','wait'] },
    { id: '00000000-0000-4000-8000-000000000002', classroom_assignment_id: '00000000-0000-4000-8000-000000000002', title: 'Tọa độ học tập', instructions: 'Mô phỏng một điểm đến trong khung tọa độ học tập.', course_title: 'Robot Programming', classroom_name: '8A2 · Demo', due_at: null, attempt_id: null, status: 'assigned', learning_status: 'assigned', constraints: { kind: 'symbolic_program' }, allowed_blocks: ['arm.select','home','preview.move_xyz','wait'] }
  ];
  const attempts = new Map();
  const programs = new Map();
  const versions = new Map();
  let user = { name: 'Học sinh Demo', studentCode: 'HS-DEMO', className: '8A2 · Demo', schoolName: 'VISTA Demo' };
  return {
    async login({ schoolCode, studentCode, password }) {
      if (!schoolCode || !studentCode || !password) throw new Error('Nhập mã trường, mã học sinh và mật khẩu.');
      user = { ...user, studentCode: studentCode.trim().toUpperCase() };
      return { access_token: 'demo-session', refresh_token: 'demo-refresh', expires_in: 3600 };
    },
    async setupStudent() { throw new Error('Thiết lập tài khoản chỉ chạy trên Education API thật.'); },
    async changeStudentPassword() { throw new Error('Đổi mật khẩu tạm chỉ chạy trên Education API thật.'); },
    async recoverStudent() { throw new Error('Khôi phục mật khẩu chỉ chạy trên Education API thật.'); },
    async restoreSession(saved) { return saved ? user : null; },
    async setSession() {}, getSession() { return null; }, async logout() {},
    async me() { return user; },
    async listLabs() { return assignments; },
    async enrollments() { return []; },
    async learningPath() { return { courses: [] }; },
    async history() { return []; },
    async assignment(id) { return assignments.find((a) => a.id === id) || assignments[0]; },
    async startAttempt(id) {
      let attempt = attempts.get(id);
      if (!attempt) { attempt = { id: `demo-${id.slice(-1)}`, classroom_assignment_id: id, status: 'in_progress' }; attempts.set(id, attempt); }
      return attempt;
    },
    async getAttempt(id) { return attempts.get(id) || { id, status: 'in_progress' }; },
    async getProgram(attemptId) { return programs.get(attemptId) || null; },
    async createProgram(attemptId, body) {
      const record = { id: `demo-program-${attemptId.slice(-1)}`, ...body };
      programs.set(attemptId, record); return record;
    },
    async updateProgram(programId, body) {
      const entry = [...programs.entries()].find(([, p]) => p.id === programId);
      if (!entry) throw new Error('Program không tồn tại.');
      const record = { ...entry[1], ...body }; programs.set(entry[0], record); return record;
    },
    async createProgramVersion(programId) {
      const program = [...programs.values()].find((entry) => entry.id === programId);
      const version = { id: `demo-version-${Date.now()}`, program_id: programId, version_number: (versions.get(programId)?.length || 0) + 1 };
      if (program) { version.workspace_json = program.workspaceJson; version.robot_program = program.robotProgram; }
      versions.set(programId, [...(versions.get(programId) || []), version]); return version;
    },
    async programVersions(programId) { return versions.get(programId) || []; },
    async digitalTwinAvailability() { return []; },
    async issueTwinViewerScope() { throw new Error('Digital Twin scope issuance requires the real Education API.'); },
    async createSchematicExperiment(attemptId, body) { return { id: `demo-sim-${Date.now()}`, attemptId, ...body, status: 'pending' }; },
    async runSchematic(experimentId) { return { id: experimentId, status: 'succeeded', executionMode: 'schematic' }; },
    async experimentStatus(experimentId) { return { id: experimentId, status: 'succeeded', execution_mode: 'schematic' }; },
    async experimentEvents() { return { items: [] }; },
    async experimentResult() { return { mode: 'schematic', telemetry: [], authoritative: false }; },
    async experimentArtifacts() { return []; },
    async experimentArtifactDownload() { throw new Error('Evidence downloads require the real Education API.'); },
    async submitAttempt() { throw new Error('Submit cần backend thật và tài khoản Demo không thể ghi dữ liệu.'); },
    async physicalEligibility() { return { eligible: false, reason: 'SIMULATION_ONLY', readiness: { allocated: false, entitled: false, symbolicPassed: false, runtimeOnline: false, runtimeStopped: true, checkikReachable: false, robotReady: false, estopActive: false, motionEnabled: false, activeSession: false } }; },
    async activePhysicalExecution() { return null; },
    async physicalStatus() { return { status: 'unavailable' }; }
  };
}

module.exports = { TERMINAL, createClient: (cfg = {}) => cfg.mock ? mockClient() : realClient(cfg) };
