import puppeteer from 'puppeteer';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function detailedDebug() {
  console.log('🔍 Detailed debug with API monitoring...\n');
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Monitor all API requests
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const status = response.status();
      const statusIcon = status >= 200 && status < 300 ? '✅' : '❌';
      console.log(`  ${statusIcon} ${status} ${url}`);
      apiCalls.push({ url, status });
      
      if (status >= 400) {
        try {
          const text = await response.text();
          console.log(`      Error: ${text.substring(0, 200)}`);
        } catch (e) {}
      }
    }
  });
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[ReportChart]') || text.includes('error') || text.includes('Error')) {
      console.log(`  📝 ${text}`);
    }
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const response = await fetch('http://localhost:3001/api/dev/token?tenantId=26&role=manager');
  const { token } = await response.json();
  
  await page.evaluate((token) => {
    localStorage.setItem('demo_jwt', token);
    localStorage.setItem('selected_tenant_id', '26');
    localStorage.setItem('role', 'manager');
    localStorage.setItem('roles', JSON.stringify(['manager']));
  }, token);
  
  console.log('🔄 Reloading and monitoring API calls...\n');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2000);
  
  console.log('\n📊 Clicking Reports...\n');
  await page.click('text/Reports');
  
  console.log('⏳ Waiting 10 seconds for reports to load...\n');
  await wait(10000);
  
  const charts = await page.$$('[data-chart-ready="true"]');
  console.log(`\n📈 Final result: ${charts.length} charts found`);
  
  if (charts.length === 0) {
    // Check for error messages
    const errorText = await page.evaluate(() => {
      const errors = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent && (el.textContent.includes('error') || el.textContent.includes('Error') || el.textContent.includes('Loading'))
      );
      return errors.map(el => el.textContent.trim()).slice(0, 5);
    });
    console.log('\n📄 Page messages:', errorText);
  }
  
  await browser.close();
  
  console.log('\n📊 API Call Summary:');
  apiCalls.forEach(call => console.log(`  ${call.status} - ${call.url}`));
}

detailedDebug().catch(console.error);
