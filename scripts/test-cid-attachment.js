import { sendMail } from '../dist/services/emailService.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

async function test() {
  console.log('Creating chart with CID attachment...\n');
  
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
  
  // Use CID attachment instead of inline base64
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px;">
      <h2>Test Report with CID Attachment</h2>
      <p>This email uses a CID (Content-ID) attachment for the image.</p>
      <div style="border: 1px solid #ccc; padding: 10px;">
        <img src="cid:chart-image" alt="Test Chart" style="max-width: 100%;" />
      </div>
      <p>If you see the chart above, CID attachments work!</p>
    </div>
  `;
  
  const attachments = [
    {
      filename: 'chart.png',
      content: imageBuffer,
      cid: 'chart-image'
    }
  ];
  
  console.log(`Sending with CID attachment...\n`);
  
  const result = await sendMail(
    'captaindanceman@gmail.com',
    'Test Email - CID Attachment Method',
    undefined,
    html,
    { attachments }
  );
  
  console.log('Result:', result.sent ? 'SENT' : 'FAILED');
  if (!result.sent) console.log('Error:', result.error);
}

test();
