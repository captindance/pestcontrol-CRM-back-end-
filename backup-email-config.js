import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

const smtpSettings = await prisma.integrationSettings.findMany({
  where: { kind: 'smtp_email' }
});

console.log('\n=== SMTP Email Configuration ===');
if (smtpSettings.length === 0) {
  console.log('⚠ No SMTP settings found in database.');
} else {
  console.log('✓ Found', smtpSettings.length, 'SMTP configuration(s)');
  console.log(JSON.stringify(smtpSettings, null, 2));
  
  const backupFile = 'email-config-backup.json';
  fs.writeFileSync(backupFile, JSON.stringify(smtpSettings, null, 2));
  console.log('\n✓ Email config backed up to:', backupFile);
}

await prisma.$disconnect();
