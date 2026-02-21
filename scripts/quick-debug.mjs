import puppeteer from 'puppeteer';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function quickDebug() {
  console.log('🔍 Testing with manager token...\n');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('500')) {
      console.log(`  ⚠️  ${msg.text()}`);
    }
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Get manager token
  const response = await fetch('http://localhost:3001/api/dev/token?tenantId=26&role=manager');
  const { token } = await response.json();
  console.log('✅ Got manager token\n');
  
  await page.evaluate((token) => {
    localStorage.setItem('demo_jwt', token);
    localStorage.setItem('selected_tenant_id', '26');
    localStorage.setItem('role', 'manager');
    localStorage.setItem('roles', JSON.stringify(['manager']));
  }, token);
  
  console.log('🔄 Reloading...');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(3000);
  
  console.log('📊 Clicking Reports...');
  await page.click('text/Reports');
  await wait(5000);
  
  const charts = await page.$$('[data-chart-ready="true"]');
  console.log(`\n�� Charts found: ${charts.length}`);
  
  if (charts.length > 0) {
    console.log('🎉 SUCCESS - Charts are rendering!');
  } else {
    console.log('❌ No charts found - checking page content...');
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text.substring(0, 500));
  }
  
  await browser.close();
}

quickDebug().catch(console.error);
