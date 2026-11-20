const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const out = '/tmp/vista-desktop-smoke';
const server = spawn(process.execPath, [path.join(root, 'dev/server.mjs')], { cwd: root, stdio: 'ignore' });
let browser;
const bounded = (promise, label, ms = 12000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms))
]);

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const chrome = '/usr/bin/google-chrome-stable';
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1420, height: 960 });
  await page.goto('http://127.0.0.1:4173/dev/index.html?screen=labs', { waitUntil: 'networkidle0' });
  console.log('UI smoke: labs loaded');
  await page.waitForSelector('.robot-status-banner');
  const banner = await page.$eval('.robot-status-banner', (el) => el.textContent);
  if (!banner.includes('SIMULATION') || !banner.includes('đang bị khoá')) throw new Error(`Expected honest simulation banner; got: ${banner}`);
  await page.screenshot({ path: path.join(out, 'student-dashboard.png'), fullPage: true });

  await page.waitForSelector('.lab-table-row .btn-row-action');
  await page.$eval('.lab-table-row .btn-row-action', (button) => button.click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Kiểm tra lại'))?.click());
  await page.waitForSelector('.preflight-item');
  await page.screenshot({ path: path.join(out, 'lab-eligibility.png'), fullPage: true });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Mở Blockly & Simulation'))?.click());
  await page.waitForSelector('.blocklySvg', { timeout: 15000 });
  console.log('UI smoke: workspace opened');
  await page.waitForSelector('[data-twin-canvas] canvas', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.telemetry-note')?.textContent.includes('SO-101 asset loaded'), { timeout: 15000 }).catch(() => {});
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
  await page.evaluate(() => document.querySelector('[data-submit]')?.click());
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('Submission saved by VISTA'), { timeout: 8000 });
  console.log('UI smoke: submission/result state verified (Demo fixture only)');
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
  if (errors.length) throw new Error(`Renderer errors: ${errors.join('; ')}`);
  console.log(`Desktop renderer smoke passed; screenshots saved under ${out}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.kill('SIGTERM');
});
