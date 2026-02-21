import { PrismaClient } from '@prisma/client';
import { sendMail } from '../dist/services/emailService.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const prisma = new PrismaClient();
const TEST_EMAIL = 'captaindanceman@gmail.com';

// Match frontend palette exactly
const palette = (i) => {
  const colors = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#219653', '#f2c94c'];
  return colors[i % colors.length];
};

// Format values like frontend does
function formatValue(val, fmt) {
  if (!Number.isFinite(val)) return val;
  const [formatType, decimalsStr] = (fmt || 'number').split(':');
  const decimals = decimalsStr ? parseInt(decimalsStr, 10) : undefined;
  
  if (formatType === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 2
    }).format(val);
  }
  
  if (formatType === 'percentage') {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: decimals ?? 1,
      maximumFractionDigits: decimals ?? 1
    }).format(val / 100);
  }
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 0
  }).format(val);
}

function formatCategoryLabel(label) {
  const str = String(label || '');
  if (str.length > 20) return str.slice(0, 17) + '...';
  return str;
}

// Generate HTML bar chart optimized for email clients (no CSS transforms)
function generateBarChartHTML(data, formatMap, opts = {}) {
  const categories = data.categories || [];
  const series = data.series || [];
  const xLabel = data.xLabel || 'Category';
  const yLabel = data.yLabel || 'Value';
  
  // Calculate scaling (match frontend logic)
  const seriesMaxValues = series.map(s => {
    const nums = (s.data || []).map(v => Number.isFinite(Number(v)) ? Number(v) : 0);
    const max = nums.length ? Math.max(...nums) : 0;
    return Math.max(1, max);
  });
  const sharedMax = Math.max(1, ...seriesMaxValues, 1);
  const minSeriesMax = seriesMaxValues.length ? Math.max(1, Math.min(...seriesMaxValues)) : 1;
  const useSeparateScale = sharedMax / minSeriesMax > 20;
  
  // Generate bars HTML - email-client compatible (no transforms)
  let barsHTML = '';
  categories.forEach((cat, idx) => {
    const barWidth = series.length === 1 ? 36 : 28;
    const barGap = 8;
    const totalBarWidth = series.length * barWidth + (series.length - 1) * barGap;
    
    let innerBarsHTML = '';
    series.forEach((s, si) => {
      const val = Number(s.data[idx]);
      const numVal = Number.isFinite(val) ? val : 0;
      const denom = useSeparateScale ? (seriesMaxValues[si] || 1) : sharedMax;
      const height = (numVal / denom) * 100;
      const formattedVal = formatValue(val, formatMap[s.name]);
      const heightPx = (height / 100) * 300; // 300px is container height
      const canFitInside = heightPx >= 50;
      
      // For email: Use horizontal labels above bars (no rotation support)
      const labelHTML = opts.showValuesOnBars && numVal > 0 
        ? `<div style="position: absolute; top: -26px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #111; background: rgba(255,255,255,0.95); border: 1px solid #ccc; border-radius: 3px; padding: 2px 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.12); font-family: Arial, sans-serif;">${formattedVal}</div>`
        : '';
      
      innerBarsHTML += `
        <div style="width: ${barWidth}px; height: ${height}%; min-height: ${numVal > 0 ? '6px' : '0px'}; background: ${palette(si)}; border-radius: 4px 4px 0 0; position: relative;">
          ${labelHTML}
        </div>
      `;
    });
    
    barsHTML += `
      <div style="display: inline-block; vertical-align: top; text-align: center; margin: 0 10px;">
        <div style="display: flex; align-items: flex-end; justify-content: center; gap: ${barGap}px; height: 300px; position: relative; padding-top: 30px;">
          ${innerBarsHTML}
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: #555; text-align: center; max-width: 100px; word-wrap: break-word; line-height: 1.2;">${formatCategoryLabel(cat)}</div>
      </div>
    `;
  });
  
  // Generate legend
  const legendHTML = series.map((s, idx) => `
    <span style="display: inline-block; margin-right: 16px; margin-top: 8px;">
      <span style="display: inline-block; width: 12px; height: 12px; background: ${palette(idx)}; border-radius: 2px; vertical-align: middle; margin-right: 4px;"></span>
      <span style="font-size: 13px; color: #555; vertical-align: middle;">${s.name || `Series ${idx + 1}`}</span>
    </span>
  `).join('');
  
  return `
    <div style="padding: 20px; background: #f8fafc; border: 1px solid #e3e9ef; border-radius: 6px; margin: 16px 0;">
      <div style="text-align: center; white-space: nowrap; overflow-x: auto;">
        ${barsHTML}
      </div>
      <div style="margin-top: 16px; text-align: center;">
        ${legendHTML}
      </div>
      ${useSeparateScale ? '<div style="margin-top: 12px; font-size: 12px; color: #666; text-align: center; font-style: italic;">Note: Series are scaled independently for visibility; bar heights are not cross-comparable.</div>' : ''}
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 12px;">${xLabel}</div>
    </div>
  `;
}

async function main() {
  console.log('\n================================================================================');
  console.log('📊 COMBINED SCHEDULED REPORT EMAIL');
  console.log('================================================================================\n');
  console.log(`Recipient: ${TEST_EMAIL}`);
  console.log(`Reports: 1, 2\n`);

  try {
    // Fetch both reports
    const reportIds = [1, 2];
    const reports = await prisma.report.findMany({
      where: { id: { in: reportIds } },
      include: { client: { select: { name: true } } }
    });

    if (reports.length === 0) {
      console.log('❌ No reports found');
      return;
    }

    console.log(`✅ Found ${reports.length} reports\n`);

    // Generate chart HTML for each report
    const reportSections = [];
    
    for (const report of reports) {
      console.log(`────────────────────────────────────────────────────────────────────────────────`);
      console.log(`📊 Report ${report.id}: ${report.name}`);
      console.log(`────────────────────────────────────────────────────────────────────────────────`);

      const dataJson = report.dataJson;
      const chartConfig = report.chartConfig;

      if (!dataJson || !dataJson.rows || dataJson.rows.length === 0) {
        console.log(`   ⚠️  No data - skipping`);
        continue;
      }

      console.log(`   ✅ Chart Type: ${chartConfig?.chartType || 'table'}`);
      console.log(`   ✅ Data: ${dataJson.rows.length} rows`);

      // Transform data to match frontend format
      const labelColumn = dataJson.columns[0];
      const dataColumns = dataJson.columns.slice(1);
      const categories = dataJson.rows.map(row => row[labelColumn]);
      
      const series = dataColumns.map((colName) => {
        return {
          name: colName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          data: dataJson.rows.map(row => parseFloat(row[colName]) || 0)
        };
      });

      const data = {
        type: chartConfig?.chartType || 'bar',
        categories,
        series,
        xLabel: labelColumn.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        yLabel: 'Value'
      };

      // Determine format map (currency for income/revenue, number for counts)
      const formatMap = {};
      dataColumns.forEach(col => {
        const lowerCol = col.toLowerCase();
        if (lowerCol.includes('income') || lowerCol.includes('revenue') || lowerCol.includes('total')) {
          formatMap[col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())] = 'currency:2';
        }
      });

      const chartHTML = generateBarChartHTML(data, formatMap, { showValuesOnBars: true });
      
      reportSections.push(`
        <div style="margin-bottom: 40px;">
          <h2 style="color: #1e293b; margin-bottom: 16px;">${report.name}</h2>
          ${chartHTML}
        </div>
      `);

      console.log(`   ✅ Chart HTML generated\n`);
    }

    // Build combined email
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
        <div style="max-width: 900px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">PestControl CRM</h1>
            <p style="color: #e0e7ff; margin: 8px 0 0 0;">Scheduled Report Delivery</p>
          </div>
          
          <div style="padding: 30px; background: #ffffff;">
            <p style="color: #64748b; margin-bottom: 24px;">Your scheduled reports have been generated for ${new Date().toLocaleString()}.</p>
            
            ${reportSections.join('')}
          </div>
          
          <div style="background: #f1f5f9; padding: 20px; border-top: 2px solid #e2e8f0; text-align: center;">
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Automated report from <strong>PestControl CRM</strong>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send combined email
    console.log(`📧 Sending combined email to ${TEST_EMAIL}...`);
    
    const result = await sendMail(
      TEST_EMAIL,
      '[Scheduled Reports] Your Daily Report Summary',
      undefined,
      html
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

    console.log('\n================================================================================');
    console.log('✅ Combined report email completed');
    console.log('================================================================================\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
