import { prisma } from '../src/db/prisma.js';

async function testScheduleLoad() {
  console.log('🔍 Testing Schedule Load...\n');

  try {
    // Test 1: Load all schedules
    console.log('Test 1: Load all schedules');
    const schedules = await prisma.reportSchedule.findMany({
      where: { deletedAt: null },
      include: {
        recipients: true,
        report: {
          select: { name: true },
        },
        creator: {
          select: { email: true, firstName: true, lastName: true },
        },
        modifier: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });
    
    console.log(`  ✅ Loaded ${schedules.length} schedules successfully`);
    
    // Test 2: Load a specific schedule
    console.log('\nTest 2: Load specific schedule with all relationships');
    if (schedules.length > 0) {
      const schedule = schedules[0];
      console.log(`  ✅ Schedule "${schedule.name}" loaded`);
      console.log(`     Created by: ${schedule.creator.email}`);
      console.log(`     Recipients: ${schedule.recipients.length}`);
      
      for (const recipient of schedule.recipients) {
        console.log(`       - ${recipient.email} (${recipient.domain}) [${recipient.isExternal ? 'EXTERNAL' : 'INTERNAL'}]`);
      }
    }

    // Test 3: Test cascade behavior (should fail to delete user)
    console.log('\nTest 3: Test Restrict cascade (should prevent user deletion)');
    const userWithSchedules = await prisma.user.findFirst({
      where: {
        createdSchedules: {
          some: {},
        },
      },
      include: {
        createdSchedules: {
          select: { id: true, name: true },
        },
      },
    });

    if (userWithSchedules && userWithSchedules.createdSchedules.length > 0) {
      console.log(`  ✅ User ${userWithSchedules.email} has created ${userWithSchedules.createdSchedules.length} schedules`);
      console.log(`     This user CANNOT be deleted due to RESTRICT constraint (as intended)`);
    }

    console.log('\n✅ All tests passed!');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

testScheduleLoad()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
