import {prisma} from '../src/db/prisma.js';

const user = await prisma.user.findFirst({where:{email:'captindanceman@yahoo.com'}});
if (user) {
  const roles = await prisma.userRole.findMany({where:{userId:user.id}});
  console.log('User roles:', roles);
}

await prisma.$disconnect();
