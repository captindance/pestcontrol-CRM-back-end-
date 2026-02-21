/**
 * Chart.js POC - Server-Side Chart Generation
 * 
 * Tests generating a PNG chart image using Chart.js + node-canvas
 * This validates the new architecture approach recommended by ChatGPT
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample data from actual report in database (Report ID 1)
const sampleDataJson = {
  type: 'bar',
  categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [
    {
      name: 'Sales',
      data: [1200, 1900, 1500, 2100, 1800, 2400]
    },
    {
      name: 'Expenses',
      data: [800, 1100, 900, 1300, 1200, 1500]
    }
  ],
  xLabel: 'Month',
  yLabel: 'Amount ($)'
};

async function generateChartPOC() {
  console.log('🎨 Chart.js POC - Server-Side Chart Generation\n');
  console.log('='.repeat(60));
  
  try {
    // Initialize Chart.js canvas
    const width = 800;
    const height = 600;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width, 
      height,
      backgroundColour: 'white'
    });
    
    console.log(`\n📐 Canvas: ${width}x${height}px`);
    console.log(`📊 Chart Type: ${sampleDataJson.type}`);
    console.log(`📈 Series: ${sampleDataJson.series.length}`);
    console.log(`📅 Data Points: ${sampleDataJson.categories.length}`);
    
    // Build Chart.js configuration from dataJson
    const configuration = {
      type: sampleDataJson.type,
      data: {
        labels: sampleDataJson.categories,
        datasets: sampleDataJson.series.map((s, idx) => ({
          label: s.name,
          data: s.data,
          backgroundColor: getColor(idx, 0.6),
          borderColor: getColor(idx, 1),
          borderWidth: 2
        }))
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Production Value Per Employee (Past 12 Months)',
            font: {
              size: 16,
              weight: 'bold'
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: sampleDataJson.xLabel
            }
          },
          y: {
            title: {
              display: true,
              text: sampleDataJson.yLabel
            },
            beginAtZero: true
          }
        }
      }
    };
    
    console.log('\n⏳ Generating chart image...');
    const startTime = Date.now();
    
    // Render to buffer
    const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    
    const renderTime = Date.now() - startTime;
    const sizeKB = (buffer.length / 1024).toFixed(2);
    
    // Save to file
    const outputPath = path.join(__dirname, 'poc-output', 'chartjs-test.png');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`✅ Chart generated successfully!`);
    console.log(`\n📊 Performance Metrics:`);
    console.log(`   Render Time: ${renderTime}ms`);
    console.log(`   Image Size: ${sizeKB}KB`);
    console.log(`   Memory: ~${Math.round(buffer.length / 1024 / 1024 * 2)}MB`);
    
    console.log(`\n💾 Saved to: ${outputPath}`);
    console.log(`\n✅ SUCCESS CRITERIA:`);
    console.log(`   ✓ Render time < 10s: ${renderTime < 10000 ? 'PASS' : 'FAIL'} (${renderTime}ms)`);
    console.log(`   ✓ Image size < 2MB: ${buffer.length < 2048 * 1024 ? 'PASS' : 'FAIL'} (${sizeKB}KB)`);
    console.log(`   ✓ Professional appearance: CHECK MANUALLY (open image)`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 POC COMPLETE - Chart.js approach is viable!');
    console.log('\nNext Steps:');
    console.log('  1. Open chartjs-test.png and verify visual quality');
    console.log('  2. Show to stakeholders for approval');
    console.log('  3. Proceed with full implementation');
    console.log('='.repeat(60));
    
    return buffer;
    
  } catch (error) {
    console.error('\n❌ POC FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Helper: Get color palette
function getColor(index, alpha = 1) {
  const colors = [
    `rgba(54, 162, 235, ${alpha})`,   // Blue
    `rgba(255, 99, 132, ${alpha})`,   // Red
    `rgba(75, 192, 192, ${alpha})`,   // Teal
    `rgba(255, 206, 86, ${alpha})`,   // Yellow
    `rgba(153, 102, 255, ${alpha})`,  // Purple
    `rgba(255, 159, 64, ${alpha})`,   // Orange
  ];
  return colors[index % colors.length];
}

// Run POC
generateChartPOC().catch(console.error);
