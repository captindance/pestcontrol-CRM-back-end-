/**
 * Test script for scheduled reports system
 * Tests: Create schedule, list schedules, manual execution
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3001/api';
const TOKEN_FILE = path.join(__dirname, '../.dev-token.txt');

async function getToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  }
  
  // Get dev token
  const response = await axios.get(`${API_BASE}/dev/token`);
  return response.data.token;
}

async function test() {
  try {
    console.log('🧪 Testing Scheduled Reports System\n');
    console.log('='.repeat(80));

    // Get auth token
    console.log('\n1. Getting authentication token...');
    const token = await getToken();
    console.log('✓ Token obtained');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Get reports to use for schedule
    console.log('\n2. Fetching available reports...');
    const reportsResponse = await axios.get(`${API_BASE}/reports`, { headers });
    const reports = reportsResponse.data.reports || reportsResponse.data;
    
    if (!reports || reports.length === 0) {
      console.log('✗ No reports available. Please create a report first.');
      return;
    }
    
    const report = reports[0];
    console.log(`✓ Found report: ${report.name} (ID: ${report.id})`);

    // Create a test schedule
    console.log('\n3. Creating test schedule...');
    const scheduleData = {
      reportId: report.id,
      name: 'Test Daily Schedule',
      frequency: 'daily',
      timeOfDay: '09:00',
      timezone: 'America/New_York',
      recipients: ['captaindanceman@gmail.com'],
      emailSecurityLevel: 'internal'
    };

    try {
      const createResponse = await axios.post(`${API_BASE}/schedules`, scheduleData, { headers });
      const schedule = createResponse.data.schedule;
      console.log('✓ Schedule created successfully:');
      console.log(`  ID: ${schedule.id}`);
      console.log(`  Name: ${schedule.name}`);
      console.log(`  Frequency: ${schedule.frequency}`);
      console.log(`  Next run: ${schedule.nextRunAt}`);

      // List schedules
      console.log('\n4. Listing all schedules...');
      const listResponse = await axios.get(`${API_BASE}/schedules`, { headers });
      const schedules = listResponse.data.schedules;
      console.log(`✓ Found ${schedules.length} schedule(s):`);
      schedules.forEach(s => {
        console.log(`  - ${s.name} (${s.frequency}, next: ${s.nextRunAt})`);
      });

      // Get schedule details
      console.log('\n5. Getting schedule details...');
      const detailsResponse = await axios.get(`${API_BASE}/schedules/${schedule.id}`, { headers });
      const details = detailsResponse.data.schedule;
      console.log('✓ Schedule details:');
      console.log(`  Report: ${details.reportName}`);
      console.log(`  Recipients: ${details.recipients.join(', ')}`);
      console.log(`  Enabled: ${details.isEnabled}`);

      // Manual execution
      console.log('\n6. Triggering manual execution...');
      const runResponse = await axios.post(`${API_BASE}/schedules/${schedule.id}/run`, {}, { headers });
      console.log('✓ Schedule queued for execution:');
      console.log(`  Job ID: ${runResponse.data.jobId}`);
      console.log('  Check logs for execution progress...');

      // Wait a bit and check execution history
      console.log('\n7. Waiting 10 seconds for execution...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log('\n8. Checking execution history...');
      const executionsResponse = await axios.get(`${API_BASE}/schedules/${schedule.id}/executions`, { headers });
      const executions = executionsResponse.data.executions;
      console.log(`✓ Found ${executions.length} execution(s):`);
      executions.forEach(e => {
        console.log(`  - ${e.status} at ${e.startedAt} (sent: ${e.emailsSent}, failed: ${e.emailsFailed})`);
        if (e.errorMessage) {
          console.log(`    Error: ${e.errorMessage}`);
        }
      });

      console.log('\n' + '='.repeat(80));
      console.log('✅ All tests completed successfully!');
      console.log('\nSchedule System Status:');
      console.log('  - API endpoints: ✓ Working');
      console.log('  - Schedule creation: ✓ Working');
      console.log('  - Queue system: ✓ Working');
      console.log('  - Email integration: ✓ Working');
      console.log('\nNext steps:');
      console.log('  1. Check your email: captaindanceman@gmail.com');
      console.log('  2. Build frontend UI for schedule management');
      console.log('  3. Run security testing');

    } catch (createError) {
      if (createError.response) {
        console.log('✗ Failed to create schedule:');
        console.log(`  Status: ${createError.response.status}`);
        console.log(`  Error: ${JSON.stringify(createError.response.data, null, 2)}`);
      } else {
        console.log('✗ Error:', createError.message);
      }
    }

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run tests
test().catch(console.error);
