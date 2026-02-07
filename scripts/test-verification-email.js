import { sendMail } from '../dist/services/emailService.js';

const email = 'captaindanceman@gmail.com';
const firstName = 'Test';
const verificationToken = 'test_token_123';

const verificationLink = `http://localhost:3000/verify-email?token=${verificationToken}`;
const emailBodyText = `Welcome to PestControl CRM, ${firstName}!\n\nThank you for creating an account. Please verify your email address and set your password to complete your registration.\n\nVerify your email: ${verificationLink}\n\nThis link will expire in 30 days.`;
const emailBodyHtml = `
  <h2>Welcome to PestControl CRM, ${firstName}!</h2>
  <p>Thank you for creating an account. Please verify your email address and set your password to complete your registration.</p>
  <p><a href="${verificationLink}" style="background-color: #0078d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email & Set Password</a></p>
  <p>Or copy this link: ${verificationLink}</p>
  <p>This link will expire in 30 days.</p>
`;

console.log('[test-verification-email] Sending verification email to:', email);
console.log('[test-verification-email] Subject: Verify Your Email - PestControl CRM');
console.log('[test-verification-email] Text length:', emailBodyText.length);
console.log('[test-verification-email] HTML length:', emailBodyHtml.length);

const mailResult = await sendMail(
  email,
  'Verify Your Email - PestControl CRM',
  emailBodyText,
  emailBodyHtml
);

console.log('[test-verification-email] Result:', mailResult);

process.exit(mailResult.sent ? 0 : 1);
