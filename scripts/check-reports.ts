import {prisma} from '../src/db/prisma.js';

const reports = await prisma.report.findMany({
  where: { deletedAt: null },
  take: 5
});

console.log('Available reports:');
reports.forEach(r => {
  console.log(`  ID: ${r.id}, Name: ${r.name}, ClientID: ${r.clientId}`);
});

await prisma.$disconnect();
