import { prisma } from '../dist/db/prisma.js';

const token = process.argv[2] || 'inv_3nlgulrowwp';

const inv = await prisma.invitation.findUnique({ where: { token } });
console.log(JSON.stringify(inv, null, 2));
await prisma.$disconnect();
