import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, 'poc-output');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function debugFinal() {
  console.log('🔍 Final Debug: Testing tenant=26 token...\n');
  
  const errors = [];
  const consoleMessages = [];
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Capture console
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`  ${msg.type() === 'error' ? '❌' : '⚠️'}  [${msg.type()}] ${text}`);
    }
  });
  
  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
    console.log(`  ❌ PAGE ERROR: ${error.message}`);
  });
  
  page.on('requestfailed', request => {
    errors.push(`REQUEST FAILED: ${request.url()}`);
    console.log(`  ❌ REQUEST FAILED: ${request.url()}`);
  });
  
  console.log('📡 Navigating to frontend...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Get dev token with tenantId=26
  let devToken = null;
  try {
    const response = await fetch('http://localhost:3001/api/dev/token?tenantId=26');
    if (response.ok) {
      const data = await response.json();
      devToken = data.token;
      console.log('✅ Got dev token with tenantId=26\n');
    }
  } catch (e) {
    console.log('⚠️  Failed to get dev token\n');
  }
  
  // Inject auth
  console.log('🔐 Injecting authentication...');
  await page.evaluate((token) => {
    if (token) {
      localStorage.setItem('demo_jwt', token);
    }
    localStorage.setItem('selected_tenant_id', '26');
    localStorage.setItem('role', 'business_owner');
    localStorage.setItem('roles', JSON.stringify(['business_owner']));
  }, devToken);
  
  console.log('🔄 Reloading page...\n');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(3000);
  
  await page.screenshot({ path: path.join(outputDir, 'final-after-reload.png'), fullPage: true });
  console.log('📸 Screenshot: after-reload\n');
  
  // Try to click Reports
  console.log('📊 Clicking Reports...');
  try {
    await page.waitForSelector('text/Reports', { timeout: 5000 });
    await page.click('text/Reports');
    console.log('✅ Clicked Reports');
    await wait(5000); // Wait longer for API
  } catch (e) {
    console.log('⚠️  Could not find Reports button');
  }
  
  await page.screenshot({ path: path.join(outputDir, 'final-reports-view.png'), fullPage: true });
  console.log('📸 Screenshot: reports-view\n');
  
  // Check for charts
  console.log('🔍 Looking for charts:');
  const chartSelectors = [
    '[data-chart-ready="true"]',
    '[data-chart-type]',
    '.chart-container',
  ];
  
  for (const selector of chartSelectors) {
    const elements = await page.$$(selector);
    console.log(`  ${selector}: ${elements.length}`);
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  Total errors: ${errors.length}`);
  console.log(`  500 errors: ${consoleMessages.filter(m => m.includes('500')).length}`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors found:`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
  
  await browser.close();
}

debugFinal().catch(console.error);
