import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clear all client and user data while preserving email settings
 */

async function main() {
  console.log('Clearing database data...');
  
  // Delete in correct order to respect foreign key constraints
  await prisma.reportResult.deleteMany({});
  console.log('✓ Cleared report results');
  
  await prisma.report.deleteMany({});
  console.log('✓ Cleared reports');
  
  await prisma.databaseConnection.deleteMany({});
  console.log('✓ Cleared database connections');
  
  await prisma.managerClient.deleteMany({});
  console.log('✓ Cleared manager-client assignments');
  
  await prisma.ownerClient.deleteMany({});
  console.log('✓ Cleared owner-client relationships');
  
  await prisma.delegateClient.deleteMany({});
  console.log('✓ Cleared delegate-client relationships');
  
  await prisma.viewerClient.deleteMany({});
  console.log('✓ Cleared viewer-client relationships');
  
  await prisma.user.deleteMany({});
  console.log('✓ Cleared users');
  
  await prisma.client.deleteMany({});
  console.log('✓ Cleared clients');
  
  console.log('\n✅ Database cleared successfully!');
  console.log('Email settings (IntegrationSettings) preserved.');
  console.log('\nYou can now sign up as the first user to become platform_admin.');
}

main().catch(e => {
  console.error('Error clearing database:', e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
