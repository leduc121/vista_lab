'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const artifacts = path.join(os.tmpdir(), 'vista-electron-smoke');
let profile;
let child;
let browser;
let page;
const errors = [];
let lastStep = 'initializing Electron smoke';

const mark = (step) => { lastStep = step; console.log(`Electron smoke: ${step}`); };
const reservePort = async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};
const getJson = (url) => new Promise((resolve, reject) => {
  const request = http.get(url, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
  });
  request.setTimeout(1000, () => request.destroy(new Error('CDP probe timed out')));
  request.on('error', reject);
});
const waitForCdp = async (port, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { return await getJson(`http://127.0.0.1:${port}/json/version`); }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  throw new Error(`Electron CDP endpoint did not start: ${lastError?.message || 'timeout'}`);
};

async function run() {
  fs.mkdirSync(artifacts, { recursive: true });
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-electron-smoke-profile-'));
  const port = await reservePort();
  const electronPath = require('electron');
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env;
  Object.assign(env, {
    VISTA_DESKTOP_DEMO: '1',
    VISTA_ELECTRON_DISABLE_GPU: '1',
    NODE_ENV: 'test',
    VISTA_DESKTOP_TEST_USER_DATA: path.join(profile, 'user-data')
  });
  child = spawn(electronPath, [`--remote-debugging-port=${port}`, root], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
  child.on('error', (error) => errors.push(`Electron process: ${error.message}`));
  const version = await waitForCdp(port);
  console.log(`Electron DevTools protocol ready: ${version.Browser || 'unknown Chromium'}`);
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const deadline = Date.now() + 12000;
  while (!page && Date.now() < deadline) {
    page = (await browser.pages()).find((candidate) => candidate.url().startsWith('file://'));
    if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!page) throw new Error('Native Electron renderer page did not appear.');
  page.setDefaultTimeout(8000);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`renderer: ${error.message}`));

  await page.waitForSelector('input[placeholder="Mã trường"]');
  mark('native login screen rendered');
  await page.$eval('input[placeholder="Mã trường"]', (element) => { element.value = 'SCHOOL-DEMO'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('input[placeholder^="Mã học sinh"]', (element) => { element.value = 'STUDENT-DEMO'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('input[placeholder="••••••••"]', (element) => { element.value = 'demo-password'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Vào trạm thực hành'))?.click());
  await page.waitForSelector('.lab-table-row .btn-row-action');
  mark('Demo authentication and Labs loaded through Electron IPC');

  await page.$eval('.lab-table-row .btn-row-action', (button) => button.click());
  await page.waitForSelector('.detail-panel');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Kiểm tra lại'))?.click());
  await page.waitForSelector('.preflight-item');
  await page.waitForSelector('.btn-row-action');
  await page.evaluate(() => [...document.querySelectorAll('.btn-row-action')].find((button) => button.textContent.includes('Mở Blockly & Simulation'))?.click());
  await page.waitForSelector('.feature-workspace-page .blocklySvg', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.feature-workspace-page')?.dataset.workspaceReady === 'true');
  mark('assignment attempt opened the Blockly workspace');

  await page.evaluate(() => document.querySelector('[data-save]')?.click());
  await page.waitForFunction(() => /Saved in Demo fixture|Save failed/.test(document.querySelector('[data-save-state]')?.textContent || ''), { timeout: 12000 });
  const saveState = await page.$eval('[data-save-state]', (element) => element.textContent);
  if (!saveState.includes('Saved in Demo fixture')) throw new Error(`Native Electron Blockly save failed: ${saveState}`);
  await page.waitForFunction(() => !document.querySelector('[data-version]')?.disabled);
  mark('Blockly save completed in the explicitly labeled Demo client');

  await page.evaluate(() => document.querySelector('[data-version]')?.click());
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('Created Demo fixture version'));
  mark('program version created through Electron IPC');
  await page.evaluate(() => document.querySelector('[data-run]')?.click());
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('Demo schematic result'));
  mark('Demo schematic result rendered; no backend or physical execution');

  const physicalControl = await page.evaluate(() => ({
    lock: document.querySelector('.feature-workspace-page .mode-label')?.textContent.includes('physical locked'),
    enabledMotionButtons: [...document.querySelectorAll('button')].filter((button) => /physical robot|move follower|robot motion/i.test(button.textContent) && !button.disabled).map((button) => button.textContent.trim())
  }));
  if (!physicalControl.lock || physicalControl.enabledMotionButtons.length) throw new Error(`Unexpected physical motion UI state: ${JSON.stringify(physicalControl)}`);
  if (errors.length) throw new Error(`Native Electron renderer errors: ${errors.join('; ')}`);
  await page.screenshot({ path: path.join(artifacts, 'electron-workspace.png'), fullPage: false });
  console.log(`PASS: native Electron key workflow; screenshot at ${path.join(artifacts, 'electron-workspace.png')}`);
}

async function diagnose(error) {
  console.error(error);
  if (!page) return;
  try {
    const state = await page.evaluate((step, collectedErrors) => ({
      lastSuccessfulStep: step, url: location.href, title: document.title,
      bodyText: document.body?.innerText?.slice(-10000) || '',
      buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled })),
      saveState: document.querySelector('[data-save-state]')?.textContent || null,
      result: document.querySelector('[data-result]')?.textContent || null,
      teleopState: document.querySelector('[data-teleop-state]')?.dataset.state || null,
      rendererErrors: collectedErrors
    }), lastStep, errors);
    state.failure = error?.stack || String(error);
    fs.writeFileSync(path.join(artifacts, 'electron-failure.json'), JSON.stringify(state, null, 2));
    await page.screenshot({ path: path.join(artifacts, 'electron-failure.png'), fullPage: false });
    console.error(`Native Electron diagnostics saved under ${artifacts}`);
  } catch (failure) { console.error(`Could not capture native Electron diagnostics: ${failure.message}`); }
}

run().catch(async (error) => { process.exitCode = 1; await diagnose(error); }).finally(async () => {
  if (browser) { try { await browser.disconnect(); } catch {} }
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const exited = await Promise.race([once(child, 'exit').then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 5000))]);
    if (!exited && child.exitCode === null) child.kill('SIGKILL');
  }
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
});
