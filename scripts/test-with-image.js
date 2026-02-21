import { sendMail } from '../dist/services/emailService.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

async function test() {
  console.log('Creating tiny test chart...\n');
  
  // Create smallest possible chart
  const canvas = new ChartJSNodeCanvas({ width: 100, height: 100 });
  const config = {
    type: 'bar',
    data: {
      labels: ['A'],
      datasets: [{ label: 'Test', data: [1], backgroundColor: 'blue' }]
    }
  };
  
  const imageBuffer = await canvas.renderToBuffer(config);
  console.log(`Chart size: ${(imageBuffer.length / 1024).toFixed(2)}KB\n`);
  
  const imageBase64 = imageBuffer.toString('base64');
  
  const html = `
    <h2>Test with Image</h2>
    <img src="data:image/png;base64,${imageBase64}" alt="Test Chart" />
    <p>This email has a small chart embedded.</p>
  `;
  
  const result = await sendMail(
    'captaindanceman@gmail.com',
    'Test Email - With Chart Image',
    undefined,
    html
  );
  
  console.log('Result:', result.sent ? 'SENT' : 'FAILED');
  if (!result.sent) console.log('Error:', result.error);
}

test();
