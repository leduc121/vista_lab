// Browser-only fixture. All values are labelled Demo; physical motion is unavailable.
(function () {
  const ids = {
    a: '00000000-0000-4000-8000-000000000001',
    b: '00000000-0000-4000-8000-000000000002',
    attempt: '00000000-0000-4000-8000-000000000101',
    program: '00000000-0000-4000-8000-000000000201',
    version: '00000000-0000-4000-8000-000000000301'
  };
  const rows = [
    { classroom_assignment_id: ids.a, title: 'Pick and place · gripper loop', course_title: 'Robotics Fundamentals', classroom_name: '8A2 · Demo', lesson_title: 'Gripper actions', due_at: '2026-12-04', learning_status: 'assigned', status: 'assigned', instructions: 'Build a safe gripper sequence. This browser fixture never controls hardware.' },
    { classroom_assignment_id: ids.b, title: 'Learning preview coordinates', course_title: 'Robot Programming', classroom_name: '8A2 · Demo', lesson_title: 'Coordinate preview', due_at: null, learning_status: 'started', status: 'in_progress', attempt_id: ids.attempt, instructions: 'Move within the learning preview coordinate frame.' }
  ];
  const assignments = {
    [ids.a]: { id: ids.a, title: rows[0].title, course_title: rows[0].course_title, constraints: { kind: 'symbolic_program' }, allowed_blocks: ['arm.select', 'gripper.open', 'gripper.close', 'wait'] },
    [ids.b]: { id: ids.b, title: rows[1].title, course_title: rows[1].course_title, constraints: { kind: 'symbolic_program' }, allowed_blocks: ['arm.select', 'home', 'preview.move_xyz', 'wait'] }
  };
  const attempts = new Map();
  const programs = new Map();
  const drafts = new Map();
  const versions = new Map();
  let config = { mock: true, rememberedUsername: '', persistentSession: false };
  let user = { id: 'demo-student', name: 'Nguyễn Minh · Demo', studentCode: 'HS-DEMO', className: '8A2 · Demo', schoolName: 'VISTA Demo' };

  const mock = {
    async login({ studentCode }) { user = { ...user, studentCode: studentCode || 'HS-DEMO' }; return { user }; },
    async setupStudent() { throw new Error('Account setup requires the real Education API.'); },
    async recoverStudent() { throw new Error('Password recovery requires the real Education API.'); },
    async logout() {},
    async me() { return user; },
    async listLabs() { return rows; },
    async history() { return []; },
    async assignment(id) { return assignments[id]; },
    async startAttempt(id) { const result = { id: ids.attempt, classroom_assignment_id: id, status: 'in_progress' }; attempts.set(id, result); return result; },
    async getAttempt(id) { return attempts.get(id) || { id, status: 'in_progress' }; },
    async getProgram(attemptId) { return programs.get(attemptId) || null; },
    async createProgram(attemptId, body) { const p = { id: ids.program, ...body }; programs.set(attemptId, p); return p; },
    async updateProgram(programId, body) { const p = { id: programId, ...body }; for (const [k] of programs) programs.set(k, p); return p; },
    async createProgramVersion(programId) {
      const program = [...programs.values()].find((entry) => entry.id === programId);
      const list = versions.get(programId) || [];
      const versionNumber = list.length + 1;
      const v = { id: ids.version.slice(0, -1) + String(versionNumber % 10), program_id: programId, version_number: versionNumber, created_at: new Date().toISOString(), workspace_json: program?.workspaceJson, robot_program: program?.robotProgram };
      versions.set(programId, [...list, v]); return v;
    },
    async programVersions(programId) { return versions.get(programId) || []; },
    async digitalTwinAvailability() { return []; },
    async issueTwinViewerScope() { throw new Error('Digital Twin scope issuance requires the real Education API.'); },
    async submitAttempt() { return { status: 'submitted' }; },
    async createSchematicExperiment() { throw new Error('Demo mode does not call the server schematic API.'); },
    async runSchematic() { throw new Error('Demo mode does not call the server schematic API.'); },
    async experimentStatus() { return { status: 'unavailable' }; },
    async experimentEvents() { return { items: [] }; },
    async experimentResult() { return null; },
    async physicalEligibility() { return { eligible: false, code: 'DEMO_ONLY', message: 'Browser fixture; physical execution is disabled.', readiness: { allocated: false, entitled: false, symbolicPassed: false, runtimeOnline: false, checkikReachable: false, runtimeStopped: true, estopActive: false, activeSession: false } }; },
    async activePhysicalExecution() { return null; },
    async preparePhysicalExecution() { throw new Error('Demo mode never allocates physical sessions.'); },
    async startPhysicalExecution() { throw new Error('Demo mode never starts physical motion.'); },
    async physicalStatus() { return { status: 'unavailable' }; },
    async stopPhysicalExecution() { throw new Error('Demo mode has no physical session.'); }
  };
  window.vista = {
    call: async (method, ...args) => {
      if (!mock[method]) return { ok: false, error: `Method not available in browser demo: ${method}` };
      try { return { ok: true, data: await mock[method](...args) }; }
      catch (error) { return { ok: false, error: error.message }; }
    },
    getCfg: async () => ({ ...config }),
    setCfg: async (value) => { config = { ...config, rememberedUsername: value.rememberedUsername || '' }; return { ...config }; },
    loadDraft: async (id) => drafts.get(id) || null,
    saveDraft: async (id, draft) => { drafts.set(id, draft); return { saved: true }; },
    loadSO101Model: null
  };
})();
