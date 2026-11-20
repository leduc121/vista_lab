const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const out = '/tmp/vista-desktop-smoke';
const server = spawn(process.execPath, [path.join(root, 'dev/server.mjs')], { cwd: root, stdio: 'ignore' });
let browser;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const chrome = '/usr/bin/google-chrome-stable';
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1420, height: 960 });
  await page.goto('http://127.0.0.1:4173/dev/index.html?screen=labs', { waitUntil: 'networkidle0' });
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
  await page.waitForSelector('[data-twin-canvas] canvas', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.telemetry-note')?.textContent.includes('SO-101 asset loaded'), { timeout: 15000 }).catch(() => {});
  const layout = await page.$eval('.feature-grid', (grid) => ({
    grid: getComputedStyle(grid).gridTemplateColumns,
    bounds: [...grid.children].map((el) => ({ name: el.className, x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
  }));
  console.log('Workspace layout:', JSON.stringify(layout));
  if (layout.grid === 'none' || layout.bounds[0].height < 400) throw new Error('Blockly workspace layout stylesheet did not load.');
  await page.screenshot({ path: path.join(out, 'blockly-digital-twin.png'), fullPage: true });
  const workspaceText = await page.$eval('.feature-workspace-page', (el) => el.textContent);
  if (!workspaceText.toLowerCase().includes('simulation') || !workspaceText.toLowerCase().includes('physical')) throw new Error('Workspace did not clearly label simulation and physical mode.');
  await page.click('[data-save]');
  await page.waitForFunction(() => document.querySelector('[data-save-state]')?.textContent.includes('Demo fixture'));
  await page.waitForFunction(() => !document.querySelector('[data-version]')?.disabled);
  await page.click('[data-version]');
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('No VISTA record was created'));
  await page.click('[data-run]');
  await page.waitForFunction(() => document.querySelector('[data-result]')?.textContent.includes('did not create a VISTA schematic result'), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('SO-101 Digital Twin'))?.click());
  await page.waitForSelector('.feature-assignment', { timeout: 10000 });
  await page.click('.feature-assignment');
  await page.waitForFunction(() => document.querySelector('[data-twin-note]')?.textContent.includes('URDF/STL loaded'), { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-connection]')?.textContent.includes('No eligible robot'), { timeout: 10000 });
  if (!(await page.$eval('[data-connect]', (button) => button.disabled))) throw new Error('Demo mode must not offer a live Twin connection without an authorized robot.');
  await page.click('[data-reset-camera]');
  await page.screenshot({ path: path.join(out, 'digital-twin-no-backend-access.png'), fullPage: true });
  await page.click('[data-k="settings"]');
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
