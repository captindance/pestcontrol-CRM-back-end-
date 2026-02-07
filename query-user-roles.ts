import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function queryUserRoles() {
  const email = 'captindanceman@yahoo.com';
  
  try {
    console.log(`\n========== USER ROLES QUERY FOR: ${email} ==========\n`);
    
    // First, find the user
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.log(`User not found with email: ${email}`);
      return;
    }
    
    console.log(`User Found:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Email Verified: ${user.emailVerified}`);
    console.log(`  Name: ${user.firstName || ''} ${user.lastName || ''}`);
    
    // Now query user roles
    console.log(`\nUser Roles:`);
    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id }
    });
    
    if (userRoles.length === 0) {
      console.log('  No roles assigned');
    } else {
      console.log(`  Count: ${userRoles.length}`);
      userRoles.forEach((role, idx) => {
        console.log(`  [${idx + 1}]`);
        console.log(`    ID: ${role.id}`);
        console.log(`    User ID: ${role.userId}`);
        console.log(`    Client ID: ${role.clientId}`);
        console.log(`    Role: ${role.role}`);
        console.log(`    Manager Active: ${role.managerActive}`);
        console.log(`    Created At: ${role.createdAt}`);
        console.log(`    Updated At: ${role.updatedAt}`);
      });
    }
    
    console.log('\n========== END QUERY ==========\n');
    
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

queryUserRoles().catch(console.error);
