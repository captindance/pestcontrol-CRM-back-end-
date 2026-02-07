import { prisma } from '../dist/db/prisma.js';

const email = process.argv[2] || 'captaindanceman@gmail.com';

const user = await prisma.user.findUnique({ 
  where: { email }
});

console.log('User:', JSON.stringify(user, null, 2));

if (user) {
  const roles = await prisma.userRole.findMany({
    where: { userId: user.id }
  });
  console.log('UserRoles:', JSON.stringify(roles, null, 2));
}

await prisma.$disconnect();
