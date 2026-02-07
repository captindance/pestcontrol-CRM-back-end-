import { prisma } from '../dist/db/prisma.js';

const email = process.argv[2] || 'captaindanceman@gmail.com';

const invs = await prisma.invitation.findMany({
  where: { email },
  orderBy: { createdAt: 'desc' },
  take: 10
});

console.log(JSON.stringify(invs, null, 2));
await prisma.$disconnect();
