import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function queryTimeline() {
  try {
    console.log('\n========== CAPTINDANCEMAN USERS TIMELINE ==========\n');
    
    // Query 1: Users and their roles
    console.log('1. USERS WITH ROLES:');
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'captindanceman'
        }
      },
      include: {
        userRoles: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`   Total users found: ${users.length}\n`);
    if (users.length > 0) {
      users.forEach((user, idx) => {
        console.log(`   [${idx + 1}] USER:`);
        console.log(`       ID: ${user.id}`);
        console.log(`       Email: ${user.email}`);
        console.log(`       Name: ${user.firstName || ''} ${user.lastName || ''}`);
        console.log(`       Email Verified: ${user.emailVerified}`);
        console.log(`       Created At: ${user.createdAt}`);
        console.log(`       Updated At: ${user.updatedAt}`);
        if (user.userRoles && user.userRoles.length > 0) {
          console.log(`       ROLES:`);
          user.userRoles.forEach((role, roleIdx) => {
            console.log(`         [${roleIdx + 1}] Role: ${role.role}, Client ID: ${role.clientId}`);
          });
        } else {
          console.log(`       ROLES: None assigned`);
        }
        console.log();
      });
    } else {
      console.log('   No users found');
    }
    
    console.log('\n2. INVITATIONS:');
    const invitations = await prisma.invitation.findMany({
      where: {
        email: {
          contains: 'captindanceman'
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`   Total invitations found: ${invitations.length}\n`);
    if (invitations.length > 0) {
      invitations.forEach((inv, idx) => {
        console.log(`   [${idx + 1}] INVITATION:`);
        console.log(`       ID: ${inv.id}`);
        console.log(`       Email: ${inv.email}`);
        console.log(`       Type: ${inv.invitationType}`);
        console.log(`       Token: ${inv.token}`);
        console.log(`       Status: ${inv.status}`);
        console.log(`       Created At: ${inv.createdAt}`);
        console.log(`       Sent At: ${inv.sentAt}`);
        console.log();
      });
    } else {
      console.log('   No invitations found');
    }
    
    // Timeline analysis
    console.log('\n3. TIMELINE ANALYSIS:');
    const allEvents: Array<{ type: string; email: string; timestamp: Date; details: string }> = [];
    
    users.forEach(user => {
      allEvents.push({
        type: 'USER_CREATED',
        email: user.email,
        timestamp: user.createdAt,
        details: `User ${user.firstName || ''} ${user.lastName || ''}`
      });
    });
    
    invitations.forEach(inv => {
      allEvents.push({
        type: 'INVITATION_CREATED',
        email: inv.email,
        timestamp: inv.createdAt,
        details: `Invitation type: ${inv.invitationType}, Status: ${inv.status}`
      });
      if (inv.sentAt) {
        allEvents.push({
          type: 'INVITATION_SENT',
          email: inv.email,
          timestamp: inv.sentAt,
          details: `Sent at ${inv.sentAt}`
        });
      }
    });
    
    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (allEvents.length > 0) {
      allEvents.forEach((event, idx) => {
        console.log(`   [${idx + 1}] ${event.timestamp.toISOString()} - ${event.type}`);
        console.log(`       Email: ${event.email}`);
        console.log(`       Details: ${event.details}`);
      });
    } else {
      console.log('   No events found');
    }
    
    console.log('\n========== END TIMELINE ANALYSIS ==========\n');
    
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

queryTimeline().catch(console.error);
