/**
 * SECURE Scheduled Report Job Test
 * - Uses PRODUCTION SMTP only
 * - Validates recipient allowlist
 * - Logs all sends for audit
 * 
 * SECURITY: Only captaindanceman@gmail.com and captaindanceman@yahoo.com allowed
 */

import mysql from 'mysql2/promise';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { SecureEmailService } from './secureEmailService.js';
import { EmailSecurityViolation } from './emailSecurity.js';
import crypto from 'crypto';

const TEST_EMAIL = process.argv[3] || 'captaindanceman@gmail.com'; // From command line
const REPORT_ID = process.argv[2] || 1;

async function decryptSmtpPassword(cipher, iv, tag) {
  const key = Buffer.from(process.env.DB_ENCRYPTION_KEY || '', 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(cipher, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function runScheduledReportJob() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 SECURE SCHEDULED REPORT JOB (Adhoc Test)`);
  console.log(`${'='.repeat(80)}\n`);
  
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'test',
    password: 'test',
    database: 'pest_reporting'
  });
  
  try {
    // STEP 1: Fetch report configuration
    console.log(`\n[1/5] Fetching report ID ${REPORT_ID}...`);
    const [reports] = await conn.query(
      'SELECT * FROM reports WHERE id = ? AND deleted_at IS NULL',
      [REPORT_ID]
    );
    
    if (reports.length === 0) {
      throw new Error(`Report ${REPORT_ID} not found`);
    }
    
    const report = reports[0];
    const chartConfig = typeof report.chart_config === 'string' 
      ? JSON.parse(report.chart_config) 
      : report.chart_config;
    const dataJson = typeof report.data_json === 'string'
      ? JSON.parse(report.data_json)
      : report.data_json;
    
    console.log(`   ✅ Report: "${report.name}"`);
    console.log(`   ✅ Client ID: ${report.client_id}`);
    console.log(`   ✅ Chart Type: ${chartConfig?.chartType || 'none'}`);
    
    if (!dataJson) {
      throw new Error('Report has no data - run the report in UI first');
    }
    
    // STEP 2: Generate chart using Chart.js (server-side)
    console.log(`\n[2/5] Generating chart with Chart.js...`);
    
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
      data: {
        labels,
        datasets
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
    
    const startTime = Date.now();
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(chartConfiguration);
    const renderTime = ((Date.now() - startTime) / 1000).toFixed(3);
    
    console.log(`   ✅ Chart rendered in ${renderTime}s`);
    console.log(`   ✅ Image size: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
    console.log(`   ✅ Series: ${datasets.map(d => d.label).join(', ')}`);
    
    // STEP 3: Get PRODUCTION SMTP config
    console.log(`\n[3/5] Loading production SMTP config...`);
    const [smtpRows] = await conn.query(`
      SELECT config_json, secrets_enc_cipher, secrets_enc_iv, secrets_enc_tag
      FROM integration_settings 
      WHERE kind = 'email' AND provider = 'smtp'
      LIMIT 1
    `);
    
    if (smtpRows.length === 0) {
      throw new Error('No SMTP configuration found');
    }
    
    const smtpData = smtpRows[0];
    const smtpConfig = smtpData.config_json;
    const password = await decryptSmtpPassword(
      smtpData.secrets_enc_cipher,
      smtpData.secrets_enc_iv,
      smtpData.secrets_enc_tag
    );
    
    console.log(`   ✅ SMTP: ${smtpConfig.host}:${smtpConfig.port}`);
    console.log(`   ✅ From: ${smtpConfig.fromAddress}`);
    
    // STEP 4: Create SECURE email service
    console.log(`\n[4/5] Initializing secure email service...`);
    const emailService = new SecureEmailService({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.username,
        pass: password
      }
    });
    
    await emailService.verifyConnection();
    
    // STEP 5: Send email (WITH SECURITY VALIDATION)
    console.log(`\n[5/5] Sending email to ${TEST_EMAIL}...`);
    console.log(`   🔒 Security validation in progress...`);
    
    await emailService.sendEmail({
      to: TEST_EMAIL,
      subject: `📊 Scheduled Report: ${report.name}`,
      dataClassification: 'pii', // Has employee names
      html: `
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
              </table>
            </div>
            
            <h3 style="color: #334155; margin-top: 25px;">📊 Chart Visualization</h3>
            <div style="background: white; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center;">
              <img src="cid:chart" alt="Report Chart" style="max-width: 100%; height: auto;" />
            </div>
          </div>
          
          <div style="background: #f1f5f9; padding: 20px; border-top: 2px solid #e2e8f0; text-align: center;">
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Automated report from <strong>PestControl CRM</strong>
            </p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'chart.png',
        content: imageBuffer,
        cid: 'chart'
      }]
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SUCCESS - Secure scheduled job completed\n`);
    console.log(`${'='.repeat(80)}\n`);
    
  } catch (error) {
    if (error instanceof EmailSecurityViolation) {
      console.error(`\n${'='.repeat(80)}`);
      console.error(`🚨 SECURITY VIOLATION BLOCKED`);
      console.error(`${'='.repeat(80)}`);
      console.error(error.message);
      console.error(`${'='.repeat(80)}\n`);
    } else {
      throw error;
    }
  } finally {
    await conn.end();
  }
}

runScheduledReportJob().catch(err => {
  console.error('\n❌ Job failed:', err.message);
  process.exit(1);
});
