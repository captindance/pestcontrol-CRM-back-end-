import puppeteer from 'puppeteer';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function visualDebug() {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null
  });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  
  const response = await fetch('http://localhost:3001/api/dev/token?tenantId=26&role=manager');
  const { token } = await response.json();
  
  await page.evaluate((token) => {
    localStorage.setItem('demo_jwt', token);
    localStorage.setItem('selected_tenant_id', '26');
    localStorage.setItem('role', 'manager');
    localStorage.setItem('roles', JSON.stringify(['manager']));
  }, token);
  
  console.log('✅ Auth injected, reloading...');
  await page.reload();
  await wait(3000);
  
  console.log('📊 Clicking Reports...');
  await page.click('text/Reports');
  
  console.log('⏳ Browser will stay open for 15 seconds...');
  console.log('   Watch for any UI errors or loading states');
  await wait(15000);
  
  const charts = await page.$$('[data-chart-ready="true"]');
  console.log(`\n📈 Charts found: ${charts.length}`);
  
  await browser.close();
}

visualDebug().catch(console.error);
