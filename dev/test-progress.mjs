import puppeteer from 'puppeteer-core';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = '/usr/bin/google-chrome-stable';
const outDir = path.resolve('.taste-skill/round-v2-screens');
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Test at 1200px
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:4173/dev/index.html?screen=labs', { waitUntil: 'networkidle0' });

  // 1. Verify Progress Bars
  console.log('Verifying course progress bars...');
  const progressData = await page.evaluate(() => {
    const c1 = document.getElementById('course-course-1');
    const c2 = document.getElementById('course-course-2');

    const c1Track = c1.querySelector('.progress-track');
    const c1Fill = c1.querySelector('.progress-bar-fill');
    const c1Ratio = c1Fill ? c1Fill.getBoundingClientRect().width / c1Track.getBoundingClientRect().width : 0;

    const c2Track = c2.querySelector('.progress-track');
    const c2Fill = c2.querySelector('.progress-bar-fill');
    const c2Ratio = c2Fill ? c2Fill.getBoundingClientRect().width / c2Track.getBoundingClientRect().width : 0;

    return {
      c1HasFill: !!c1Fill,
      c1Ratio,
      c1WidthPct: c1Fill ? c1Fill.style.width : '0%',
      c2HasFill: !!c2Fill,
      c2Ratio,
      c2WidthPct: c2Fill ? c2Fill.style.width : '0%'
    };
  });

  console.log('Progress Data:', progressData);

  // Assertions for Requirement 1:
  assert(progressData.c1HasFill, 'Course 1 (1/3) must have fill element');
  assert.strictEqual(progressData.c1WidthPct, '33%', 'Course 1 fill style.width must be 33%');
  assert(Math.abs(progressData.c1Ratio - 0.33) < 0.05, `Course 1 ratio should be ~0.33, got ${progressData.c1Ratio}`);

  assert(!progressData.c2HasFill || progressData.c2Ratio === 0, 'Course 2 (0/2) must have NO fill element or 0 ratio');
  console.log('✓ PASS: Course progress bar test passed (1/3 is 33%, 0/2 is 0% empty).');

  // 2. Capture at 900px, 1200px, 1600px
  for (const width of [900, 1200, 1600]) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 400));
    const filename = `labs-${width}px.jpg`;
    await page.screenshot({ path: path.join(outDir, filename) });
    console.log(`Saved screenshot: ${filename}`);
  }

  // 3. Test other screens at 1200px
  console.log('Navigating to Lab Detail...');
  const firstAction = await page.waitForSelector('.lab-table-row .btn-row-action:not([disabled])');
  await firstAction.click();
  await page.waitForSelector('.preflight-item');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'detail-1200px.jpg') });
  console.log('Saved screenshot: detail-1200px.jpg');

  console.log('Testing Safety Confirm & Start...');
  const confirmBox = await page.waitForSelector('input[type="checkbox"]');
  await confirmBox.click();
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent.includes('Bắt đầu chạy'));
    if (b) b.click();
  });
  await page.waitForSelector('.run-grid-layout');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, 'running-1200px.jpg') });
  console.log('Saved screenshot: running-1200px.jpg');

  console.log('Testing E-STOP...');
  await page.evaluate(() => {
    const danger = document.querySelector('button.danger');
    if (danger) danger.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'stopped-1200px.jpg') });
  console.log('Saved screenshot: stopped-1200px.jpg');

  console.log('Navigating to History...');
  await page.evaluate(() => {
    const backBtn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('Về danh sách lab'));
    if (backBtn) backBtn.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const navHistory = document.querySelector('.sidebar-nav button[data-k="history"]');
    if (navHistory) navHistory.click();
  });
  await page.waitForSelector('.detail-panel');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, 'history-1200px.jpg') });
  console.log('Saved screenshot: history-1200px.jpg');

  await browser.close();
  console.log('All automated checks and captures completed successfully!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
