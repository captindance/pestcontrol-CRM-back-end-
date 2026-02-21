const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Check schedule
  const schedules = await prisma.reportSchedule.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      reportId: true,
      clientId: true,
      userId: true,
      frequency: true,
      recipients: true,
      isEnabled: true,
      createdAt: true
    }
  });
  
  console.log('Recent schedules:');
  schedules.forEach(s => {
    console.log(`  Schedule ${s.id}: reportId=${s.reportId}, clientId=${s.clientId}, userId=${s.userId}`);
  });
  
  // Check user and their clientId
  const user = await prisma.user.findUnique({
    where: { email: 'captaindanceman@gmail.com' },
    select: { id: true, email: true, tenantId: true }
  });
  
  console.log('\nUser:');
  console.log(`  ${user.email}: userId=${user.id}, tenantId=${user.tenantId}`);
  
  // Check report
  const report = await prisma.report.findUnique({
    where: { id: schedules[0]?.reportId || 1 },
    select: { id: true, name: true, clientId: true }
  });
  
  console.log('\nReport:');
  console.log(`  Report ${report.id}: ${report.name}, clientId=${report.clientId}`);
  
  await prisma.$disconnect();
})();
