const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const businessOwners = await prisma.userRole.findMany({
    where: { role: 'business_owner' },
    include: { 
      user: { select: { email: true, firstName: true, lastName: true } },
      client: { select: { name: true, id: true } }
    },
    take: 5
  });
  
  console.log('Business Owner accounts found:', businessOwners.length);
  console.log('');
  
  for (const ur of businessOwners) {
    console.log(`  Email: ${ur.user.email}`);
    console.log(`  Name:  ${ur.user.firstName} ${ur.user.lastName}`);
    console.log(`  Client: ${ur.client?.name || 'N/A'} (ID: ${ur.client?.id || 'N/A'})`);
    
    if (ur.client?.id) {
      const reportCount = await prisma.report.count({ where: { clientId: ur.client.id } });
      console.log(`  Reports: ${reportCount}`);
    }
    console.log('');
  }
  
  await prisma.$disconnect();
})();
