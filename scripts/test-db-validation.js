import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const reports = await prisma.report.findMany({ 
      where: { id: { in: [1, 2] } },
      select: { id: true, name: true, chartImageData: true, chartImageError: true }
    });
    
    console.log('\nStored Chart Images:');
    reports.forEach(r => {
      const size = r.chartImageData ? (r.chartImageData.length / 1024).toFixed(2) : 0;
      const status = r.chartImageData ? 'OK' : (r.chartImageError || 'NO DATA');
      console.log(`  Report ${r.id}: ${size}KB - ${status}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

test();
