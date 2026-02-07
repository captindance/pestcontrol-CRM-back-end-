import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        contains: 'captindanceman'
      }
    },
    include: {
      userRoles: true
    },
    orderBy: {
      id: 'asc'
    }
  });
  
  console.log('Found users:', JSON.stringify(users, null, 2));
  
  const invitations = await prisma.invitation.findMany({
    where: {
      email: {
        contains: 'captindanceman'
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  console.log('\nInvitations:', JSON.stringify(invitations, null, 2));
}

checkUsers()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
