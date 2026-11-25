const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const out = '/tmp/vista-desktop-smoke';
let server;
let browser;
let page;
let lastSuccessfulStep = 'starting smoke runner';
const rendererErrors = [];
const originalLog = console.log.bind(console);
console.log = (...args) => { lastSuccessfulStep = args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' '); originalLog(...args); };
async function unusedLoopbackPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForPreview(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The isolated Desktop preview server did not become ready.');
}

const bounded = (promise, label, ms = 12000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms))
]);

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const port = await unusedLoopbackPort();
  const previewUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'dev/server.mjs')], {
    cwd: root, stdio: 'ignore', env: { ...process.env, PORT: String(port) }
  });
  server.once('error', (error) => { throw error; });
  await waitForPreview(`${previewUrl}/dev/index.html`);
  const chrome = '/usr/bin/google-chrome-stable';
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const source = message.location()?.url || 'unknown source';
    if (source.endsWith('/favicon.ico')) return; // Chrome probes this even though the preview shell has no site icon.
    const error = `console: ${message.text()} (${source})`; errors.push(error); rendererErrors.push(error);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => { errors.push(error.message); rendererErrors.push(error.message); });
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.setViewport({ width: 1420, height: 960 });
  await page.goto(`${previewUrl}/dev/index.html?screen=labs`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const bridge = window.vista;
    window.__vistaSmokeFailedCalls = bridge?.__demoFailures || [];
    if (!bridge) return;
    for (const name of Object.keys(bridge)) {
      if (typeof bridge[name] !== 'function' || name === '__demoFailures') continue;
      const original = bridge[name].bind(bridge);
      bridge[name] = async (...args) => {
        try {
          const result = await original(...args);
          if (name === 'call' && result?.ok === false) window.__vistaSmokeFailedCalls.push({ method: args[0], error: result.error });
          return result;
        } catch (error) {
          window.__vistaSmokeFailedCalls.push({ method: name, error: error?.message || String(error) });
          throw error;
        }
      };
    }
  });
  console.log('UI smoke: labs loaded');
  await page.waitForSelector('.robot-status-banner');
  const banner = await page.$eval('.robot-status-banner', (el) => el.textContent);
  if (!/SIMULATION|MOCK_RUNTIME|UNVERIFIED[ _]RUNTIME|PHYSICAL · READ ONLY/.test(banner) || !banner.toLowerCase().includes('physical motion is disabled')) throw new Error(`Expected an honest runtime banner; got: ${banner}`);
  await page.screenshot({ path: path.join(out, 'student-dashboard.png'), fullPage: true });
  await page.click('button[data-k="dashboard"]');
  await page.waitForSelector('.station-status-list');
  await page.waitForFunction(() => document.querySelector('.station-status-list')?.textContent.includes('hardwareEnabled=false'));
  await page.screenshot({ path: path.join(out, 'station-dashboard.png'), fullPage: true });
  await page.click('button[data-k="labs"]');
  await page.waitForSelector('.lab-table-row .btn-row-action');

  await page.$eval('.lab-table-row .btn-row-action', (button) => button.click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Kiểm tra lại'))?.click());
  await page.waitForSelector('.preflight-item');
  await page.screenshot({ path: path.join(out, 'lab-eligibility.png'), fullPage: true });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Mở Blockly & Simulation'))?.click());
  await page.waitForSelector('.blocklySvg', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.feature-workspace-page')?.dataset.workspaceReady === 'true');
  console.log('UI smoke: workspace opened');
  const lazyViewer = await page.$eval('[data-twin-canvas]', (host) => ({ canvasCount: host.querySelectorAll('canvas').length, note: document.querySelector('[data-simulation-status]')?.textContent }));
  if (lazyViewer.canvasCount !== 0 || !lazyViewer.note.includes('loads when MuJoCo simulation starts')) throw new Error('Workspace should defer the SO-101 WebGL viewer until a local simulation starts.');
  console.log('UI smoke: local simulation viewer remains lazy until requested');
  const layout = await page.$eval('.feature-grid', (grid) => ({
    grid: getComputedStyle(grid).gridTemplateColumns,
    bounds: [...grid.children].map((el) => ({ name: el.className, x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
  }));
  console.log('Workspace layout:', JSON.stringify(layout));
  if (layout.grid === 'none' || layout.bounds[0].height < 400) throw new Error('Blockly workspace layout stylesheet did not load.');
  // Chrome capture stalls on this Blockly+WebGL surface in headless mode.
  // DOM/layout assertions below are the workspace evidence for this runner.
  const workspaceText = await page.$eval('.feature-workspace-page', (el) => el.textContent);
  console.log('UI smoke: workspace text read');
  if (!workspaceText.toLowerCase().includes('simulation') || !workspaceText.toLowerCase().includes('physical')) throw new Error('Workspace did not clearly label simulation and physical mode.');
  console.log('UI smoke: before Save click');
  await bounded(page.evaluate(() => document.querySelector('[data-save]')?.click()), 'Save click');
  console.log('UI smoke: save control clicked');
  await page.waitForFunction(() => /Demo fixture|Save failed/.test(document.querySelector('[data-save-state]')?.textContent || ''), { timeout: 12000 });
  console.log('UI smoke: save state observed');
  const saveState = await page.$eval('[data-save-state]', (el) => el.textContent);
  if (!saveState.includes('Demo fixture')) throw new Error(`Save did not finish successfully: ${saveState}`);
  await page.waitForFunction(() => !document.querySelector('[data-version]')?.disabled);
  console.log('UI smoke: version enabled');
  await page.evaluate(() => document.querySelector('[data-version]')?.click());
  console.log('UI smoke: version control clicked');
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('No VISTA record was created'), { timeout: 8000 });
  await page.evaluate(() => document.querySelector('[data-run]')?.click());
  console.log('UI smoke: schematic run clicked');
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('Demo schematic result'), { timeout: 8000 });
  const submitState = await page.$eval('[data-submit]', (button) => ({ disabled: button.disabled, label: button.textContent }));
  if (submitState.disabled) throw new Error(`Demo submission control remained disabled: ${JSON.stringify(submitState)}`);
  await page.evaluate(() => document.querySelector('[data-submit]')?.click());
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('Server attempt refreshed:'), { timeout: 8000 }).catch(async () => {
    const state = await page.evaluate(() => ({ result: document.querySelector('[data-result]')?.textContent, error: document.querySelector('[data-error]')?.textContent }));
    throw new Error(`Demo submission did not refresh attempt state: ${JSON.stringify(state)}`);
  });
  console.log('UI smoke: refreshed submission/result state verified (Demo fixture only)');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('SO-101 Digital Twin'))?.click());
  console.log('UI smoke: twin entry clicked');
  await page.waitForSelector('.feature-assignment', { timeout: 10000 });
  console.log('UI smoke: twin assignment picker loaded');
  await page.evaluate(() => document.querySelector('.feature-assignment')?.click());
  await page.waitForFunction(() => document.querySelector('[data-twin-note]')?.textContent.includes('URDF/STL loaded'), { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-connection]')?.textContent.includes('No eligible robot'), { timeout: 10000 });
  if (!(await page.$eval('[data-connect]', (button) => button.disabled))) throw new Error('Demo mode must not offer a live Twin connection without an authorized robot.');
  await page.evaluate(() => document.querySelector('[data-reset-camera]')?.click());
  await page.evaluate(() => document.querySelector('[data-k="settings"]')?.click());
  await page.waitForSelector('#settings-twin-url');
  const settingsText = await page.$eval('.work-sheet', (el) => el.textContent);
  if (!settingsText.includes('Demo fixture') || !settingsText.includes('Phiên đăng nhập')) throw new Error('Settings did not show connection and session status.');
  const settingsBounds = await page.$eval('.settings-endpoint', (section) => {
    const label = section.querySelector('label').getBoundingClientRect();
    const field = section.querySelector('input').getBoundingClientRect();
    return { labelBottom: label.bottom, fieldTop: field.top };
  });
  if (settingsBounds.fieldTop < settingsBounds.labelBottom) throw new Error('Settings endpoint label overlaps its input.');
  await page.screenshot({ path: path.join(out, 'settings.png'), fullPage: true });
  await page.evaluate(() => document.querySelector('[data-k="robot"]')?.click());
  await page.waitForSelector('.robot-station');
  await page.waitForFunction(() => document.querySelector('.robot-calibration-panel')?.textContent.includes('Browser preview only'));
  await page.evaluate(() => [...document.querySelectorAll('.robot-section-title button')].find((button) => button.textContent.includes('Scan serial ports'))?.click());
  await page.waitForFunction(() => document.querySelector('.robot-station')?.textContent.includes('No serial ports were detected'));
  const robotScreen = await page.$eval('.robot-station', (el) => el.textContent);
  if (!robotScreen.includes('Leader') || !robotScreen.includes('Follower') || !robotScreen.includes('Physical teleoperation is disabled')) throw new Error('Robot station did not render distinct roles, calibration guidance, and the physical motion lock.');
  const robotAcceptance = await page.$eval('.robot-station', (station) => ({
    cartesianPanel: station.querySelector('[aria-label="Cartesian SO-101 simulation control"]')?.textContent,
    cartesianInputs: station.querySelectorAll('[aria-label^="Cartesian target "]').length,
    rolePanels: [...station.querySelectorAll('.robot-role-panel')].map((panel) => ({
      label: panel.getAttribute('aria-label'),
      portSelector: panel.querySelector('select[aria-label$="serial port"]')?.getAttribute('aria-label'),
      connectionState: panel.querySelector('.robot-state')?.textContent,
      jointRows: panel.querySelectorAll('.robot-joints .robot-joint-row').length
    })),
    calibration: station.querySelector('.robot-calibration-panel')?.textContent,
    policy: station.querySelector('[aria-label="Hugging Face policy management"]')?.textContent,
    prompt: station.querySelector('[aria-label="Hugging Face policy management"] textarea')?.closest('label')?.textContent,
    teleop: station.querySelector('[aria-label="Fake-device Leader Follower teleoperation"]')?.textContent,
    pairOptions: [...station.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] select option')].map((option) => option.value).filter(Boolean),
    deadman: station.querySelector('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]')?.textContent,
    emergencyStop: [...station.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].some((button) => button.textContent.includes('Emergency stop')),
    feedback: station.querySelector('[data-follower-feedback]')?.textContent,
    lock: station.querySelector('.setup-summary')?.textContent,
    physicalLockState: station.querySelector('[data-physical-motion-lock]')?.getAttribute('data-physical-motion-lock'),
    primaryAction: (() => { const button = station.querySelector('[aria-label="Fake-device Leader Follower teleoperation"] button.primary'); return button && { label: button.textContent, disabled: button.disabled }; })(),
    armDisabled: [...station.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].find((button) => button.textContent.includes('Enable pair'))?.disabled,
    deadmanDisabled: station.querySelector('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]')?.disabled,
    estopDisabled: [...station.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].find((button) => button.textContent.includes('Emergency stop'))?.disabled
  }));
  if (!robotAcceptance.cartesianPanel?.includes('checkIk FK/IK') || robotAcceptance.cartesianInputs !== 3 || !robotAcceptance.cartesianPanel.includes('SIMULATION')) {
    throw new Error(`checkIk Cartesian workspace is incomplete or mislabeled: ${JSON.stringify(robotAcceptance)}`);
  }
  await (await page.$('[aria-label="Cartesian SO-101 simulation control"]')).screenshot({ path: path.join(out, 'checkik-cartesian-panel.png') });
  await page.click('[aria-label="Cartesian SO-101 simulation control"] button.primary');
  await page.waitForFunction(() => document.querySelector('[aria-label="Cartesian SO-101 simulation control"]')?.textContent.includes('Browser preview cannot run MuJoCo'));
  if (robotAcceptance.rolePanels.length !== 4 || robotAcceptance.rolePanels.some((role, index) => role.label !== ['Leader A device', 'Follower A device', 'Leader B device', 'Follower B device'][index] || !role.portSelector || !role.connectionState || role.jointRows !== 6)) {
    throw new Error(`Robot Station role selection/status/joint feedback is incomplete: ${JSON.stringify(robotAcceptance.rolePanels)}`);
  }
  if (!robotAcceptance.calibration.includes('neutral homing capture') || !robotAcceptance.calibration.includes('manual joint-range recording')) throw new Error('Guided calibration procedure is missing or incomplete.');
  if (!robotAcceptance.policy?.includes('Task prompt') || !robotAcceptance.policy.includes('Run policy') || !robotAcceptance.policy.includes('Load policy Twin') || !robotAcceptance.prompt) throw new Error('Hugging Face policy controls or the universal prompt field are missing.');
  if (!robotAcceptance.teleop.includes('FAKE DEVICES ONLY') || !robotAcceptance.teleop.includes('PHYSICAL OUTPUT DISABLED') || !robotAcceptance.teleop.includes('HOLD TO RUN') || !robotAcceptance.emergencyStop || !robotAcceptance.feedback) {
    throw new Error(`Fake-device teleoperation controls or safety/feedback states are missing: ${JSON.stringify(robotAcceptance)}`);
  }
  if (JSON.stringify(robotAcceptance.pairOptions) !== JSON.stringify(['pair-a', 'pair-b'])) throw new Error(`Two independent fake pairs are not selectable: ${JSON.stringify(robotAcceptance.pairOptions)}`);
  if (!robotAcceptance.lock.includes('Physical teleoperation is disabled') || robotAcceptance.physicalLockState !== 'disabled') throw new Error('Physical follower command lock is not explicitly disabled in the Robot Station summary.');
  if (!robotAcceptance.primaryAction?.label.includes('Connect fake pair') || robotAcceptance.primaryAction.disabled || !robotAcceptance.armDisabled || !robotAcceptance.deadmanDisabled || !robotAcceptance.estopDisabled) {
    throw new Error(`Unexpected initial fake-device action gating; the first primary button must be fake-pair connection, not physical motion: ${JSON.stringify(robotAcceptance)}`);
  }
  if (!(await page.$eval('.robot-calibration-panel button.primary', (button) => button.disabled))) throw new Error('Calibration must remain disabled without an explicit operator confirmation and discovered port.');
  await page.screenshot({ path: path.join(out, 'robot-connection-calibration.png'), fullPage: true });
  await page.$eval('.work-sheet', (sheet) => { sheet.scrollTop = sheet.scrollHeight; });
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.work-sheet');
    return Boolean(sheet && sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 1);
  }, { timeout: 8000 });
  const workflowText = await page.$eval('.robot-calibration-panel', (panel) => panel.textContent);
  if (!workflowText.includes('Neutral homing capture') || !workflowText.includes('manual joint-range recording') || !workflowText.includes('No saved profiles found')) throw new Error('Calibration steps and honest empty profile state are missing.');
  const clickTeleopButton = async (text) => page.evaluate((needle) => {
    const button = [...document.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].find((candidate) => candidate.textContent.includes(needle));
    if (!button || button.disabled) throw new Error(`Expected enabled fake teleop control: ${needle}`);
    button.click();
  }, text);
  const waitForTeleopState = async (expected) => {
    try {
      await page.waitForFunction((state) => document.querySelector('[aria-label="Fake-device Leader Follower teleoperation"] [data-teleop-state]')?.dataset.state === state, { timeout: 8000 }, expected);
    } catch (error) {
      const observed = await page.evaluate(() => ({
        state: document.querySelector('[aria-label="Fake-device Leader Follower teleoperation"] [data-teleop-state]')?.dataset.state || 'MISSING',
        stateText: document.querySelector('[aria-label="Fake-device Leader Follower teleoperation"] [data-teleop-state]')?.textContent || '',
        note: document.querySelector('[data-teleop-note]')?.textContent || '',
        error: document.querySelector('.robot-station [role="alert"]')?.textContent || document.querySelector('.robot-station .robot-error')?.textContent || '',
        buttonText: [...document.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].map((button) => `${button.textContent.trim()}${button.disabled ? ' [disabled]' : ''}`)
      }));
      console.error(`Robot Station teleop expected ${expected}; observed ${JSON.stringify(observed)}`);
      throw new Error(`Robot Station teleop state transition to ${expected} failed: ${JSON.stringify(observed)}; ${error.message}`);
    }
  };
  await clickTeleopButton('Connect fake pair');
  await waitForTeleopState('DISABLED');
  if (!(await page.$eval('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]', (button) => button.disabled)) || (await page.evaluate(() => [...document.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].find((button) => button.textContent.includes('Enable pair')).disabled))) throw new Error('After connection, the explicit arm action should be enabled while deadman remains gated.');
  await clickTeleopButton('Enable pair');
  await waitForTeleopState('ARMED');
  if (await page.$eval('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]', (button) => button.disabled)) throw new Error('Deadman should become available only after explicit fake-pair arming.');
  const deadmanBox = await page.$eval('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]', (button) => { const rect = button.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
  await page.mouse.move(deadmanBox.x, deadmanBox.y);
  await page.mouse.down();
  await waitForTeleopState('ACTIVE');
  await page.mouse.up();
  await waitForTeleopState('ARMED');
  await clickTeleopButton('Emergency stop');
  await waitForTeleopState('STOPPED');
  if (!(await page.$eval('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]', (button) => button.disabled))) throw new Error('Emergency stop must disable the deadman immediately.');
  await clickTeleopButton('Reset stop');
  await waitForTeleopState('DISABLED');
  await page.select('[aria-label="Fake-device Leader Follower teleoperation"] select', 'pair-b');
  await waitForTeleopState('DISCONNECTED');
  if (!(await page.$eval('[aria-label="Fake-device Leader Follower teleoperation"] [data-deadman]', (button) => button.disabled)) || !(await page.evaluate(() => [...document.querySelectorAll('[aria-label="Fake-device Leader Follower teleoperation"] button')].find((button) => button.textContent.includes('Enable pair')).disabled))) throw new Error('Pair B must remain isolated and disabled when Pair A has been stopped/reset.');
  if (await page.$eval('[data-physical-motion-lock]', (lock) => lock.dataset.physicalMotionLock !== 'disabled')) throw new Error('Physical motion lock changed while fake teleoperation controls were exercised.');
  await page.screenshot({ path: path.join(out, 'robot-calibration-teleoperation.png'), fullPage: true });
  if (errors.length) throw new Error(`Renderer errors: ${errors.join('; ')}`);
  console.log(`Desktop renderer smoke passed; screenshots saved under ${out}`);
}

main().catch(async (error) => {
  console.error(error);
  if (page) {
    try {
      fs.mkdirSync(out, { recursive: true });
      const diagnostics = await page.evaluate(async (lastStep, errors) => {
        let teleop = null;
        try { teleop = await window.vista?.teleopStatus?.(); } catch (failure) { teleop = { diagnosticError: failure?.message || String(failure) }; }
        return {
          lastSuccessfulStep: lastStep,
          url: location.href,
          pageTitle: document.title,
          bodyText: document.body?.innerText?.slice(-12000) || '',
          robotState: document.querySelector('[data-teleop-state]')?.dataset.state || null,
          robotStatusText: document.querySelector('[data-teleop-state]')?.textContent || null,
          robotError: document.querySelector('.robot-station [role="alert"]')?.textContent || document.querySelector('.robot-station .robot-error')?.textContent || '',
          robotButtons: [...document.querySelectorAll('.robot-station button')].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled, ariaPressed: button.getAttribute('aria-pressed') })),
          physicalMotionLock: document.querySelector('[data-physical-motion-lock]')?.getAttribute('data-physical-motion-lock') || null,
          teleop,
          failedBridgeCalls: window.__vistaSmokeFailedCalls || window.vista?.__demoFailures || [],
          rendererErrors: errors
        };
      }, lastSuccessfulStep, rendererErrors);
      diagnostics.failure = error?.stack || String(error);
      fs.writeFileSync(path.join(out, 'failure-diagnostics.json'), JSON.stringify(diagnostics, null, 2));
      await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: false });
      console.error(`Smoke diagnostics written to ${path.join(out, 'failure-diagnostics.json')} and ${path.join(out, 'failure.png')}`);
    } catch (diagnosticError) {
      console.error(`Could not capture smoke diagnostics: ${diagnosticError?.stack || diagnosticError}`);
    }
  }
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  server?.kill('SIGTERM');
});
