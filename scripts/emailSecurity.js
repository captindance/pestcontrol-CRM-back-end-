/**
 * EMAIL SECURITY MODULE (JavaScript version for scripts)
 * 
 * Prevents unauthorized email sends and data exposure.
 */

const APPROVED_TEST_RECIPIENTS = [
  'captaindanceman@gmail.com',
  'captindanceman@yahoo.com'
];

const BLOCKED_TEST_SERVICES = [
  'ethereal.email',
  'mailtrap.io',
  'mailhog',
  'mailcatcher',
  'fakesmtp',
  'localhost:1025',
];

export class EmailSecurityViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailSecurityViolation';
  }
}

export function validateRecipient(email) {
  const normalizedEmail = email.toLowerCase().trim();
  
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  
  if (!APPROVED_TEST_RECIPIENTS.includes(normalizedEmail)) {
    throw new EmailSecurityViolation(
      `SECURITY VIOLATION: Email "${email}" not approved for testing. ` +
      `Only these emails are allowed: ${APPROVED_TEST_RECIPIENTS.join(', ')}`
    );
  }
}

export function validateRecipients(emails) {
  for (const email of emails) {
    validateRecipient(email);
  }
}

export function validateSmtpConfig(config) {
  const host = (config.host || '').toLowerCase();
  
  for (const blockedService of BLOCKED_TEST_SERVICES) {
    if (host.includes(blockedService)) {
      throw new EmailSecurityViolation(
        `SECURITY VIOLATION: Test email service "${blockedService}" is BLOCKED. ` +
        `You must use production SMTP only. NEVER use test services with real data.`
      );
    }
  }
  
  if (host === 'smtp.ethereal.email' || host.includes('ethereal')) {
    throw new EmailSecurityViolation(
      `SECURITY VIOLATION: nodemailer.createTestAccount() is BLOCKED. ` +
      `You exposed real data to public Ethereal.email URLs. Use production SMTP only.`
    );
  }
}

export function logEmailSend(to, subject, hasAttachments, dataClassification) {
  const recipients = Array.isArray(to) ? to : [to];
  const timestamp = new Date().toISOString();
  
  console.log('\n' + '='.repeat(80));
  console.log(`📧 EMAIL AUDIT LOG`);
  console.log('='.repeat(80));
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Recipients: ${recipients.join(', ')}`);
  console.log(`Subject: ${subject}`);
  console.log(`Attachments: ${hasAttachments ? 'Yes' : 'No'}`);
  console.log(`Data Classification: ${dataClassification.toUpperCase()}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(80) + '\n');
}

export function validateEmailSend(to, smtpConfig, subject, dataClassification) {
  const recipients = Array.isArray(to) ? to : [to];
  
  validateSmtpConfig(smtpConfig);
  validateRecipients(recipients);
  logEmailSend(to, subject, false, dataClassification);
  
  if (process.env.NODE_ENV !== 'production' && 
      (dataClassification === 'pii' || dataClassification === 'confidential')) {
    console.warn('\n⚠️  WARNING: Sending PII/confidential data in non-production environment');
    console.warn(`   Ensure recipients are authorized: ${recipients.join(', ')}\n`);
  }
}
