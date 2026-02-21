import puppeteer from 'puppeteer';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function finalTest() {
  console.log('🔍 Final test with business_owner...\n');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Monitor API calls
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/reports')) {
      console.log(`  ✅ API /reports called: ${response.status()}`);
      if (response.ok()) {
        try {
          const json = await response.json();
          console.log(`     Reports in response: ${json.reports?.length || 0}`);
        } catch (e) {}
      }
    }
  });
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[ReportChart]')) {
      console.log(`  📊 ${text}`);
    }
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const response = await fetch('http://localhost:3001/api/dev/token?userId=35&tenantId=26&role=business_owner');
  const { token } = await response.json();
  
  await page.evaluate((token) => {
    localStorage.setItem('demo_jwt', token);
    localStorage.setItem('selected_tenant_id', '26');
    localStorage.setItem('role', 'business_owner');
    localStorage.setItem('roles', JSON.stringify(['business_owner']));
  }, token);
  
  console.log('🔄 Reloading...\n');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(3000);
  
  console.log('📊 Clicking Reports...\n');
  await page.click('text/Reports');
  
  console.log('⏳ Waiting 10 seconds for data...\n');
  await wait(10000);
  
  const charts = await page.$$('[data-chart-ready="true"]');
  console.log(`\n📈 Charts found: ${charts.length}`);
  
  if (charts.length > 0) {
    console.log('🎉🎉🎉 SUCCESS - Charts are rendering!');
  }
  
  await browser.close();
}

finalTest().catch(console.error);
