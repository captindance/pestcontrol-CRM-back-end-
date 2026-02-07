import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script - No longer needed!
 * 
 * The first user to sign up automatically becomes the platform_admin.
 * No dummy data is seeded anymore.
 * 
 * This file is kept for reference but does nothing when run.
 */

async function main() {
  console.log('Seed script disabled - first signup will create platform_admin automatically');
  console.log('No dummy data will be created');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
