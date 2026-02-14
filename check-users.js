import { prisma } from './dist/db/prisma.js';

const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    userRoles: {
      select: {
        role: true,
        clientId: true,
        client: {
          select: {
            name: true
          }
        }
      }
    }
  }
});

console.log('\n=== Current Users in Database ===\n');
users.forEach(user => {
  console.log('Email:', user.email);
  console.log('Name:', user.firstName, user.lastName);
  console.log('Roles:');
  user.userRoles.forEach(ur => {
    if (ur.clientId) {
      console.log('  -', ur.role, 'for', ur.client?.name || 'Unknown Client');
    } else {
      console.log('  -', ur.role, '(platform-level)');
    }
  });
  console.log('');
});

await prisma.$disconnect();
