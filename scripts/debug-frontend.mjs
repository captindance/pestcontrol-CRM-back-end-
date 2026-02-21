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

async function debug() {
  console.log('🔍 Debug: Checking what appears on page...\n');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Navigate to frontend
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Take screenshot before auth
  await page.screenshot({ path: path.join(outputDir, '1-before-auth.png'), fullPage: true });
  console.log('📸 Screenshot 1: Before auth');
  
  // Try to get dev token
  let devToken = null;
  try {
    const response = await fetch('http://localhost:3001/api/dev/token');
    if (response.ok) {
      const data = await response.json();
      devToken = data.token;
      console.log('✅ Got dev token');
    }
  } catch (e) {
    console.log('⚠️  No dev token, will use fallback');
  }
  
  // Inject auth
  await page.evaluate((token) => {
    if (token) {
      localStorage.setItem('demo_jwt', token);
    }
    localStorage.setItem('selected_tenant_id', '1');
    localStorage.setItem('role', 'business_owner');
    localStorage.setItem('roles', JSON.stringify(['business_owner']));
  }, devToken);
  
  // Reload
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2000);
  
  // Take screenshot after auth
  await page.screenshot({ path: path.join(outputDir, '2-after-auth.png'), fullPage: true });
  console.log('📸 Screenshot 2: After auth');
  
  // Check for charts
  const selectors = [
    '[data-chart-ready="true"]',
    '[data-chart-type]',
    '.chart-container',
    'canvas',
    'svg'
  ];
  
  console.log('\n🔍 Looking for chart elements:');
  for (const selector of selectors) {
    const elements = await page.$$(selector);
    console.log(`  ${selector}: ${elements.length} found`);
  }
  
  // Get page text content
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\n📄 Page text (first 800 chars):');
  console.log(bodyText.substring(0, 800));
  
  console.log('\n✅ Screenshots saved to:', outputDir);
  console.log('   Check images to see rendering state');
  
  await browser.close();
}

debug().catch(console.error);
