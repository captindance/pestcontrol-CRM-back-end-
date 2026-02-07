import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.databaseConnection.deleteMany({
    where: {
      OR: [
        { dataIv: '' },
        { dataTag: '' },
        { dataCipher: '' }
      ]
    }
  });
  console.log(`Deleted ${result.count} invalid connections`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
