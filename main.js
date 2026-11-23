const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('./api');
const { secureStorageAvailable: storageAvailable } = require('./session-security');
const { isTrustedMainFrame, validateTwinWsUrl, validateEvidenceDownloadUrl } = require('./ipc-security');
const { EdgeRobotRuntime } = require('./robot-runtime');
const { EdgeSupervisor } = require('./edge-supervisor');
const { DeviceProvisioning } = require('./device-provisioning');

const defaults = {
  mock: process.env.VISTA_DESKTOP_DEMO === '1',
  // Operators must choose an environment explicitly. An unset release must
  // never silently connect a student to Production.
  educationApi: process.env.VISTA_EDUCATION_API || '',
  deviceProvisioningEnabled: process.env.VISTA_DEVICE_PROVISIONING_ENABLED === 'true',
  supabaseUrl: process.env.VISTA_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VISTA_SUPABASE_ANON_KEY || '',
  twinWsUrl: '',
  rememberedUsername: ''
};
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const sessionPath = () => path.join(app.getPath('userData'), 'session.enc');
const draftsDir = () => path.join(app.getPath('userData'), 'drafts');
const loadConfig = () => {
  let twinWsUrl = '';
  let twinWsConfigurationError = '';
  const envUrl = process.env.VISTA_TWIN_WS_URL;
  if (envUrl) {
    try { twinWsUrl = validateTwinWsUrl(envUrl); }
    catch (error) { twinWsConfigurationError = error.message; }
  }
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    let savedTwinWsUrl = '';
    try { savedTwinWsUrl = validateTwinWsUrl(saved.twinWsUrl); } catch {}
    return { ...defaults, rememberedUsername: typeof saved.rememberedUsername === 'string' ? saved.rememberedUsername.slice(0, 80) : '', twinWsUrl: envUrl ? twinWsUrl : savedTwinWsUrl, twinWsConfigurationError, mujocoModelPath: typeof saved.mujocoModelPath === 'string' ? saved.mujocoModelPath : '', mock: defaults.mock };
  } catch { return { ...defaults, twinWsUrl, twinWsConfigurationError }; }
};

let config;
let client;
let mainWindow;
let activeDraftOwner = null;
const edgeRuntime = new EdgeRobotRuntime();
let edgeSupervisor;
let deviceProvisioning;

// Work around Chromium GPU-process startup failures on affected Linux hosts.
// This is an operator opt-in; it does not disable Electron's sandbox or
// change renderer isolation/web security settings.
if (process.platform === 'linux' && process.env.VISTA_ELECTRON_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
}

function registerHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedMainFrame(event, mainWindow, path.join(__dirname, 'renderer', 'index.html'))) throw new Error('Untrusted renderer.');
    return handler(...args);
  });
}

if (process.env.NODE_ENV === 'test' && process.env.VISTA_DESKTOP_TEST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.VISTA_DESKTOP_TEST_USER_DATA));
}

function persistSession(session) {
  if (!session || !secureStorageAvailable()) return false;
  const encrypted = safeStorage.encryptString(JSON.stringify(session));
  fs.writeFileSync(sessionPath(), encrypted, { mode: 0o600 });
  return true;
}

function clearPersistedSession() {
  try { fs.rmSync(sessionPath(), { force: true }); } catch {}
}

function readPersistedSession() {
  if (!secureStorageAvailable()) { clearPersistedSession(); return null; }
  try {
    const encrypted = fs.readFileSync(sessionPath());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch { clearPersistedSession(); return null; }
}

function secureStorageAvailable() {
  return storageAvailable(safeStorage);
}

function apiError(error) {
  return { ok: false, error: error instanceof Error ? error.message : 'Request failed', code: error?.code, status: error?.status };
}

const twinMeshFiles = new Set([
  'base_motor_holder_so101_v1.stl', 'base_so101_v2.stl', 'sts3215_03a_v1.stl',
  'waveshare_mounting_plate_so101_v2.stl', 'motor_holder_so101_base_v1.stl',
  'rotation_pitch_so101_v1.stl', 'upper_arm_so101_v1.stl', 'under_arm_so101_v1.stl',
  'motor_holder_so101_wrist_v1.stl', 'sts3215_03a_no_horn_v1.stl',
  'wrist_roll_pitch_so101_v2.stl', 'wrist_roll_follower_so101_v1.stl',
  'moving_jaw_so101_v1.stl'
]);

function safeId(value) {
  const id = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && !(config?.mock && /^demo-[0-9]$/.test(id))) throw new Error('Invalid draft key.');
  return id;
}

function draftPath(attemptId) {
  if (!activeDraftOwner || (!config.mock && !client.getSession?.())) throw new Error('Sign in before accessing local drafts.');
  return path.join(draftsDir(), activeDraftOwner, `${safeId(attemptId)}.json`);
}

function rememberDraftOwner(profile) {
  const identity = profile?.id || (config.mock && profile?.studentCode);
  activeDraftOwner = identity ? crypto.createHash('sha256').update(String(identity)).digest('hex') : null;
}

app.whenReady().then(() => {
  config = loadConfig();
  client = createClient(config);
  edgeSupervisor = new EdgeSupervisor({ app, logPath: path.join(app.getPath('userData'), 'logs', 'edge-runtime.jsonl'), modelPath: config.mujocoModelPath });
  deviceProvisioning = new DeviceProvisioning({ safeStorage, storageDir: path.join(app.getPath('userData'), 'device-identity') });
  // The renderer can still open when a packaged runtime is absent; setup will report BLOCKED.
  edgeSupervisor.start();

  registerHandle('cfg:get', () => ({
    mock: config.mock,
    educationApi: config.educationApi,
    deviceProvisioningEnabled: config.deviceProvisioningEnabled,
    twinWsUrl: config.twinWsUrl,
    twinWsConfigurationError: config.twinWsConfigurationError,
    twinWsManagedByEnvironment: Boolean(process.env.VISTA_TWIN_WS_URL),
    rememberedUsername: config.rememberedUsername,
    persistentSession: secureStorageAvailable()
  }));
  registerHandle('edge:status', () => edgeRuntime.status());
  const requireLocalSession = () => {
    if (!config.mock && !client.getSession?.()) throw new Error('Sign in before using the local Edge Runtime.');
  };
  registerHandle('policy:list', async () => { requireLocalSession(); return edgeSupervisor.request('policy_list'); });
  registerHandle('policy:inspect', async (repositoryId, revision) => { requireLocalSession(); return edgeSupervisor.request('policy_inspect', { repositoryId, revision: revision || 'main' }, 30000); });
  registerHandle('policy:import', async (repositoryId, revision) => {
    requireLocalSession();
    return edgeSupervisor.request('policy_import', { repositoryId, revision: revision || 'main' }, 10 * 60_000,
      (progress) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('policy:progress', progress); });
  });
  registerHandle('policy:load', async (policyId, device) => { requireLocalSession(); return edgeSupervisor.request('policy_load', { policyId, device: device || 'cpu' }, 120000); });
  registerHandle('policy:unload', async () => { requireLocalSession(); return edgeSupervisor.request('policy_unload'); });
  registerHandle('policy:stop', async () => { requireLocalSession(); return edgeSupervisor.request('policy_stop'); });
  registerHandle('policy:run', async (prompt) => {
    requireLocalSession();
    return edgeSupervisor.request('policy_run', { prompt: typeof prompt === 'string' ? prompt : '' }, 120000,
      (frame) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('policy:frame', frame); });
  });
  const stopFakeTeleoperation = () => {
    for (const pairId of ['pair-a', 'pair-b']) void edgeSupervisor.request('teleop_disconnect', { pairId }).catch(() => {});
  };
  registerHandle('edge:diagnostics', async () => { requireLocalSession(); return edgeSupervisor.diagnostics(); });
  registerHandle('edge:ports', async () => { requireLocalSession(); return edgeSupervisor.request('ports'); });
  registerHandle('edge:connect', async (selection = {}) => {
    requireLocalSession();
    if (!selection || typeof selection.port !== 'string' || typeof selection.deviceId !== 'string') throw new Error('Choose a discovered serial port and robot ID.');
    return edgeSupervisor.request('connect', { ...selection, role: selection.role || 'follower', mode: 'PHYSICAL ROBOT READ ONLY', confirmed: selection.confirmed === true }, 15000);
  });
  registerHandle('edge:disconnect', async (role) => { requireLocalSession(); return edgeSupervisor.request('disconnect', role ? { role } : {}); });
  registerHandle('edge:joint-state', async (role = 'follower') => { requireLocalSession(); return edgeSupervisor.request('joint_state', { role }); });
  registerHandle('edge:calibration-status', async () => { requireLocalSession(); return edgeSupervisor.request('calibration_status'); });
  registerHandle('edge:calibration-profiles', async (role) => {
    requireLocalSession();
    if (!['leader', 'follower'].includes(role)) throw new Error('Select leader or follower explicitly.');
    return edgeSupervisor.request('calibration_profiles', { role });
  });
  registerHandle('edge:calibration-start', async (params = {}) => {
    requireLocalSession();
    if (!params || typeof params !== 'object') throw new Error('Calibration selection is invalid.');
    return edgeSupervisor.request('calibration_start', {
      role: params.role, port: params.port, profileId: params.profileId,
      confirmed: params.confirmed === true
    }, 5000);
  });
  registerHandle('edge:calibration-complete-step', async () => { requireLocalSession(); return edgeSupervisor.request('calibration_complete_step'); });
  registerHandle('edge:calibration-stop', async () => { requireLocalSession(); return edgeSupervisor.request('calibration_stop', {}, 10000); });
  registerHandle('edge:teleop-status', async () => { requireLocalSession(); return edgeSupervisor.request('teleop_status'); });
  registerHandle('edge:teleop-configure', async (pairId, confirmed) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId)) throw new Error('Select one of the two fake simulation pairs.');
    if (confirmed !== true) throw new Error('Fake-pair setup requires explicit operator confirmation.');
    return edgeSupervisor.request('teleop_configure', {
      pairId, leaderPort: `fake://${pairId}/leader`, followerPort: `fake://${pairId}/follower`, confirmed
    });
  });
  registerHandle('edge:teleop-enable', async (pairId, confirmed) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId)) throw new Error('Select one of the two fake simulation pairs.');
    return edgeSupervisor.request('teleop_enable', { pairId, confirmed: confirmed === true });
  });
  registerHandle('edge:teleop-deadman', async (pairId, held, confirmed) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId) || typeof held !== 'boolean') throw new Error('Fake pair or deadman state is invalid.');
    return edgeSupervisor.request('teleop_deadman', { pairId, held, confirmed: confirmed === true });
  });
  registerHandle('edge:teleop-disable', async (pairId) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId)) throw new Error('Select one of the two fake simulation pairs.');
    return edgeSupervisor.request('teleop_disable', { pairId });
  });
  registerHandle('edge:teleop-step', async (frame = {}) => {
    requireLocalSession();
    if (!frame || !['pair-a', 'pair-b'].includes(frame.pairId)) throw new Error('Select a fake simulation pair.');
    return edgeSupervisor.request('teleop_step', {
      pairId: frame.pairId, leader: frame.leader, sequence: frame.sequence,
      timestamp: frame.timestamp, deadmanHeld: frame.deadmanHeld === true
    }, 1000);
  });
  registerHandle('edge:teleop-estop', async (pairId) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId)) throw new Error('Select a fake simulation pair.');
    return edgeSupervisor.request('teleop_estop', { pairId });
  });
  registerHandle('edge:teleop-reset', async (pairId, confirmed) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId)) throw new Error('Select a fake simulation pair.');
    return edgeSupervisor.request('teleop_reset', { pairId, confirmed: confirmed === true });
  });
  registerHandle('edge:teleop-disconnect', async (pairId) => {
    requireLocalSession();
    if (!['pair-a', 'pair-b'].includes(pairId)) throw new Error('Select a fake simulation pair.');
    return edgeSupervisor.request('teleop_disconnect', { pairId });
  });
  registerHandle('simulation:select-model', async () => {
    requireLocalSession();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose SO-101 MuJoCo scene', properties: ['openFile'],
      filters: [{ name: 'MuJoCo XML scene', extensions: ['xml', 'mjcf'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const selected = fs.realpathSync(result.filePaths[0]);
    if (!/\.(xml|mjcf)$/i.test(selected)) throw new Error('Choose a MuJoCo XML/MJCF file.');
    const simulation = await edgeSupervisor.request('load_model', { path: selected }, 30000);
    config.mujocoModelPath = selected;
    fs.mkdirSync(path.dirname(configPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(configPath(), JSON.stringify({ rememberedUsername: config.rememberedUsername, twinWsUrl: config.twinWsUrl, mujocoModelPath: selected }), { mode: 0o600 });
    fs.chmodSync(configPath(), 0o600);
    return simulation;
  });
  registerHandle('edge:cancel-simulation', async () => {
    requireLocalSession();
    return edgeSupervisor.request('cancel_simulation');
  });
  registerHandle('edge:pause-simulation', async () => {
    requireLocalSession();
    return edgeSupervisor.request('pause_simulation');
  });
  registerHandle('edge:resume-simulation', async () => {
    requireLocalSession();
    return edgeSupervisor.request('resume_simulation');
  });
  registerHandle('provisioning:status', () => deviceProvisioning.status());
  registerHandle('provisioning:create-key', () => { requireLocalSession(); return deviceProvisioning.createEnrollmentKey(); });
  registerHandle('provisioning:enroll', async (enrollmentCode) => { requireLocalSession(); if (!config.deviceProvisioningEnabled) throw new Error('Device provisioning is disabled by operator policy.'); return deviceProvisioning.enroll(enrollmentCode); });
  registerHandle('provisioning:refresh', async () => { requireLocalSession(); if (!config.deviceProvisioningEnabled) throw new Error('Device provisioning is disabled by operator policy.'); return deviceProvisioning.authenticate(); });
  registerHandle('evidence:open', async (experimentId, artifactId) => {
    requireLocalSession();
    if (config.mock) throw new Error('Evidence downloads require the real Education API.');
    const result = await client.experimentArtifactDownload(experimentId, artifactId);
    if (result?.status !== 'available' || typeof result.url !== 'string') throw new Error('This evidence file is not currently available.');
    await shell.openExternal(validateEvidenceDownloadUrl(result.url));
    return { status: 'opened' };
  });
  registerHandle('edge:simulate', async (attemptId, command, confirmation) => {
    if (!client.getSession?.() && !config.mock) throw new Error('Sign in before running a lab simulation.');
    if (typeof attemptId !== 'string' || !attemptId || attemptId.length > 80) throw new Error('Invalid lab attempt.');
    const attempt = await client.getAttempt(attemptId);
    if (attempt?.id !== attemptId || attempt?.status !== 'in_progress') throw new Error('VISTA no longer authorizes this attempt for local simulation.');
    if (!command || !Number.isSafeInteger(command.expiresAt) || command.expiresAt <= Date.now()) throw new Error('Simulation command is expired.');
    const authorization = { allowed: true, attemptId: attempt.id, expiresAt: Math.min(command.expiresAt, Date.now() + 5 * 60_000) };
    return edgeSupervisor.request('simulate', { attempt, authorization, command, confirmation }, 5 * 60_000,
      (frame) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('simulation:frame', frame); });
  });
  registerHandle('cfg:set', (patch = {}) => {
    const activeSession = client.getSession?.();
    const next = { ...config };
    if (typeof patch.rememberedUsername === 'string') next.rememberedUsername = patch.rememberedUsername.slice(0, 80);
    if (typeof patch.twinWsUrl === 'string' && process.env.VISTA_TWIN_WS_URL) throw new Error('Twin endpoint is managed by VISTA_TWIN_WS_URL in the operator environment.');
    if (typeof patch.twinWsUrl === 'string') next.twinWsUrl = patch.twinWsUrl.trim() ? validateTwinWsUrl(patch.twinWsUrl) : '';
    config = next;
    fs.mkdirSync(path.dirname(configPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(configPath(), JSON.stringify({ rememberedUsername: config.rememberedUsername, twinWsUrl: config.twinWsUrl, mujocoModelPath: config.mujocoModelPath || '' }), { mode: 0o600 });
    fs.chmodSync(configPath(), 0o600);
    client = createClient(config);
    if (activeSession) client.setSession(activeSession);
    return { mock: config.mock, educationApi: config.educationApi, twinWsUrl: config.twinWsUrl, twinWsConfigurationError: config.twinWsConfigurationError, twinWsManagedByEnvironment: Boolean(process.env.VISTA_TWIN_WS_URL), rememberedUsername: config.rememberedUsername, persistentSession: secureStorageAvailable() };
  });

  registerHandle('session:restore', async () => {
    const saved = readPersistedSession();
    if (!saved && config.mock) return { user: null, persistent: secureStorageAvailable() };
    try {
      const user = await client.restoreSession(saved);
      if (!user) return { user: null, persistent: secureStorageAvailable() };
      persistSession(client.getSession());
      if (!user.passwordChangeRequired) rememberDraftOwner(user);
      return user.passwordChangeRequired
        ? { user: null, passwordChangeRequired: true, persistent: secureStorageAvailable() }
        : { user, persistent: secureStorageAvailable() };
    } catch {
      activeDraftOwner = null;
      clearPersistedSession();
      await client.logout();
      return { user: null, persistent: secureStorageAvailable(), expired: true };
    }
  });

  registerHandle('api', async (method, ...args) => {
    const allowed = new Set([
      'login', 'setupStudent', 'changeStudentPassword', 'recoverStudent', 'logout', 'me', 'listLabs', 'enrollments', 'learningPath', 'history', 'assignment',
      'startAttempt', 'getAttempt', 'getProgram', 'createProgram', 'updateProgram',
      'createProgramVersion', 'submitAttempt', 'createSchematicExperiment', 'runSchematic',
      'experimentStatus', 'experimentEvents', 'experimentResult', 'physicalEligibility',
      'activePhysicalExecution', 'physicalStatus', 'programVersions',
      'digitalTwinAvailability', 'issueTwinViewerScope'
    ]);
    if (!allowed.has(method) || typeof client[method] !== 'function') return { ok: false, error: 'Method not allowed' };
    try {
      const data = await client[method](...args);
      if (method === 'submitAttempt') { edgeRuntime.revokeAuthorization(); void edgeSupervisor.request('cancel_simulation').catch(() => {}); void edgeSupervisor.request('disconnect').catch(() => {}); }
      if (method === 'logout' || (method === 'login' && data?.password_change_required)) activeDraftOwner = null;
      if (method === 'login' || method === 'setupStudent') persistSession(client.getSession());
      if (method === 'logout') { clearPersistedSession(); edgeRuntime.revokeAuthorization(); void edgeSupervisor.request('cancel_simulation').catch(() => {}); void edgeSupervisor.request('disconnect').catch(() => {}); stopFakeTeleoperation(); }
      else if (client.getSession?.()) persistSession(client.getSession());
      if (method === 'login' && data?.password_change_required) {
        return { ok: true, data: { passwordChangeRequired: true, persistentSession: secureStorageAvailable() } };
      }
      if (method === 'changeStudentPassword') {
        const user = await client.me(); rememberDraftOwner(user);
        return { ok: true, data: { user, persistentSession: secureStorageAvailable() } };
      }
      if (method === 'login' || (method === 'setupStudent' && client.getSession())) {
        const user = await client.me(); rememberDraftOwner(user);
        return { ok: true, data: { user, persistentSession: secureStorageAvailable() } };
      }
      if (method === 'me') rememberDraftOwner(data);
      return { ok: true, data };
    } catch (error) {
      if (['SESSION_EXPIRED', 'SESSION_ROTATED', 'TEMPORARY_PASSWORD_EXPIRED'].includes(error?.code) || (['login', 'setupStudent'].includes(method) && client.getSession?.())) {
        activeDraftOwner = null;
        edgeRuntime.revokeAuthorization();
        void edgeSupervisor.request('cancel_simulation').catch(() => {});
        void edgeSupervisor.request('disconnect').catch(() => {});
        stopFakeTeleoperation();
        clearPersistedSession();
        await client.logout();
      }
      return apiError(error);
    }
  });

  registerHandle('draft:load', (assignmentId) => {
    const file = draftPath(assignmentId);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  });
  registerHandle('draft:save', (assignmentId, draft) => {
    if (!draft || typeof draft !== 'object' || JSON.stringify(draft).length > 2_000_000) throw new Error('Draft is invalid or too large.');
    const file = draftPath(assignmentId);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(draft), { mode: 0o600 });
    return { saved: true };
  });
  registerHandle('asset:twin-urdf', () => fs.readFileSync(path.join(__dirname, 'renderer', 'assets', 'so101', 'urdf', 'so101_new_calib.urdf'), 'utf8'));
  registerHandle('asset:twin-mesh', (filename) => {
    if (typeof filename !== 'string' || !twinMeshFiles.has(filename)) throw new Error('SO-101 mesh is not in the bundled asset list.');
    return fs.readFileSync(path.join(__dirname, 'renderer', 'assets', 'so101', 'meshes', filename));
  });

  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 680,
    title: 'VISTA Lab Station',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://' + path.join(__dirname, 'renderer', 'index.html'))) event.preventDefault();
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
let edgeShutdownStarted = false;
app.on('before-quit', (event) => {
  if (edgeShutdownStarted || !edgeSupervisor) return;
  event.preventDefault();
  edgeShutdownStarted = true;
  void edgeSupervisor.stop().finally(() => app.quit());
});
