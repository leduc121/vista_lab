import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = '/usr/bin/google-chrome-stable';
const outDir = path.resolve('.taste-skill/screens-preview');
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to Labs...');
  await page.goto('http://127.0.0.1:4173/dev/index.html?screen=labs', { waitUntil: 'networkidle0' });

  // 1. Lab Detail
  console.log('Navigating to Lab Detail (C1-L5)...');
  const startBtn = await page.waitForSelector('.lab-table-row button:not([disabled])');
  await startBtn.click();
  await page.waitForSelector('.preflight-item');
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'screen-3-lab-detail.jpg') });
  console.log('Saved screen-3-lab-detail.jpg');

  // 2. Check safety confirm & start run
  console.log('Confirming safety and starting run...');
  const confirmBox = await page.waitForSelector('input[type="checkbox"]');
  await confirmBox.click();
  await new Promise((r) => setTimeout(r, 300));
  // Find the button that says "Bắt đầu chạy trên robot thật"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => x.textContent.includes('Bắt đầu chạy'));
    if (b) b.click();
  });

  await page.waitForSelector('.run-grid-layout');
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(outDir, 'screen-4-running.jpg') });
  console.log('Saved screen-4-running.jpg');

  // 3. Click E-STOP
  console.log('Testing Emergency Stop...');
  await page.evaluate(() => {
    const danger = document.querySelector('button.danger');
    if (danger) danger.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'screen-4-stopped.jpg') });
  console.log('Saved screen-4-stopped.jpg');

  // 4. Return to labs and go to history
  console.log('Navigating to History...');
  await page.evaluate(() => {
    const backBtn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('Về danh sách lab'));
    if (backBtn) backBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const navHistory = document.querySelector('.sidebar-nav button[data-k="history"]');
    if (navHistory) navHistory.click();
  });
  await page.waitForSelector('.detail-panel');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'screen-5-history.jpg') });
  console.log('Saved screen-5-history.jpg');

  await browser.close();
  console.log('All screens captured successfully!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
