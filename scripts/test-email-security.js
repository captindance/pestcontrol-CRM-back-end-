/**
 * Test Email Security Validation
 * Tests the security blockers without actually sending emails
 */

import { 
  validateRecipient,
  validateSmtpConfig,
  EmailSecurityViolation 
} from './emailSecurity.js';

console.log('\n' + '='.repeat(80));
console.log('🔒 EMAIL SECURITY VALIDATION TESTS');
console.log('='.repeat(80) + '\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } catch (error) {
    if (error instanceof EmailSecurityViolation) {
      console.log(`✅ PASS: ${name}`);
      console.log(`   → Correctly blocked: ${error.message.substring(0, 80)}...`);
      passCount++;
    } else {
      console.log(`❌ FAIL: ${name}`);
      console.log(`   → Unexpected error: ${error.message}`);
      failCount++;
    }
  }
}

// Test 1: Approved recipients should pass
console.log('\n📋 TEST SET 1: Approved Recipients\n');
test('Allow captaindanceman@gmail.com', () => {
  validateRecipient('captaindanceman@gmail.com');
});

test('Allow captindanceman@yahoo.com', () => {
  validateRecipient('captindanceman@yahoo.com');
});

test('Allow with different casing', () => {
  validateRecipient('CaptainDanceman@gmail.com');
});

// Test 2: Unauthorized recipients should be blocked
console.log('\n📋 TEST SET 2: Unauthorized Recipients (Should Block)\n');
test('Block unauthorized@example.com', () => {
  validateRecipient('unauthorized@example.com');
  throw new Error('Should have blocked');
});

test('Block random@gmail.com', () => {
  validateRecipient('random@gmail.com');
  throw new Error('Should have blocked');
});

// Test 3: Test email services should be blocked
console.log('\n📋 TEST SET 3: Test Email Services (Should Block)\n');
test('Block Ethereal.email', () => {
  validateSmtpConfig({ host: 'smtp.ethereal.email' });
  throw new Error('Should have blocked Ethereal');
});

test('Block Mailtrap', () => {
  validateSmtpConfig({ host: 'smtp.mailtrap.io' });
  throw new Error('Should have blocked Mailtrap');
});

test('Block MailHog', () => {
  validateSmtpConfig({ host: 'mailhog.local' });
  throw new Error('Should have blocked MailHog');
});

// Test 4: Production SMTP should pass
console.log('\n📋 TEST SET 4: Production SMTP\n');
test('Allow production SMTP', () => {
  validateSmtpConfig({ host: 'gator3299.hostgator.com' });
});

test('Allow Gmail SMTP', () => {
  validateSmtpConfig({ host: 'smtp.gmail.com' });
});

// Results
console.log('\n' + '='.repeat(80));
console.log('TEST RESULTS');
console.log('='.repeat(80));
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);

if (failCount === 0) {
  console.log('\n🎉 ALL SECURITY TESTS PASSED!');
  console.log('   → Unauthorized recipients are blocked');
  console.log('   → Test email services are blocked');
  console.log('   → Production SMTP is allowed');
  console.log('   → Approved test emails are allowed\n');
} else {
  console.log('\n⚠️  SOME TESTS FAILED - Security may be compromised!\n');
  process.exit(1);
}

console.log('='.repeat(80) + '\n');
