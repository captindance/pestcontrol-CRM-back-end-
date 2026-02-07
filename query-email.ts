import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEmailState() {
  const email = 'captindanceman@yahoo.com';
  
  try {
    console.log(`\n========== DATABASE CHECK FOR: ${email} ==========\n`);
    
    // Query 1: Invitations
    console.log('1. INVITATIONS:');
    const invitations = await prisma.invitation.findMany({
      where: { email },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`   Count: ${invitations.length}`);
    if (invitations.length > 0) {
      invitations.forEach((inv, idx) => {
        console.log(`   [${idx + 1}] ID: ${inv.id}, Type: ${inv.invitationType}, Status: ${inv.status}, Created: ${inv.createdAt}`);
      });
    } else {
      console.log('   No invitations found');
    }
    
    // Query 2: Users
    console.log('\n2. USERS:');
    const users = await prisma.user.findMany({
      where: { email }
    });
    console.log(`   Count: ${users.length}`);
    if (users.length > 0) {
      users.forEach((user, idx) => {
        console.log(`   [${idx + 1}] ID: ${user.id}, Name: ${user.firstName || ''} ${user.lastName || ''}, Email: ${user.email}, Verified: ${user.emailVerified}, Created: ${user.createdAt}`);
      });
    } else {
      console.log('   No users found');
    }
    
    // Query 3: Integration Settings (email kind)
    console.log('\n3. INTEGRATION_SETTINGS (email kind):');
    const emailSettings = await prisma.integrationSetting.findMany({
      where: { kind: 'email' }
    });
    console.log(`   Count: ${emailSettings.length}`);
    if (emailSettings.length > 0) {
      emailSettings.forEach((setting, idx) => {
        console.log(`   [${idx + 1}] ID: ${setting.id}, Kind: ${setting.kind}, Provider: ${setting.provider}, Active: ${setting.active}`);
      });
    } else {
      console.log('   No email integration settings found');
    }
    
    console.log('\n========== END DATABASE CHECK ==========\n');
    
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkEmailState().catch(console.error);
