/**
 * SECURE EMAIL SERVICE (JavaScript version for scripts)
 * 
 * Wrapper around nodemailer with built-in security validation.
 */

import nodemailer from 'nodemailer';
import { 
  validateEmailSend, 
  EmailSecurityViolation,
  logEmailSend 
} from './emailSecurity.js';

export class SecureEmailService {
  constructor(smtpConfig) {
    this.smtpConfig = smtpConfig;
    
    // Validate SMTP config
    validateEmailSend(
      [],
      smtpConfig,
      'SMTP Config Validation',
      'public'
    );
    
    this.transporter = nodemailer.createTransport(smtpConfig);
  }
  
  async sendEmail(options) {
    // Validate BEFORE sending
    validateEmailSend(
      options.to,
      this.smtpConfig,
      options.subject,
      options.dataClassification
    );
    
    // Log with attachment info
    logEmailSend(
      options.to,
      options.subject,
      !!options.attachments?.length,
      options.dataClassification
    );
    
    // Send email
    const info = await this.transporter.sendMail({
      from: this.smtpConfig.auth.user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments || []
    });
    
    console.log(`✅ Email sent successfully to: ${options.to}`);
    return info;
  }
  
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified');
      return true;
    } catch (error) {
      console.error('❌ SMTP connection failed:', error.message);
      return false;
    }
  }
}
