/**
 * Send Scheduled Report Emails
 * Uses backend's existing email service with proper decryption
 */

import { PrismaClient } from '@prisma/client';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { sendMail } from '../dist/services/emailService.js';

const prisma = new PrismaClient();

const TEST_EMAIL = process.argv[2] || 'captaindanceman@gmail.com';
const REPORT_IDS = process.argv[3] ? [parseInt(process.argv[3])] : [1, 2]; // Default: both reports

async function sendScheduledReports() {
  console.log('\n' + '='.repeat(80));
  console.log('📧 SCHEDULED REPORT EMAIL TEST');
  console.log('='.repeat(80));
  console.log(`\nRecipient: ${TEST_EMAIL}`);
  console.log(`Reports: ${REPORT_IDS.join(', ')}`);
  console.log('Using: Backend email service with production SMTP\n');

  for (const reportId of REPORT_IDS) {
    try {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📊 Report ${reportId}`);
      console.log('─'.repeat(80));

      // Fetch report
      console.log(`[1/4] Fetching report...`);
      const report = await prisma.report.findUnique({
        where: { id: reportId }
      });

      if (!report) {
        console.log(`❌ Report ${reportId} not found`);
        continue;
      }

      console.log(`   ✅ "${report.name}"`);
      console.log(`   ✅ Client ID: ${report.clientId}`);

      // Parse data
      const chartConfig = typeof report.chartConfig === 'string'
        ? JSON.parse(report.chartConfig)
        : report.chartConfig;
      const dataJson = typeof report.dataJson === 'string'
        ? JSON.parse(report.dataJson)
        : report.dataJson;

      if (!dataJson || !dataJson.rows || dataJson.rows.length === 0) {
        console.log(`   ⚠️  No data - skipping`);
        continue;
      }

      console.log(`   ✅ Chart Type: ${chartConfig?.chartType || 'table'}`);
      console.log(`   ✅ Data: ${dataJson.rows.length} rows`);

      // Generate chart
      console.log(`\n[2/4] Generating chart...`);
      const width = 800;
      const height = 600;
      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

      const labelColumn = dataJson.columns[0];
      const dataColumns = dataJson.columns.slice(1);
      const labels = dataJson.rows.map(row => row[labelColumn]);

      const datasets = dataColumns.map((colName, idx) => {
        const colors = [
          { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgb(54, 162, 235)' },
          { bg: 'rgba(255, 99, 132, 0.5)', border: 'rgb(255, 99, 132)' }
        ];
        const color = colors[idx % colors.length];

        return {
          label: colName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          data: dataJson.rows.map(row => parseFloat(row[colName]) || 0),
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 1
        };
      });

      const chartConfiguration = {
        type: chartConfig?.chartType || 'bar',
        data: { labels, datasets },
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

      const startTime = Date.now();
      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(chartConfiguration);
      const renderTime = ((Date.now() - startTime) / 1000).toFixed(3);

      console.log(`   ✅ Rendered in ${renderTime}s`);
      console.log(`   ✅ Size: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
      console.log(`   ✅ Series: ${datasets.map(d => d.label).join(', ')}`);

      // Build email
      console.log(`\n[3/4] Building email...`);
      
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
                  <td style="padding: 8px 0; color: #0f172a;">${chartConfig?.chartType || 'table'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Data Points:</td>
                  <td style="padding: 8px 0; color: #0f172a;">${datasets.length} series × ${labels.length} categories</td>
                </tr>
              </table>
            </div>
            
            <h3 style="color: #334155; margin-top: 25px;">Chart Visualization</h3>
            <div style="background: white; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center;">
              <img src="cid:chart-image" alt="Report Chart" style="max-width: 100%; height: auto;" />
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 12px; margin: 20px 0; border-radius: 6px;">
              <p style="margin: 0; color: #065f46; font-size: 13px;">
                ✅ This chart displays the same data shown in your dashboard.
              </p>
            </div>
          </div>
          
          <div style="background: #f1f5f9; padding: 20px; border-top: 2px solid #e2e8f0; text-align: center;">
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Automated report from <strong>PestControl CRM</strong>
            </p>
          </div>
        </div>
      `;

      console.log(`   ✅ Email HTML built`);

      // Send email without emoji in subject, using CID attachment
      console.log(`\n[4/4] Sending email to ${TEST_EMAIL}...`);
      
      const result = await sendMail(
        TEST_EMAIL,
        `[Scheduled Report] ${report.name}`, // NO EMOJI for better deliverability
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
      console.error(`\n❌ Error processing report ${reportId}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Scheduled report emails completed');
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
}

sendScheduledReports().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
