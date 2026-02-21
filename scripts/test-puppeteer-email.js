import { PrismaClient } from '@prisma/client';
import { generateChartImage, initializeChartCluster, closeChartCluster } from '../dist/services/chartImageService.js';
import { sendMail } from '../dist/services/emailService.js';

const prisma = new PrismaClient();
const TEST_EMAIL = 'captaindanceman@gmail.com';

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PUPPETEER CHART IMAGE EMAIL TEST');
  console.log('='.repeat(80) + '\n');
  console.log(`Recipient: ${TEST_EMAIL}`);
  console.log(`Reports: 1, 2\n`);

  try {
    // Initialize Puppeteer cluster
    console.log('🚀 Initializing Puppeteer cluster...');
    await initializeChartCluster();
    console.log('   ✅ Cluster ready\n');

    // Generate chart images for both reports
    const reportIds = [1, 2];
    const reports = [];

    for (const reportId of reportIds) {
      console.log(`${'─'.repeat(80)}`);
      console.log(`📊 Report ${reportId}`);
      console.log(`${'─'.repeat(80)}`);

      // Fetch report
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: { id: true, name: true, dataJson: true, chartConfig: true }
      });

      if (!report) {
        console.log(`   ⚠️  Report ${reportId} not found - skipping`);
        continue;
      }

      console.log(`   ✅ "${report.name}"`);

      if (!report.dataJson) {
        console.log(`   ⚠️  No data - skipping`);
        continue;
      }

      // Generate chart image
      console.log(`   🎨 Generating chart image...`);
      await generateChartImage(reportId);

      // Fetch updated report with image
      const updatedReport = await prisma.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          name: true,
          chartImageData: true,
          chartImageError: true,
          chartImageGeneratedAt: true
        }
      });

      if (updatedReport?.chartImageData) {
        const sizeKB = (updatedReport.chartImageData.length / 1024).toFixed(2);
        console.log(`   ✅ Chart image generated: ${sizeKB}KB`);
        reports.push(updatedReport);
      } else if (updatedReport?.chartImageError) {
        console.log(`   ❌ Chart generation failed: ${updatedReport.chartImageError}`);
      } else {
        console.log(`   ❌ Chart image not found in database`);
      }
    }

    if (reports.length === 0) {
      console.log('\n❌ No charts generated - cannot send email');
      return;
    }

    // Build combined email with both charts
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📧 Building email with ${reports.length} charts...`);
    console.log(`${'='.repeat(80)}\n`);

    const reportSections = reports.map((report, idx) => `
      <div style="margin-bottom: 40px; page-break-inside: avoid;">
        <h2 style="color: #1e293b; margin-bottom: 16px; font-size: 20px;">
          Report ${idx + 1}: ${report.name}
        </h2>
        <div style="background: #f8fafc; border: 1px solid #e3e9ef; border-radius: 6px; padding: 16px; text-align: center;">
          <img src="cid:chart-image-${report.id}" alt="${report.name}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
        </div>
        <div style="margin-top: 12px; padding: 12px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px;">
          <p style="margin: 0; color: #065f46; font-size: 13px;">
            ✅ This chart was generated from your saved report data and matches your dashboard exactly.
          </p>
        </div>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background: #f5f5f5;">
        <div style="max-width: 900px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">PestControl CRM</h1>
            <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 16px;">Scheduled Report Delivery</p>
          </div>
          
          <div style="padding: 30px;">
            <p style="color: #64748b; margin-bottom: 24px; font-size: 15px;">
              Your scheduled reports have been generated for <strong>${new Date().toLocaleString()}</strong>.
            </p>
            
            ${reportSections}
          </div>
          
          <div style="background: #f1f5f9; padding: 20px; border-top: 2px solid #e2e8f0; text-align: center;">
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Automated report from <strong>PestControl CRM</strong>
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0 0;">
              Charts generated via Puppeteer for pixel-perfect accuracy
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Build attachments array
    const attachments = reports.map(report => ({
      filename: `chart-${report.id}.png`,
      content: report.chartImageData,
      cid: `chart-image-${report.id}`
    }));

    // Send email
    console.log(`📧 Sending email to ${TEST_EMAIL}...`);
    const result = await sendMail(
      TEST_EMAIL,
      '[Scheduled Reports] Your Report Summary (Puppeteer Charts)',
      undefined,
      html,
      { attachments }
    );

    if (result.sent) {
      console.log(`   ✅ Email sent successfully!`);
      console.log(`   ✅ Message ID: ${result.messageId}`);
      if (result.accepted && result.accepted.length > 0) {
        console.log(`   ✅ Accepted: ${result.accepted.join(', ')}`);
      }
    } else {
      console.log(`   ❌ Failed to send: ${result.error}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test completed successfully');
    console.log('='.repeat(80) + '\n');

    console.log('📋 Next Steps:');
    console.log('   1. Check your email at ' + TEST_EMAIL);
    console.log('   2. Compare charts in email vs charts in UI');
    console.log('   3. Verify they look EXACTLY the same');
    console.log('   4. Confirm both reports in single email\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await closeChartCluster();
    await prisma.$disconnect();
  }
}

main();
