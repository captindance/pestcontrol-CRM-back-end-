import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to multi-client support...');

  // Get all users with clientId
  const users = await prisma.user.findMany({
    where: {
      clientId: { not: null }
    }
  });

  let ownerCount = 0;
  let delegateCount = 0;
  let viewerCount = 0;

  for (const user of users) {
    if (!user.clientId) continue;

    try {
      if (user.role === UserRole.owner) {
        // Create OwnerClient entry
        await prisma.ownerClient.upsert({
          where: {
            userId_clientId: {
              userId: user.id,
              clientId: user.clientId
            }
          },
          update: {},
          create: {
            userId: user.id,
            clientId: user.clientId
          }
        });
        ownerCount++;
      } else if (user.role === UserRole.delegate) {
        // Create DelegateClient entry
        await prisma.delegateClient.upsert({
          where: {
            userId_clientId: {
              userId: user.id,
              clientId: user.clientId
            }
          },
          update: {},
          create: {
            userId: user.id,
            clientId: user.clientId
          }
        });
        delegateCount++;
      } else if (user.role === UserRole.viewer) {
        // Create ViewerClient entry
        await prisma.viewerClient.upsert({
          where: {
            userId_clientId: {
              userId: user.id,
              clientId: user.clientId
            }
          },
          update: {},
          create: {
            userId: user.id,
            clientId: user.clientId
          }
        });
        viewerCount++;
      }
    } catch (e: any) {
      console.error(`Error migrating user ${user.id}:`, e?.message);
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`- Created ${ownerCount} owner relationships`);
  console.log(`- Created ${delegateCount} delegate relationships`);
  console.log(`- Created ${viewerCount} viewer relationships`);
  console.log(`- Total: ${ownerCount + delegateCount + viewerCount} relationships`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
