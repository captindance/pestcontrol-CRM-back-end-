/**
 * SMTP Connection Test - NO EMAILS SENT
 * Verifies SMTP authentication and connection
 */

import nodemailer from 'nodemailer';
import { prisma } from '../dist/db/prisma.js';
import { decryptSecret } from '../dist/security/crypto.js';

async function testSmtpConnection() {
  console.log('\n' + '='.repeat(80));
  console.log('🔌 SMTP CONNECTION TEST - NO EMAILS SENT');
  console.log('='.repeat(80) + '\n');

  try {
    // Load SMTP settings
    const integ = await prisma.integrationSetting.findFirst({ 
      where: { kind: 'email', provider: 'smtp', active: true } as any 
    });

    if (!integ) {
      console.log('❌ No SMTP configuration found in database');
      return;
    }

    const cfg = integ.configJson as unknown as { 
      host: string; 
      port: number; 
      secure: boolean; 
      username: string; 
      fromAddress: string 
    };

    const secretStr = decryptSecret({ 
      iv: integ.secretsIv, 
      tag: integ.secretsTag, 
      cipherText: integ.secretsCipher 
    });
    
    let password = '';
    try {
      const secrets = JSON.parse(secretStr || '{}');
      password = secrets.password || '';
    } catch {
      console.log('⚠️  Warning: Could not parse encrypted password');
    }

    console.log('📧 SMTP Configuration:');
    console.log(`   Host: ${cfg.host}`);
    console.log(`   Port: ${cfg.port}`);
    console.log(`   Secure: ${cfg.secure}`);
    console.log(`   Username: ${cfg.username}`);
    console.log(`   From Address: ${cfg.fromAddress}`);
    console.log(`   Password: ${password ? '***' + password.slice(-4) : '(not set)'}\n`);

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.username,
        pass: password
      }
    });

    // Test connection
    console.log('🔄 Testing SMTP connection...');
    const verified = await transporter.verify();

    if (verified) {
      console.log('✅ SMTP connection successful!\n');
      console.log('📊 Connection Details:');
      console.log(`   ✓ Authentication: PASSED`);
      console.log(`   ✓ Server: ${cfg.host}:${cfg.port}`);
      console.log(`   ✓ TLS/SSL: ${cfg.secure ? 'SSL/TLS' : 'STARTTLS'}`);
    } else {
      console.log('❌ SMTP connection failed\n');
    }

  } catch (error) {
    console.error('❌ Error testing SMTP connection:');
    console.error(`   Message: ${error.message}`);
    if (error.code) console.error(`   Code: ${error.code}`);
    if (error.command) console.error(`   Command: ${error.command}`);
    if (error.responseCode) console.error(`   Response Code: ${error.responseCode}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Test completed');
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
}

testSmtpConnection().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
