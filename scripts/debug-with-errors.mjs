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

async function debugWithErrors() {
  console.log('🔍 Debug: Capturing browser console and errors...\n');
  
  const errors = [];
  const consoleMessages = [];
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(`[${msg.type()}] ${text}`);
    console.log(`  🖥️  [${msg.type()}] ${text}`);
  });
  
  // Capture errors
  page.on('pageerror', error => {
    errors.push(`PAGE ERROR: ${error.message}`);
    console.log(`  ❌ PAGE ERROR: ${error.message}`);
  });
  
  page.on('requestfailed', request => {
    errors.push(`REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`);
    console.log(`  ❌ REQUEST FAILED: ${request.url()}`);
  });
  
  console.log('📡 Navigating to frontend...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  
  console.log('📸 Screenshot 1: Initial load\n');
  await page.screenshot({ path: path.join(outputDir, 'debug-1-initial.png'), fullPage: true });
  
  // Try to get dev token
  let devToken = null;
  try {
    const response = await fetch('http://localhost:3001/api/dev/token');
    if (response.ok) {
      const data = await response.json();
      devToken = data.token;
      console.log('✅ Got dev token\n');
    }
  } catch (e) {
    console.log('⚠️  No dev token\n');
  }
  
  // Inject auth
  console.log('🔐 Injecting authentication...');
  await page.evaluate((token) => {
    if (token) {
      localStorage.setItem('demo_jwt', token);
    }
    localStorage.setItem('selected_tenant_id', '1');
    localStorage.setItem('role', 'business_owner');
    localStorage.setItem('roles', JSON.stringify(['business_owner']));
    console.log('✅ Auth injected');
  }, devToken);
  
  console.log('🔄 Reloading page...\n');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2000);
  
  console.log('📸 Screenshot 2: After auth\n');
  await page.screenshot({ path: path.join(outputDir, 'debug-2-after-auth.png'), fullPage: true });
  
  // Try to click Reports
  console.log('📊 Attempting to navigate to Reports...');
  try {
    const reportsButton = await page.waitForSelector('text/Reports', { timeout: 5000 });
    if (reportsButton) {
      await reportsButton.click();
      console.log('✅ Clicked Reports button');
      await wait(3000);
    }
  } catch (e) {
    console.log('⚠️  Could not find/click Reports button');
  }
  
  console.log('📸 Screenshot 3: Reports view\n');
  await page.screenshot({ path: path.join(outputDir, 'debug-3-reports.png'), fullPage: true });
  
  // Check for charts
  console.log('🔍 Looking for chart elements:');
  const selectors = [
    '[data-chart-ready="true"]',
    '[data-chart-type]',
    '.chart-container',
    'canvas',
    'svg'
  ];
  
  for (const selector of selectors) {
    const elements = await page.$$(selector);
    console.log(`  ${selector}: ${elements.length} found`);
  }
  
  // Get page HTML structure
  console.log('\n📄 Page structure:');
  const structure = await page.evaluate(() => {
    const body = document.body;
    const getText = (el, depth = 0) => {
      if (depth > 3) return '';
      const tag = el.tagName.toLowerCase();
      const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
      const id = el.id ? `#${el.id}` : '';
      const children = Array.from(el.children).slice(0, 5);
      return `${'  '.repeat(depth)}${tag}${id}${classes}\n${children.map(c => getText(c, depth + 1)).join('')}`;
    };
    return getText(body);
  });
  console.log(structure.substring(0, 1000));
  
  // Save full logs
  const logPath = path.join(outputDir, 'debug-console-log.txt');
  fs.writeFileSync(logPath, consoleMessages.join('\n'));
  
  const errorPath = path.join(outputDir, 'debug-errors.txt');
  fs.writeFileSync(errorPath, errors.length > 0 ? errors.join('\n') : 'No errors captured');
  
  console.log('\n📊 Summary:');
  console.log(`  Console messages: ${consoleMessages.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`\n📁 Files saved to: ${outputDir}`);
  console.log('  - debug-1-initial.png');
  console.log('  - debug-2-after-auth.png');
  console.log('  - debug-3-reports.png');
  console.log('  - debug-console-log.txt');
  console.log('  - debug-errors.txt');
  
  await browser.close();
}

debugWithErrors().catch(console.error);
