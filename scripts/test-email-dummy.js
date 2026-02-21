/**
 * Test Email Delivery with DUMMY DATA
 * NO REAL CLIENT DATA - Safe to send to any email
 */

import { PrismaClient } from '@prisma/client';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { sendMail } from '../dist/services/emailService.js';

const prisma = new PrismaClient();

const TEST_EMAIL = process.argv[2] || 'captaindanceman@gmail.com';

// DUMMY DATA - NO REAL CLIENT INFO
const DUMMY_REPORTS = [
  {
    id: 'test-1',
    name: 'Employee Performance Report',
    chartType: 'bar',
    data: {
      columns: ['employee', 'revenue'],
      rows: [
        { employee: 'Employee A', revenue: 5000 },
        { employee: 'Employee B', revenue: 7500 },
        { employee: 'Employee C', revenue: 6200 }
      ]
    }
  },
  {
    id: 'test-2',
    name: 'Monthly Revenue Trends',
    chartType: 'line',
    data: {
      columns: ['month', 'revenue'],
      rows: [
        { month: 'Jan', revenue: 15000 },
        { month: 'Feb', revenue: 18000 },
        { month: 'Mar', revenue: 16500 }
      ]
    }
  }
];

async function testEmailDelivery() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 EMAIL DELIVERY TEST - DUMMY DATA');
  console.log('='.repeat(80));
  console.log(`\n✅ SAFE TO SEND: No real client data`);
  console.log(`📧 Recipient: ${TEST_EMAIL}`);
  console.log(`📊 Reports: ${DUMMY_REPORTS.length} test reports\n`);

  for (const report of DUMMY_REPORTS) {
    try {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📊 ${report.name}`);
      console.log('─'.repeat(80));

      // Generate chart
      console.log(`[1/3] Generating chart...`);
      const width = 800;
      const height = 600;
      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

      const labels = report.data.rows.map(row => row[report.data.columns[0]]);
      const dataColumn = report.data.columns[1];

      const chartConfiguration = {
        type: report.chartType,
        data: {
          labels,
          datasets: [{
            label: dataColumn.replace(/_/g, ' ').toUpperCase(),
            data: report.data.rows.map(row => parseFloat(row[dataColumn]) || 0),
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            title: {
              display: true,
              text: report.name
            }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      };

      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(chartConfiguration);
      console.log(`   ✅ Chart generated: ${(imageBuffer.length / 1024).toFixed(2)}KB`);

      // Build email with CID attachment (better than base64 inline)
      console.log(`[2/3] Building email...`);
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">PestControl CRM</h1>
            <p style="color: #e0e7ff; margin: 8px 0 0 0;">Scheduled Report Delivery</p>
          </div>
          
          <div style="padding: 30px;">
            <h2 style="color: #1e293b; margin-top: 0;">${report.name}</h2>
            <p style="color: #64748b;">Your scheduled report has been generated.</p>
            
            <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 140px;">Generated:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${new Date().toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Chart Type:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${report.chartType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Data Points:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${report.data.rows.length} rows</td>
                </tr>
              </table>
            </div>
            
            <h3 style="color: #334155; margin-top: 25px;">Chart Visualization</h3>
            <div style="background: white; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center;">
              <img src="cid:chart-image" alt="Report Chart" style="max-width: 100%; height: auto;" />
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin: 20px 0; border-radius: 6px;">
              <p style="margin: 0; color: #856404; font-size: 13px;">
                ⚠️ <strong>TEST EMAIL:</strong> This contains dummy data for testing purposes.
              </p>
            </div>
          </div>
          
          <div style="background: #f1f5f9; padding: 20px; border-top: 2px solid #e2e8f0; text-align: center;">
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Automated report from <strong>PestControl CRM</strong>
            </p>
            <p style="color: #94a3b8; font-size: 11px; margin: 8px 0 0 0;">
              <a href="mailto:unsubscribe@familyfriendlytechnologies.com" style="color: #64748b;">Unsubscribe</a>
            </p>
          </div>
        </div>
      `;

      console.log(`   ✅ Email HTML built (CID attachment method)`);

      // Send email WITHOUT EMOJI in subject
      console.log(`[3/3] Sending email...`);
      
      const result = await sendMail(
        TEST_EMAIL,
        `[Test Report] ${report.name}`, // NO EMOJI
        undefined,
        html,
        {
          attachments: [{
            filename: 'chart.png',
            content: imageBuffer,
            cid: 'chart-image' // Referenced in HTML as cid:chart-image
          }]
        }
      );

      if (result.sent) {
        console.log(`   ✅ Email sent successfully!`);
        console.log(`   ✅ Message ID: ${result.messageId}`);
        if (result.accepted && result.accepted.length > 0) {
          console.log(`   ✅ Accepted: ${result.accepted.join(', ')}`);
        }
      } else {
        console.log(`   ❌ Email failed: ${result.error}`);
      }

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Test completed');
  console.log('\n📋 Next Steps:');
  console.log('   1. Check inbox (and spam folder)');
  console.log('   2. Click "..." → "Show original" to view headers');
  console.log('   3. Verify SPF, DKIM, DMARC all show "PASS"');
  console.log('   4. Check if images render correctly');
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
}

testEmailDelivery().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
