import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function queryInvitations() {
  const email = 'captindanceman@yahoo.com';
  
  try {
    console.log(`\n========== INVITATIONS FOR: ${email} ==========\n`);
    
    const invitations = await prisma.invitation.findMany({
      where: { email },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Total invitations found: ${invitations.length}\n`);
    
    if (invitations.length > 0) {
      invitations.forEach((inv, idx) => {
        console.log(`[${idx + 1}] Invitation Details:`);
        console.log(`    ID: ${inv.id}`);
        console.log(`    Email: ${inv.email}`);
        console.log(`    Type: ${inv.invitationType}`);
        console.log(`    Status: ${inv.status}`);
        console.log(`    Token: ${inv.token}`);
        console.log(`    Client ID: ${inv.clientId}`);
        console.log(`    Created At: ${inv.createdAt}`);
        console.log(`    Sent At: ${inv.sentAt}`);
        console.log(`    Expires At: ${inv.expiresAt}`);
        console.log(`    Accepted At: ${inv.acceptedAt}`);
        console.log(`    Updated At: ${inv.updatedAt}`);
        console.log('');
      });
    } else {
      console.log('No invitations found for this email.');
    }
    
    console.log('========== END ==========\n');
    
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

queryInvitations().catch(console.error);
