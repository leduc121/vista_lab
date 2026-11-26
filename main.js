const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Readable } = require('node:stream');
const { createClient } = require('./api');
const { secureStorageAvailable: storageAvailable } = require('./session-security');
const { isTrustedMainFrame, validateTwinWsUrl, validateEvidenceDownloadUrl } = require('./ipc-security');
const { EdgeRobotRuntime } = require('./robot-runtime');
const { EdgeSupervisor } = require('./edge-supervisor');
const { DeviceProvisioning } = require('./device-provisioning');
const { RecordingManager } = require('./recording-manager');
const { PolicyActionRecorder } = require('./policy-action-recorder');

const defaults = {
  mock: process.env.VISTA_DESKTOP_DEMO === '1',
  // Physical output is intentionally unavailable in Phase 1. Keep these
  // explicit in the main process so UI labels cannot enable hardware.
  fakeRobot: true,
  hardwareEnabled: false,
  // Operators must choose an environment explicitly. An unset release must
  // never silently connect a student to Production.
  educationApi: process.env.VISTA_EDUCATION_API || '',
  deviceProvisioningEnabled: process.env.VISTA_DEVICE_PROVISIONING_ENABLED === 'true',
  iot: { endpoint: 'am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com', port: 8883,
    thingName: 'vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9', robotId: 'f1c066c4-b5f2-45c4-b933-f034f3824dd9',
    topicPrefix: 'vista/demo/robots', caPath: '', certificatePath: '', privateKeyPath: '', enabled: false },
  supabaseUrl: process.env.VISTA_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VISTA_SUPABASE_ANON_KEY || '',
  twinWsUrl: '',
  deviceMappings: {},
  rememberedUsername: ''
};
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const sessionPath = () => path.join(app.getPath('userData'), 'session.enc');
const draftsDir = () => path.join(app.getPath('userData'), 'drafts');
const normalizeDeviceMappings = (source) => {
  const slots = ['leader-a', 'follower-a', 'leader-b', 'follower-b'];
  const result = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
  for (const slot of slots) {
    const item = source[slot];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const port = typeof item.port === 'string' && item.port.length <= 256 ? item.port : '';
    const deviceId = typeof item.deviceId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(item.deviceId) ? item.deviceId : '';
    result[slot] = { port, deviceId };
  }
  return result;
};
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
    const iot = { ...defaults.iot, ...(saved.iot && typeof saved.iot === 'object' ? saved.iot : {}) };
    iot.enabled = false;
    return { ...defaults, iot, rememberedUsername: typeof saved.rememberedUsername === 'string' ? saved.rememberedUsername.slice(0, 80) : '', deviceMappings: normalizeDeviceMappings(saved.deviceMappings), twinWsUrl: envUrl ? twinWsUrl : savedTwinWsUrl, twinWsConfigurationError, mujocoModelPath: typeof saved.mujocoModelPath === 'string' ? saved.mujocoModelPath : '', runtimeProfile: saved.runtimeProfile === 'robotics' ? 'robotics' : 'simulation', roboticsPython: typeof saved.roboticsPython === 'string' ? saved.roboticsPython : '', roboticsSource: typeof saved.roboticsSource === 'string' ? saved.roboticsSource : '', mock: defaults.mock };
  } catch { return { ...defaults, twinWsUrl, twinWsConfigurationError }; }
};

let config;
let client;
let mainWindow;
let activeDraftOwner = null;
const edgeRuntime = new EdgeRobotRuntime();
let edgeSupervisor;
let deviceProvisioning;
let policyActionRecorder;

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
  edgeSupervisor = new EdgeSupervisor({ app, logPath: path.join(app.getPath('userData'), 'logs', 'edge-runtime.jsonl'), modelPath: config.mujocoModelPath,
    runtimeProfile: config.runtimeProfile, roboticsPython: config.roboticsPython, roboticsSource: config.roboticsSource });
  deviceProvisioning = new DeviceProvisioning({ safeStorage, storageDir: path.join(app.getPath('userData'), 'device-identity') });
  const recordings = new RecordingManager(path.join(app.getPath('userData'), 'recordings'));
  let recordingTimer = null;
  // The renderer can still open when a packaged runtime is absent; setup will report BLOCKED.
  edgeSupervisor.start();

  registerHandle('cfg:get', () => ({
    mock: config.mock,
    fakeRobot: true,
    hardwareEnabled: false,
    deviceMappings: config.deviceMappings,
    educationApi: config.educationApi,
    deviceProvisioningEnabled: config.deviceProvisioningEnabled,
    iot: { endpoint: config.iot.endpoint, port: config.iot.port, thingName: config.iot.thingName, robotId: config.iot.robotId, topicPrefix: config.iot.topicPrefix, enabled: false },
    twinWsUrl: config.twinWsUrl,
    twinWsConfigurationError: config.twinWsConfigurationError,
    twinWsManagedByEnvironment: Boolean(process.env.VISTA_TWIN_WS_URL),
    rememberedUsername: config.rememberedUsername,
    persistentSession: secureStorageAvailable(),
    runtimeProfile: edgeSupervisor.runtimeProfile,
    roboticsPython: config.roboticsPython ? path.basename(config.roboticsPython) : '',
    roboticsSource: config.roboticsSource ? path.basename(config.roboticsSource) : ''
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
  policyActionRecorder = new PolicyActionRecorder(app.getPath('userData'));
  registerHandle('policy:run', async (prompt, context = {}) => {
    requireLocalSession();
    if (typeof prompt !== 'string' || prompt.length > 1000) throw new Error('VLA instruction must be at most 1000 characters.');
    if (!context || typeof context !== 'object' || Array.isArray(context) ||
        Object.keys(context).some((key) => !['experimentId', 'attemptId', 'episodeId'].includes(key)) ||
        Object.values(context).some((value) => typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
      throw new Error('VLA experiment context must contain only valid experiment, attempt, or episode UUIDs.');
    }
    const result = await edgeSupervisor.request('policy_run', { prompt, experiment: context }, 30000,
      (frame) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('policy:frame', frame); });
    result.actionRecord = policyActionRecorder.record(result, prompt, context);
    return result;
  });
  const stopFakeTeleoperation = () => {
    for (const pairId of ['pair-a', 'pair-b']) void edgeSupervisor.request('teleop_disconnect', { pairId }).catch(() => {});
  };
  registerHandle('edge:diagnostics', async () => { requireLocalSession(); return edgeSupervisor.diagnostics(); });
  registerHandle('runtime:select-python', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Select isolated Python 3.12 robotics environment executable' });
    if (!result.canceled && result.filePaths?.[0]) config.roboticsPython = result.filePaths[0];
    return { roboticsPython: config.roboticsPython };
  });
  registerHandle('runtime:select-source', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Select VISTA Edge source root (contains edge/runtime.py)' });
    if (!result.canceled && result.filePaths?.[0]) config.roboticsSource = result.filePaths[0];
    return { roboticsSource: config.roboticsSource };
  });
  registerHandle('runtime:profile', async (profile) => {
    requireLocalSession();
    if (!['simulation', 'robotics'].includes(profile)) throw new Error('Choose simulation or robotics runtime profile.');
    const runtimeCheck = await edgeSupervisor.diagnostics();
    if (Object.values(runtimeCheck.status?.arms || {}).some((arm) => arm?.connected) || runtimeCheck.status?.safety?.state === 'EXECUTING') throw new Error('Runtime profile cannot change while an arm is connected or execution is active. Disconnect and stop first.');
    if (profile === 'robotics') {
      const python = config.roboticsPython;
      const source = config.roboticsSource || (!app.isPackaged ? __dirname : '');
      if (!python || !fs.existsSync(python) || !source || !fs.existsSync(path.join(source, 'edge', 'runtime.py'))) throw new Error('Select a valid isolated Python and VISTA Edge source tree first.');
      const run = promisify(execFile);
      try {
        const probe = await run(python, ['-c', "import sys, json, torch, numpy, lerobot, mujoco, serial; from lerobot.robots.so_follower import SO101Follower; from lerobot.teleoperators.so_leader import SO101Leader; print(json.dumps({'python': list(sys.version_info[:3]), 'torch': torch.__version__, 'cuda': torch.version.cuda, 'lerobot': lerobot.__version__, 'numpy': numpy.__version__, 'mujoco': mujoco.__version__, 'cudaAvailable': torch.cuda.is_available()}))"], { timeout: 30000, windowsHide: true, maxBuffer: 20000 });
        const environment = JSON.parse(probe.stdout.trim().split(/\r?\n/).at(-1));
        if (environment.python[0] !== 3 || environment.python[1] !== 12 || environment.torch !== '2.7.1+cpu' || environment.cuda !== null || environment.cudaAvailable || environment.lerobot !== '0.6.1' || environment.numpy !== '2.2.6' || environment.mujoco !== '3.17.0') {
          throw new Error(`Expected Python 3.12, Torch 2.7.1 CPU, LeRobot 0.6.1, NumPy 2.2.6 and MuJoCo 3.17.0; found ${JSON.stringify(environment)}.`);
        }
      } catch (error) { throw new Error(`Robotics environment validation failed: ${error.message}`); }
      config.roboticsPython = python; config.roboticsSource = source;
    }
    await edgeSupervisor.stop();
    edgeSupervisor.runtimeProfile = profile;
    edgeSupervisor.roboticsPython = config.roboticsPython;
    edgeSupervisor.roboticsSource = config.roboticsSource;
    config.runtimeProfile = profile;
    fs.mkdirSync(path.dirname(configPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(configPath(), JSON.stringify({ rememberedUsername: config.rememberedUsername, deviceMappings: config.deviceMappings, twinWsUrl: config.twinWsUrl, mujocoModelPath: config.mujocoModelPath || '', iot: config.iot, runtimeProfile: config.runtimeProfile, roboticsPython: config.roboticsPython, roboticsSource: config.roboticsSource }), { mode: 0o600 });
    fs.chmodSync(configPath(), 0o600);
    if (!edgeSupervisor.start()) throw new Error(edgeSupervisor.startError || 'Selected runtime profile failed to start.');
    return await edgeSupervisor.diagnostics();
  });
  registerHandle('recording:list', () => { requireLocalSession(); return recordings.list(); });
  registerHandle('recording:get', (episodeId) => { requireLocalSession(); return recordings.get(episodeId); });
  registerHandle('recording:start', async ({ experimentId, slot } = {}) => {
    requireLocalSession();
    if (!['leader-a','follower-a','leader-b','follower-b'].includes(slot)) throw new Error('Select a connected SO-101 arm.');
    if (!/^[0-9a-f-]{36}$/i.test(String(experimentId || ''))) throw new Error('Select a valid experiment.');
    const experiment = await client.experimentStatus(experimentId);
    const robotId = experiment?.robot_id || experiment?.robotId;
    if (!robotId) throw new Error('Experiment has no robot identity; recording cannot be scoped safely.');
    const diag = await edgeSupervisor.diagnostics(); const arm = diag.status?.arms?.[slot];
    if (!arm?.connected || !arm.deviceId) throw new Error('Selected arm is not connected with a verified device identity.');
    if (recordings.active) throw new Error('Another episode is recording.');
    const result = recordings.start({ experimentId, robotId, slot, deviceId: arm.deviceId, calibrated: arm.calibrated === true, runtimeKind: /PHYSICAL/i.test(arm.mode || '') ? 'PHYSICAL_ROBOT' : /MOCK/i.test(arm.mode || '') ? 'MOCK_RUNTIME' : /SIMULATION/i.test(arm.mode || '') ? 'SIMULATION' : 'UNVERIFIED_RUNTIME' });
    const sampleOnce = async () => {
      if (!recordings.active) { recordingTimer = null; return; }
      try { const role = slot.startsWith('leader-') ? 'leader' : 'follower'; recordings.append(await edgeSupervisor.request('joint_state', { role, slot }, 3000)); }
      catch { recordings.stop('INTERRUPTED'); recordingTimer = null; return; }
      if (recordings.active) recordingTimer = setTimeout(sampleOnce, 50); else recordingTimer = null;
    };
    recordingTimer = setTimeout(sampleOnce, 0);
    return result;
  });
  registerHandle('recording:stop', () => { if (recordingTimer) clearTimeout(recordingTimer); recordingTimer = null; return recordings.stop(); });
  const postPresigned = (target, fields, filename, fileSize, contentType, onProgress) => new Promise((resolve, reject) => {
    const url = new URL(target); if (url.protocol !== 'https:') return reject(new Error('Presigned upload must use HTTPS.'));
    const boundary = `----VISTA${crypto.randomBytes(18).toString('hex')}`;
    const chunks = []; for (const [key, value] of Object.entries(fields || {})) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`));
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filename)}"\r\nContent-Type: ${contentType}\r\n\r\n`));
    const end = Buffer.from(`\r\n--${boundary}--\r\n`); const total = chunks.reduce((n, b) => n + b.length, 0) + fileSize + end.length;
    const req = https.request(url, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': total } }, (res) => { res.resume(); res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve() : reject(new Error(`Presigned upload returned HTTP ${res.statusCode}.`))); });
    req.on('error', reject); let sent = 0; const write = (buf) => { sent += buf.length; req.write(buf); onProgress?.(Math.min(99, Math.floor(sent * 100 / total))); };
    (async () => { try { for (const chunk of chunks) write(chunk); for await (const chunk of fs.createReadStream(filename)) write(chunk); write(end); req.end(); } catch (e) { req.destroy(e); } })();
  });
  registerHandle('recording:upload', async (episodeId) => {
    requireLocalSession(); if (config.mock) throw new Error('Evidence upload is disabled for Demo sessions.');
    const local = recordings.get(episodeId); const m = local.manifest;
    if (!m.endedAtMs || !['LOCAL_RECORDED','FAILED','INTERRUPTED'].includes(m.status)) throw new Error('Only a stopped local episode can be uploaded.');
    if (m.declaredRuntimeKind !== 'PHYSICAL_ROBOT') throw new Error('The recording upload contract accepts only owner-authorized real_robot experiments.');
    const dir = recordings.directory(episodeId); const artifactPath = path.join(dir, 'trajectory.ndjson'); const fileSize = fs.statSync(artifactPath).size;
    if (fileSize < 1 || fileSize > 256 * 1024 * 1024) throw new Error('Recording exceeds the per-file upload limit.');
    const digest = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(artifactPath)) digest.update(chunk);
    const file = { name: 'trajectory.ndjson', sizeBytes: fileSize, sha256: digest.digest('hex'), contentType: 'application/x-ndjson', artifactType: 'trajectory' };
    const auth = await client.requestRecordingUpload(m.experimentId, { episodeId: m.episodeId, files: [file] });
    if (auth.episodeId !== m.episodeId || auth.robotId !== m.robotId || auth.schema !== 'vista.robot.recording.v1' || !Array.isArray(auth.uploads) || !auth.manifest || auth.manifest.uploadLast !== true) throw new Error('Education API returned an upload scope that does not match this episode.');
    recordings.updateStatus(episodeId, 'UPLOADING');
    const report = (percent) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('recording:progress', { episodeId, percent }); };
    try {
      for (const upload of auth.uploads) { if (upload.name !== file.name || !upload.url || !upload.key) throw new Error('Upload authorization did not match the episode artifact.'); await postPresigned(upload.url, upload.fields, artifactPath, fileSize, file.contentType, report); }
      const manifest = { schema: auth.schema, episodeId: m.episodeId, robotId: m.robotId, experimentId: m.experimentId, startedAtMs: m.startedAtMs, endedAtMs: m.endedAtMs, declaredRuntimeKind: m.declaredRuntimeKind, files: [file] };
      const manifestAuth = auth.manifest; if (!manifestAuth.url || !manifestAuth.fields) throw new Error('Manifest upload authorization is incomplete.');
      const manifestPath = path.join(dir, 'manifest.upload.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
      const manifestBytes = fs.readFileSync(manifestPath); await postPresigned(manifestAuth.url, manifestAuth.fields, manifestPath, manifestBytes.length, 'application/json', report);
      recordings.updateStatus(episodeId, 'UPLOADED'); report(100); return { status: 'UPLOADED' };
    } catch (error) { recordings.updateStatus(episodeId, 'FAILED', { uploadError: String(error.message).slice(0, 300) }); throw error; }
  });
  registerHandle('edge:ports', async () => { requireLocalSession(); return edgeSupervisor.request('ports'); });
  registerHandle('edge:connect', async (selection = {}) => {
    requireLocalSession();
    if (!selection || typeof selection.port !== 'string' || typeof selection.deviceId !== 'string') throw new Error('Choose a discovered serial port and robot ID.');
    const roles = { 'leader-a': 'leader', 'follower-a': 'follower', 'leader-b': 'leader', 'follower-b': 'follower' };
    const slot = selection.slot || (selection.role === 'leader' ? 'leader-a' : 'follower-a');
    if (!roles[slot] || (selection.role && roles[slot] !== selection.role)) throw new Error('Select a valid SO-101 role slot.');
    return edgeSupervisor.request('connect', { ...selection, slot, role: roles[slot], mode: 'PHYSICAL ROBOT READ ONLY', confirmed: selection.confirmed === true }, 15000);
  });
  registerHandle('edge:disconnect', async (selection) => {
    requireLocalSession();
    if (typeof selection === 'string') selection = { role: selection };
    if (selection && typeof selection !== 'object') throw new Error('Select one arm slot to disconnect.');
    const slots = ['leader-a', 'follower-a', 'leader-b', 'follower-b'];
    if (selection?.slot && !slots.includes(selection.slot)) throw new Error('Select one of the four SO-101 arm slots.');
    return edgeSupervisor.request('disconnect', selection?.slot ? { slot: selection.slot } : selection?.role ? { role: selection.role } : {});
  });
  registerHandle('edge:joint-state', async (role = 'follower', slot) => {
    requireLocalSession();
    if (!['leader', 'follower'].includes(role)) throw new Error('Select Leader or Follower explicitly.');
    if (slot !== undefined && !['leader-a', 'follower-a', 'leader-b', 'follower-b'].includes(slot)) throw new Error('Select a valid SO-101 arm slot.');
    return edgeSupervisor.request('joint_state', { role, ...(slot ? { slot } : {}) });
  });
  registerHandle('edge:calibration-status', async () => { requireLocalSession(); return edgeSupervisor.request('calibration_status'); });
  registerHandle('edge:calibration-profiles', async (role) => {
    requireLocalSession();
    if (!['leader', 'follower'].includes(role)) throw new Error('Select leader or follower explicitly.');
    return edgeSupervisor.request('calibration_profiles', { role });
  });
  registerHandle('edge:calibration-start', async (params = {}) => {
    requireLocalSession();
    if (!params || typeof params !== 'object') throw new Error('Calibration selection is invalid.');
    const expectedRole = params.slot?.startsWith?.('leader-') ? 'leader' : params.slot?.startsWith?.('follower-') ? 'follower' : params.role;
    if (params.slot && (!['leader-a', 'follower-a', 'leader-b', 'follower-b'].includes(params.slot) || params.role !== expectedRole)) throw new Error('Calibration role does not match the selected arm slot.');
    return edgeSupervisor.request('calibration_start', {
      role: params.role, slot: params.slot, port: params.port, profileId: params.profileId,
      confirmed: params.confirmed === true
    }, 5000);
  });
  registerHandle('edge:calibration-complete-step', async () => { requireLocalSession(); return edgeSupervisor.request('calibration_complete_step'); });
  registerHandle('edge:calibration-stop', async () => { requireLocalSession(); return edgeSupervisor.request('calibration_stop', {}, 10000); });
  registerHandle('edge:teleop-status', async () => { requireLocalSession(); return edgeSupervisor.request('teleop_status'); });
  registerHandle('edge:safety-status', async () => { requireLocalSession(); return edgeSupervisor.request('safety_status'); });
  // A stop request is always safe and must remain available after session expiry.
  registerHandle('edge:safety-estop', async () => edgeSupervisor.request('safety_estop', {}));
  registerHandle('edge:safety-reset', async (confirmed) => {
    requireLocalSession();
    if (confirmed !== true) throw new Error('Safety reset requires explicit operator confirmation.');
    return edgeSupervisor.request('safety_reset', { confirmed: true });
  });
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
    fs.writeFileSync(configPath(), JSON.stringify({ rememberedUsername: config.rememberedUsername, deviceMappings: config.deviceMappings, twinWsUrl: config.twinWsUrl, mujocoModelPath: selected }), { mode: 0o600 });
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
  const iotProvisioningStatus = async () => {
    const certificateReady = Boolean(config.iot.caPath && config.iot.certificatePath && config.iot.privateKeyPath
      && [config.iot.caPath, config.iot.certificatePath, config.iot.privateKeyPath].every((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } })
      && process.platform !== 'win32' && (() => { try { return (fs.statSync(config.iot.privateKeyPath).mode & 0o077) === 0; } catch { return false; } })());
    let runtimeStatus = { initialized: false, connected: false, error: 'Provision externally supplied IoT certificates to initialize the runtime.' };
    if (certificateReady) {
      try {
        runtimeStatus = await edgeSupervisor.request('mqtt_status');
        if (!runtimeStatus.initialized) {
          await edgeSupervisor.request('mqtt_initialize', {
            host: config.iot.endpoint, thingName: config.iot.thingName, robotId: config.iot.robotId,
            caFile: config.iot.caPath, certFile: config.iot.certificatePath, keyFile: config.iot.privateKeyPath,
            dedupePath: path.join(app.getPath('userData'), 'iot-command-dedupe.json'),
            port: config.iot.port, topicPrefix: config.iot.topicPrefix, runtimeKind: 'PHYSICAL_ROBOT'
          });
          runtimeStatus = await edgeSupervisor.request('mqtt_status');
        }
      } catch (error) { runtimeStatus = { initialized: false, connected: false, error: error.message }; }
    }
    return {
    endpoint: config.iot.endpoint, port: config.iot.port, thingName: config.iot.thingName,
    robotId: config.iot.robotId, topicPrefix: config.iot.topicPrefix, enabled: false,
    certificateReady, runtime: runtimeStatus,
    caFile: config.iot.caPath ? path.basename(config.iot.caPath) : null,
    certificateFile: config.iot.certificatePath ? path.basename(config.iot.certificatePath) : null,
    privateKeyReference: config.iot.privateKeyPath ? path.basename(config.iot.privateKeyPath) : null,
    productionDispatch: false
    };
  };
  registerHandle('iot:status', iotProvisioningStatus);
  registerHandle('iot:runtime-connect', async () => {
    requireLocalSession();
    if (config.iot.enabled !== true || process.env.VISTA_IOT_ENABLED !== 'true') throw new Error('Production MQTT is disabled by operator policy.');
    const status = await iotProvisioningStatus();
    if (!status.certificateReady) throw new Error('Provision valid externally issued IoT certificates before connecting.');
    return edgeSupervisor.request('mqtt_connect');
  });
  registerHandle('iot:runtime-disconnect', async () => edgeSupervisor.request('mqtt_disconnect'));
  registerHandle('iot:select-file', async (kind) => {
    const key = { ca: 'caPath', certificate: 'certificatePath', privateKey: 'privateKeyPath' }[kind];
    if (!key) throw new Error('Select a supported certificate file role.');
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Select externally provisioned AWS IoT credential' });
    if (result.canceled || !result.filePaths?.[0]) return iotProvisioningStatus();
    const selected = result.filePaths[0];
    if (!fs.statSync(selected).isFile() || fs.statSync(selected).size > 1024 * 1024) throw new Error('Credential file is invalid or exceeds 1 MB.');
    if (kind === 'privateKey' && (process.platform === 'win32' || (fs.statSync(selected).mode & 0o077))) throw new Error('Private key file must have owner-only permissions (0600); Windows ACL validation is not available.');
    config.iot[key] = selected;
    fs.mkdirSync(path.dirname(configPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(configPath(), JSON.stringify({ rememberedUsername: config.rememberedUsername, deviceMappings: config.deviceMappings, twinWsUrl: config.twinWsUrl, mujocoModelPath: config.mujocoModelPath || '', iot: config.iot, runtimeProfile: config.runtimeProfile, roboticsPython: config.roboticsPython, roboticsSource: config.roboticsSource }), { mode: 0o600 });
    fs.chmodSync(configPath(), 0o600);
    return iotProvisioningStatus();
  });
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
  registerHandle('edge:cartesian-move', async (position) => {
    requireLocalSession();
    if (!Array.isArray(position) || position.length !== 3 || position.some((value) => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1)) throw new Error('Cartesian target must contain three finite metre values within the local workspace envelope.');
    return edgeSupervisor.request('cartesian_move', { position }, 30000,
      (frame) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('simulation:frame', frame); });
  });
  registerHandle('cfg:set', (patch = {}) => {
    const activeSession = client.getSession?.();
    const next = { ...config };
    if (typeof patch.rememberedUsername === 'string') next.rememberedUsername = patch.rememberedUsername.slice(0, 80);
    if (patch.deviceMappings !== undefined) next.deviceMappings = normalizeDeviceMappings(patch.deviceMappings);
    if (typeof patch.twinWsUrl === 'string' && process.env.VISTA_TWIN_WS_URL) throw new Error('Twin endpoint is managed by VISTA_TWIN_WS_URL in the operator environment.');
    if (typeof patch.twinWsUrl === 'string') next.twinWsUrl = patch.twinWsUrl.trim() ? validateTwinWsUrl(patch.twinWsUrl) : '';
    config = next;
    fs.mkdirSync(path.dirname(configPath()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(configPath(), JSON.stringify({ rememberedUsername: config.rememberedUsername, deviceMappings: config.deviceMappings, twinWsUrl: config.twinWsUrl, mujocoModelPath: config.mujocoModelPath || '', iot: config.iot, runtimeProfile: config.runtimeProfile, roboticsPython: config.roboticsPython, roboticsSource: config.roboticsSource }), { mode: 0o600 });
    fs.chmodSync(configPath(), 0o600);
    client = createClient(config);
    if (activeSession) client.setSession(activeSession);
    return { mock: config.mock, fakeRobot: true, hardwareEnabled: false, deviceMappings: config.deviceMappings, educationApi: config.educationApi, twinWsUrl: config.twinWsUrl, twinWsConfigurationError: config.twinWsConfigurationError, twinWsManagedByEnvironment: Boolean(process.env.VISTA_TWIN_WS_URL), rememberedUsername: config.rememberedUsername, persistentSession: secureStorageAvailable(), runtimeProfile: config.runtimeProfile, roboticsPython: config.roboticsPython ? path.basename(config.roboticsPython) : '', roboticsSource: config.roboticsSource ? path.basename(config.roboticsSource) : '' };
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
      'experimentArtifacts', 'digitalTwinAvailability', 'issueTwinViewerScope', 'requestRecordingUpload', 'experimentRecordings', 'recordingDownload'
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
