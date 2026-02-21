import { sendMail } from '../dist/services/emailService.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

async function test() {
  console.log('Creating LARGE chart (same size as real reports)...\n');
  
  // Same size as real reports
  const canvas = new ChartJSNodeCanvas({ width: 800, height: 600 });
  const config = {
    type: 'bar',
    data: {
      labels: ['A', 'B', 'C', 'D', 'E', 'F'],
      datasets: [
        { label: 'Series 1', data: [10, 20, 30, 40, 50, 60], backgroundColor: 'rgba(54, 162, 235, 0.5)' },
        { label: 'Series 2', data: [15, 25, 35, 45, 55, 65], backgroundColor: 'rgba(255, 99, 132, 0.5)' }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Test Report' }
      }
    }
  };
  
  const imageBuffer = await canvas.renderToBuffer(config);
  console.log(`Chart size: ${(imageBuffer.length / 1024).toFixed(2)}KB\n`);
  
  const imageBase64 = imageBuffer.toString('base64');
  console.log(`Base64 length: ${imageBase64.length} characters\n`);
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px;">
      <h2>Test Report with Large Image</h2>
      <p>This email has a large chart (800x600) embedded as base64.</p>
      <div style="border: 1px solid #ccc; padding: 10px;">
        <img src="data:image/png;base64,${imageBase64}" alt="Test Chart" style="max-width: 100%;" />
      </div>
      <p>If you see this email, check if the image displays correctly.</p>
    </div>
  `;
  
  console.log(`HTML size: ${(html.length / 1024).toFixed(2)}KB\n`);
  
  const result = await sendMail(
    'captaindanceman@gmail.com',
    'Test Email - Large Chart (57KB)',
    undefined,
    html
  );
  
  console.log('Result:', result.sent ? 'SENT' : 'FAILED');
  if (!result.sent) console.log('Error:', result.error);
}

test();
