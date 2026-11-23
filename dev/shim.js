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
  const experiments = new Map();
  // Browser preview teleoperation is a separate in-memory fake adapter. It
  // cannot open serial ports and mirrors Edge Runtime's validated state gates.
  const teleopJointNames = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
  const teleopLimits = {
    shoulder_pan: [-1.91986, 1.91986], shoulder_lift: [-1.7453293, 1.7453293],
    elbow_flex: [-1.69, 1.69], wrist_flex: [-1.658063, 1.658063],
    wrist_roll: [-2.7438473, 2.8412063], gripper: [-0.174533, 1.7453292]
  };
  const teleopPairs = new Map(['pair-a', 'pair-b'].map((pairId) => [pairId, {
    pairId, state: 'DISCONNECTED', connected: false, enabled: false, deadmanHeld: false,
    emergencyStopLatched: false, physicalOutputEnabled: false, feedback: Object.fromEntries(teleopJointNames.map((name) => [name, 0])),
    commandCount: 0, sequence: -1, lastCommandAt: 0, lastInputAt: 0, fault: null, watchdog: null
  }]));
  const teleopStatusRow = (pair) => ({
    pairId: pair.pairId, mode: 'DEMO FAKE SIMULATION', state: pair.state, connected: pair.connected,
    enabled: pair.enabled, deadmanHeld: pair.deadmanHeld, emergencyStopLatched: pair.emergencyStopLatched,
    physicalOutputEnabled: false, feedback: { ...pair.feedback }, commandCount: pair.commandCount, fault: pair.fault
  });
  const teleopPair = (pairId) => {
    const pair = teleopPairs.get(pairId);
    if (!pair) throw new Error('Select one of the two fake simulation pairs.');
    return pair;
  };
  const clearTeleopWatchdog = (pair) => { if (pair.watchdog) clearTimeout(pair.watchdog); pair.watchdog = null; };
  const faultTeleopPair = (pair, reason) => {
    clearTeleopWatchdog(pair); pair.deadmanHeld = false; pair.enabled = false; pair.state = 'FAULT'; pair.fault = reason;
  };
  const scheduleTeleopWatchdog = (pair) => {
    clearTeleopWatchdog(pair);
    pair.watchdog = setTimeout(() => {
      if (pair.deadmanHeld && Date.now() - pair.lastInputAt >= 150) faultTeleopPair(pair, 'deadman_timeout');
    }, 160);
  };
  const teleopConfigurePair = (pairId, confirmed) => {
    const pair = teleopPair(pairId);
    if (confirmed !== true || pair.state !== 'DISCONNECTED') throw new Error('Fake-pair setup requires explicit confirmation while disconnected.');
    pair.connected = true; pair.state = 'DISABLED'; pair.enabled = false; pair.deadmanHeld = false;
    pair.emergencyStopLatched = false; pair.fault = null; pair.feedback = Object.fromEntries(teleopJointNames.map((name) => [name, 0]));
    pair.commandCount = 0; pair.sequence = -1; pair.lastCommandAt = 0; pair.lastInputAt = 0;
    return teleopStatusRow(pair);
  };
  const teleopEnable = (pairId, confirmed) => {
    const pair = teleopPair(pairId);
    if (confirmed !== true || !pair.connected || pair.emergencyStopLatched || pair.state === 'FAULT') throw new Error('Fake pair must be connected and safely reset before explicit enable.');
    pair.enabled = true; pair.deadmanHeld = false; pair.state = 'ARMED';
    return teleopStatusRow(pair);
  };
  const teleopDeadman = (pairId, held, confirmed) => {
    const pair = teleopPair(pairId);
    if (confirmed !== true || typeof held !== 'boolean') throw new Error('Deadman state requires an explicit operator action.');
    if (held && (!pair.connected || !pair.enabled || pair.emergencyStopLatched || !['ARMED', 'ACTIVE'].includes(pair.state))) throw new Error('Fake pair is not safely armed for deadman hold.');
    pair.deadmanHeld = held;
    if (held) { pair.lastInputAt = Date.now(); scheduleTeleopWatchdog(pair); }
    else {
      clearTeleopWatchdog(pair);
      if (pair.connected && pair.enabled && !pair.emergencyStopLatched) pair.state = 'ARMED';
    }
    return teleopStatusRow(pair);
  };
  const teleopStep = ({ pairId, leader, sequence, timestamp, deadmanHeld }) => {
    const pair = teleopPair(pairId);
    const reject = (reason) => ({ accepted: false, reason, status: teleopStatusRow(pair) });
    if (!pair.connected || !pair.enabled || pair.emergencyStopLatched || pair.state === 'FAULT') return reject('not_armed');
    if (!pair.deadmanHeld || deadmanHeld !== true) return reject('deadman_released');
    const now = Date.now() / 1000;
    if (!Number.isInteger(sequence) || sequence <= pair.sequence) return reject('replayed_sequence');
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 0.150) return reject('stale_input');
    if (!leader || Object.keys(leader).length !== teleopJointNames.length || teleopJointNames.some((name) => !Number.isFinite(leader[name]) || leader[name] < teleopLimits[name][0] || leader[name] > teleopLimits[name][1])) return reject('invalid_joint_state');
    if (pair.lastCommandAt && now - pair.lastCommandAt < 0.040) return reject('command_rate_limited');
    pair.sequence = sequence; pair.lastInputAt = Date.now(); pair.lastCommandAt = now;
    pair.feedback = Object.fromEntries(teleopJointNames.map((name) => [name, leader[name]]));
    pair.commandCount += 1; pair.state = 'ACTIVE'; scheduleTeleopWatchdog(pair);
    return {
      accepted: true, reason: null, status: teleopStatusRow(pair),
      frame: { schema_version: 1, robot_id: `local-so101-${pairId}`, source_mode: 'SIMULATION', controller_id: `fake-teleop-${pairId}`, sequence, connection: 'connected', calibration_status: 'NOT_APPLICABLE', measured_at: new Date().toISOString(), measured: teleopJointNames.map((name) => ({ name, position: pair.feedback[name], unit: 'rad' })), calibrated: null }
    };
  };
  const teleopDisable = (pairId) => {
    const pair = teleopPair(pairId); clearTeleopWatchdog(pair); pair.enabled = false; pair.deadmanHeld = false;
    if (pair.connected && !pair.emergencyStopLatched) pair.state = 'DISABLED';
    return teleopStatusRow(pair);
  };
  const teleopEmergencyStop = (pairId) => {
    const pair = teleopPair(pairId); clearTeleopWatchdog(pair); pair.enabled = false; pair.deadmanHeld = false;
    pair.emergencyStopLatched = true; pair.state = 'STOPPED'; pair.fault = 'emergency_stop';
    return teleopStatusRow(pair);
  };
  const teleopReset = (pairId, confirmed) => {
    const pair = teleopPair(pairId);
    if (confirmed !== true || !pair.connected || !pair.emergencyStopLatched) throw new Error('A connected fake pair and explicit emergency-stop reset are required.');
    pair.emergencyStopLatched = false; pair.enabled = false; pair.deadmanHeld = false; pair.state = 'DISABLED'; pair.fault = null;
    return teleopStatusRow(pair);
  };
  const teleopDisconnect = (pairId) => {
    const pair = teleopPair(pairId); clearTeleopWatchdog(pair); pair.connected = false; pair.enabled = false;
    pair.deadmanHeld = false; pair.state = 'DISCONNECTED'; pair.fault = 'disconnected';
    return teleopStatusRow(pair);
  };
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
    async createSchematicExperiment(attemptId, { programVersionId }) {
      const experiment = { id: `demo-experiment-${experiments.size + 1}`, attemptId, programVersionId, status: 'pending', execution_mode: 'schematic' };
      experiments.set(experiment.id, experiment); return experiment;
    },
    async runSchematic(experimentId) {
      const experiment = experiments.get(experimentId);
      if (!experiment) throw new Error('Demo experiment was not found.');
      experiment.status = 'succeeded';
      experiment.result = { mode: 'schematic', physicalMotion: false, message: 'Demo schematic result; no MuJoCo or backend execution occurred.' };
      return experiment;
    },
    async experimentStatus(experimentId) { return experiments.get(experimentId) || { status: 'unavailable' }; },
    async experimentResult(experimentId) { return experiments.get(experimentId)?.result || null; },
    async experimentEvents() { return { items: [] }; },
    async digitalTwinAvailability() { return []; },
    async issueTwinViewerScope() { throw new Error('Digital Twin scope issuance requires the real Education API.'); },
    async submitAttempt(attemptId) {
      const attempt = attempts.get(attemptId) || { id: attemptId, status: 'in_progress' };
      attempt.status = 'submitted';
      attempts.set(attemptId, attempt);
      const row = rows.find((item) => item.classroom_assignment_id === attempt.classroom_assignment_id);
      if (row) { row.attempt_status = 'submitted'; row.learning_status = 'completed'; row.status = 'submitted'; }
      return { status: 'submitted' };
    },
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
    // This browser-only fixture is deliberately empty and can never report a
    // connected robot or successful calibration.
    edgeDiagnostics: async () => ({ state: 'ACTION REQUIRED', status: {
      leader: { connected: false, calibrated: false, calibration: 'ACTION REQUIRED', motionEnabled: false },
      physical: { connected: false, calibrated: false, calibration: 'ACTION REQUIRED', motionEnabled: false }
    } }),
    edgePorts: async () => ({ items: [] }),
    edgeConnect: async () => { throw new Error('Browser preview cannot open serial hardware.'); },
    edgeDisconnect: async () => { throw new Error('Browser preview cannot open serial hardware.'); },
    edgeJointState: async () => { throw new Error('No hardware is connected in browser preview.'); },
    edgeCalibrationStatus: async () => ({ active: false, status: 'idle', calibrated: false, motionEnabled: false, message: 'Browser preview only · no hardware calibration is available.' }),
    edgeCalibrationProfiles: async (role) => ({ role, items: [], available: false }),
    edgeCalibrationStart: async () => { throw new Error('Browser preview cannot start hardware calibration.'); },
    edgeCalibrationCompleteStep: async () => { throw new Error('Browser preview cannot complete hardware calibration.'); },
    edgeCalibrationStop: async () => ({ active: false, status: 'idle', calibrated: false, motionEnabled: false }),
    teleopStatus: async () => Object.fromEntries([...teleopPairs].map(([id, pair]) => [id, teleopStatusRow(pair)])),
    teleopConfigurePair: async (pairId, confirmed) => teleopConfigurePair(pairId, confirmed),
    teleopEnable: async (pairId, confirmed) => teleopEnable(pairId, confirmed),
    teleopDeadman: async (pairId, held, confirmed) => teleopDeadman(pairId, held, confirmed),
    teleopStep: async (frame) => teleopStep(frame),
    teleopDisable: async (pairId) => teleopDisable(pairId),
    teleopEmergencyStop: async (pairId) => teleopEmergencyStop(pairId),
    teleopReset: async (pairId, confirmed) => teleopReset(pairId, confirmed),
    teleopDisconnect: async (pairId) => teleopDisconnect(pairId),
    loadSO101Model: null
  };
  window.vista.__demoFailures = [];
  for (const [name, method] of Object.entries(window.vista)) {
    if (typeof method !== 'function') continue;
    window.vista[name] = async (...args) => {
      try {
        const result = await method(...args);
        if (name === 'call' && result?.ok === false) window.vista.__demoFailures.push({ method: args[0], error: result.error });
        return result;
      } catch (error) {
        window.vista.__demoFailures.push({ method: name, error: error?.message || String(error) });
        throw error;
      }
    };
  }
})();
