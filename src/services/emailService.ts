import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma.js';
import { encryptSecret, decryptSecret } from '../security/crypto.js';

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for 587/STARTTLS
  username: string;
  password?: string; // plain input from admin (optional on update)
  fromAddress: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string; // decrypted
  fromAddress: string;
}

async function loadSettings(): Promise<SmtpConfig | null> {
  // Fetch from generic IntegrationSetting (kind=email, provider=smtp)
  const integ = await prisma.integrationSetting.findFirst({ where: { kind: 'email', provider: 'smtp', active: true } as any });
  if (!integ) return null;
  
  try {
    const cfg = integ.configJson as unknown as { host: string; port: number; secure: boolean; username: string; fromAddress: string };
const secretStr = decryptSecret({ iv: integ.secretsIv, tag: integ.secretsTag, cipherText: integ.secretsCipher });
    let secrets = {};
    try {
      // Try to parse as JSON (for encrypted passwords)
      secrets = JSON.parse(secretStr || '{}');
    } catch {
      // If parsing fails, treat as base64 encoded (for dev setup)
      try {
        secrets = JSON.parse(Buffer.from(integ.secretsCipher, 'base64').toString('utf8') || '{}');
      } catch {
        secrets = { password: '' } as any; // Fallback to empty password
      }
    }
    const password = (secrets as any).password || '';
    return {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      username: cfg.username,
      password,
      fromAddress: cfg.fromAddress,
    };
  } catch (e) {
    console.error('[email] Failed to parse IntegrationSetting', e);
    return null;
  }
}

async function saveSettings(input: SmtpConfigInput) {
  // Use generic IntegrationSetting entry (kind=email, provider=smtp)
  const existing = await prisma.integrationSetting.findFirst({ where: { kind: 'email', provider: 'smtp' } as any });
  // Preserve password if not provided
  let secretsObj: any = {};
  if (input.password && input.password.length > 0) {
    secretsObj.password = input.password;
  } else if (existing) {
    try {
      const existingSecretsStr = decryptSecret({ iv: existing.secretsIv, tag: existing.secretsTag, cipherText: existing.secretsCipher });
      secretsObj = JSON.parse(existingSecretsStr || '{}');
    } catch {
      secretsObj = {};
    }
  }
  const enc = encryptSecret(JSON.stringify(secretsObj));
  const cfgJson = {
    host: input.host,
    port: input.port,
    secure: input.secure,
    username: input.username,
    fromAddress: input.fromAddress,
  };
  const id = 1; // Use auto-increment ID instead of string
  await prisma.integrationSetting.upsert({
    where: { id },
    update: {
      kind: 'email' as any,
      provider: 'smtp',
      configJson: cfgJson as any,
      secretsIv: enc.iv,
      secretsTag: enc.tag,
      secretsCipher: enc.cipherText,
      active: true,
    },
    create: {
      kind: 'email' as any,
      provider: 'smtp',
      configJson: cfgJson as any,
      secretsIv: enc.iv,
      secretsTag: enc.tag,
      secretsCipher: enc.cipherText,
      active: true,
    },
  });
}

function createTransport(config: SmtpConfig, opts?: { secureOverride?: boolean; requireTLS?: boolean }) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: opts?.secureOverride ?? config.secure,
    requireTLS: opts?.requireTLS,
    name: config.host, // Use SMTP host as HELO hostname instead of localhost
    auth: {
      user: config.username,
      pass: config.password,
    },
  });
}

export async function sendMail(to: string, subject: string, text?: string, html?: string): Promise<{ sent: boolean; messageId?: string; accepted?: string[]; rejected?: string[]; response?: string; error?: string }> {
  try {
    const cfg = await loadSettings();
    if (!cfg) {
      console.log('[email] ERROR: SMTP not configured');
      return { sent: false, error: 'SMTP not configured' };
    }
    const usePort587 = cfg.port === 587;
    const effectiveSecure = usePort587 ? false : cfg.secure; // STARTTLS path on 587
    const requireTLS = usePort587 ? true : undefined; // enforce TLS upgrade on 587
    if (usePort587 && cfg.secure) {
      console.warn('[email] secure=true provided with port 587; using STARTTLS (secure=false, requireTLS=true)');
    }
    console.log('[email] Attempting to send email', { to, subject, from: cfg.fromAddress });
    console.log('[email] SMTP config loaded', { host: cfg.host, port: cfg.port, secure: effectiveSecure, requireTLS: !!requireTLS, heloHostname: cfg.host, username: cfg.username, fromAddress: cfg.fromAddress });
    const transporter = createTransport(cfg, { secureOverride: effectiveSecure, requireTLS });
    const info = await transporter.sendMail({ from: cfg.fromAddress, to, subject, text, html });
    const normalize = (entries?: Array<string | { address?: string }>) =>
      (entries || []).map((entry) =>
        typeof entry === 'string' ? entry : entry?.address || ''
      );
    const accepted = normalize(info.accepted);
    const rejected = normalize(info.rejected);
    console.log('[email] ✓ Email sent successfully', { 
      messageId: info.messageId, 
      accepted, 
      rejected,
      response: info.response 
    });
    return { sent: true, messageId: info.messageId, accepted, rejected, response: info.response };
  } catch (e: any) {
    console.error('[email] ✗ Failed to send email', { 
      error: e?.message, 
      code: e?.code,
      command: e?.command,
      responseCode: e?.responseCode,
      response: e?.response
    });
    return { sent: false, error: e?.message || 'Failed to send email' };
  }
}

export async function getEmailSettings() {
  const cfg = await loadSettings();
  if (!cfg) return null;
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    username: cfg.username,
    fromAddress: cfg.fromAddress,
    // Do not return password
  };
}

export async function updateEmailSettings(input: SmtpConfigInput) {
  await saveSettings(input);
}

// Helpers to build consistent subjects/text/html for emails
export function buildVerificationEmail(firstName: string, verificationLink: string) {
  const subject = 'Verify Your Email - PestControl CRM';
  const text = `Welcome to PestControl CRM, ${firstName}!\n\nPlease verify your email and set your password to complete your registration.\n\nVerify your email: ${verificationLink}\n\nThis link will expire in 30 days.`;
  const html = `<h2>Welcome to PestControl CRM, ${firstName}!</h2><p>Please verify your email and set your password to complete your registration.</p><p><a href="${verificationLink}" style="background-color: #0078d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email & Set Password</a></p><p>Or copy this link: ${verificationLink}</p><p>This link will expire in 30 days.</p>`;
  return { subject, text, html };
}

export function buildInvitationEmail(displayName: string, invitationLink: string) {
  const subject = "You're Invited to Join PestControl CRM";
  const text = `Welcome to PestControl CRM\n\nYou've been invited to join ${displayName || 'PestControl CRM'}. Click below to create your account.\n\nCreate your account: ${invitationLink}\n\nThis invitation is valid for 30 days.`;
  const html = `<h2>Welcome to PestControl CRM</h2><p>You've been invited to join ${displayName || 'PestControl CRM'}. Click below to create your account.</p><p><a href="${invitationLink}" style="background-color: #0078d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Create Account</a></p><p>Or copy this link: ${invitationLink}</p><p>This invitation is valid for 30 days.</p>`;
  return { subject, text, html };
}

// ===== SIGNUP EVENT LOGGING (for diagnostics) =====
interface SignupEvent {
  timestamp: string;
  event: string;
  email?: string;
  details?: any;
}

const signupEventLog: SignupEvent[] = [];
const MAX_LOG_ENTRIES = 100;

export function logSignupEvent(event: string, email?: string, details?: any) {
  const entry: SignupEvent = {
    timestamp: new Date().toISOString(),
    event,
    email,
    details
  };
  signupEventLog.push(entry);
  if (signupEventLog.length > MAX_LOG_ENTRIES) {
    signupEventLog.shift(); // Remove oldest
  }
  console.log(`[signup-log] ${event}`, { email, details });
}

export function getSignupEventLog(): SignupEvent[] {
  return JSON.parse(JSON.stringify(signupEventLog)); // Deep clone
}
