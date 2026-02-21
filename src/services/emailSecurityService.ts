import { prisma } from '../db/prisma.js';
import { 
  logEmailSecurityEvent,
  AuditAction,
  AuditSeverity
} from './auditLogService.js';

/**
 * EMAIL SECURITY SERVICE
 * 
 * Prevents unauthorized email sends and data exposure.
 * Integrates with audit logging for compliance.
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
  constructor(message: string) {
    super(message);
    this.name = 'EmailSecurityViolation';
  }
}

export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  PII = 'pii',
  CONFIDENTIAL = 'confidential'
}

/**
 * Validate single email recipient
 */
export function validateRecipient(email: string): void {
  const normalizedEmail = email.toLowerCase().trim();

  // In non-production, only allow approved test recipients
  if (process.env.NODE_ENV !== 'production') {
    if (!APPROVED_TEST_RECIPIENTS.includes(normalizedEmail)) {
      throw new EmailSecurityViolation(
        `SECURITY VIOLATION: Email "${email}" not approved for testing. ` +
        `Only these emails are allowed: ${APPROVED_TEST_RECIPIENTS.join(', ')}`
      );
    }
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw new EmailSecurityViolation(`Invalid email format: ${email}`);
  }
}

/**
 * Validate multiple email recipients
 */
export function validateRecipients(emails: string[]): void {
  if (!Array.isArray(emails) || emails.length === 0) {
    throw new EmailSecurityViolation('No recipients provided');
  }

  if (emails.length > 20) {
    throw new EmailSecurityViolation('Too many recipients (max 20)');
  }

  for (const email of emails) {
    validateRecipient(email);
  }
}

/**
 * Validate SMTP configuration
 */
export function validateSmtpConfig(config: { host?: string }): void {
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

/**
 * Validate recipients against tenant's allowed domains
 */
export async function validateTenantEmailDomains(
  tenantId: number,
  recipients: string[]
): Promise<void> {
  const tenant = await prisma.client.findUnique({
    where: { id: tenantId },
    // TODO: Add allowedEmailDomains field to schema
    // select: { allowedEmailDomains: true }
  });

  if (!tenant) {
    throw new EmailSecurityViolation('Tenant not found');
  }

  // TODO: Uncomment when schema is updated
  /*
  if (!tenant.allowedEmailDomains || tenant.allowedEmailDomains.length === 0) {
    // No restrictions set - allow any domain (for now)
    return;
  }

  for (const email of recipients) {
    const domain = email.split('@')[1]?.toLowerCase();
    const isAllowed = tenant.allowedEmailDomains.some(
      allowedDomain => domain === allowedDomain.toLowerCase() || 
                       email.toLowerCase().endsWith(allowedDomain.toLowerCase())
    );

    if (!isAllowed) {
      throw new EmailSecurityViolation(
        `Email domain @${domain} not authorized for this tenant. ` +
        `Allowed domains: ${tenant.allowedEmailDomains.join(', ')}`
      );
    }
  }
  */
}

/**
 * Check if external email approval is required
 */
export async function requiresExternalEmailApproval(
  tenantId: number,
  recipients: string[]
): Promise<boolean> {
  const tenant = await prisma.client.findUnique({
    where: { id: tenantId }
    // TODO: Add requireEmailApproval field to schema
    // select: { requireEmailApproval: true, allowedEmailDomains: true }
  });

  if (!tenant) {
    return true; // Require approval if tenant not found
  }

  // TODO: Implement when schema is updated
  // For now, return false (no approval workflow yet)
  return false;
}

/**
 * Validate complete email send operation
 */
export async function validateEmailSend(
  userId: number,
  tenantId: number,
  recipients: string[],
  subject: string,
  dataClassification: DataClassification,
  smtpConfig?: { host?: string }
): Promise<void> {
  try {
    // 1. Validate SMTP configuration
    if (smtpConfig) {
      validateSmtpConfig(smtpConfig);
    }

    // 2. Validate individual recipients
    validateRecipients(recipients);

    // 3. Validate against tenant domain restrictions
    await validateTenantEmailDomains(tenantId, recipients);

    // 4. Check if external approval is required
    const needsApproval = await requiresExternalEmailApproval(tenantId, recipients);
    if (needsApproval) {
      await logEmailSecurityEvent(
        AuditAction.EMAIL_EXTERNAL_APPROVAL_REQUIRED,
        AuditSeverity.WARNING,
        userId,
        tenantId,
        recipients,
        'External email requires approval'
      );
    }

    // 5. Log successful validation
    await logEmailSecurityEvent(
      AuditAction.EMAIL_SENT,
      AuditSeverity.INFO,
      userId,
      tenantId,
      recipients
    );

    // 6. Warn about PII/confidential data in non-production
    if (process.env.NODE_ENV !== 'production' &&
        (dataClassification === DataClassification.PII || 
         dataClassification === DataClassification.CONFIDENTIAL)) {
      console.warn('\n⚠️  WARNING: Sending PII/confidential data in non-production environment');
      console.warn(`   Recipients: ${recipients.join(', ')}`);
      console.warn(`   Subject: ${subject}\n`);
    }

  } catch (error) {
    // Log blocked email attempt
    if (error instanceof EmailSecurityViolation) {
      await logEmailSecurityEvent(
        AuditAction.EMAIL_BLOCKED_DOMAIN,
        AuditSeverity.CRITICAL,
        userId,
        tenantId,
        recipients,
        error.message
      );
    }
    throw error;
  }
}

/**
 * Validate email domain against business rules
 */
export function validateEmailDomain(email: string): { isValid: boolean; reason?: string } {
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    return { isValid: false, reason: 'Invalid email format' };
  }

  // Block known disposable email providers
  const disposableDomains = [
    'guerrillamail.com',
    'mailinator.com',
    'tempmail.com',
    '10minutemail.com',
    'throwaway.email'
  ];

  if (disposableDomains.includes(domain)) {
    return { isValid: false, reason: 'Disposable email addresses not allowed' };
  }

  // Block test services
  if (BLOCKED_TEST_SERVICES.some(service => domain.includes(service))) {
    return { isValid: false, reason: 'Test email services not allowed' };
  }

  return { isValid: true };
}

/**
 * Rate limiting: Check if user/tenant has exceeded email send limits
 */
export async function checkEmailRateLimit(
  userId: number,
  tenantId: number
): Promise<{ allowed: boolean; reason?: string }> {
  // TODO: Implement actual rate limiting with Redis or database
  // For now, return allowed
  // In production, should check:
  // - Emails sent in last hour/day
  // - Per-tenant limits
  // - Per-user limits
  
  return { allowed: true };
}
