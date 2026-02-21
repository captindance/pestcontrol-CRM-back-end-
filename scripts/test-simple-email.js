import { sendMail } from '../dist/services/emailService.js';

async function test() {
  console.log('Testing simple email (same as verification emails)...\n');
  
  const result = await sendMail(
    'captaindanceman@gmail.com',
    'Test Email - Simple',
    'This is a simple test email.',
    '<h2>Test Email</h2><p>This is a simple test email.</p>'
  );
  
  console.log('Result:', result);
  
  if (result.sent) {
    console.log('\n✅ Email sent successfully');
  } else {
    console.log('\n❌ Email failed:', result.error);
  }
}

test();
