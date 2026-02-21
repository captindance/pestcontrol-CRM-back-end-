import { prisma } from '../src/db/prisma.js';
import { calculateNextRunTime } from '../src/services/scheduleService.js';

async function fixNextRunAt() {
  console.log('🔄 Fixing stale nextRunAt values (old code used setHours instead of setUTCHours)...\n');

  const schedules = await prisma.reportSchedule.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      frequency: true,
      timeOfDay: true,
      timezone: true,
      dayOfWeek: true,
      dayOfMonth: true,
      nextRunAt: true,
    },
  });

  console.log(`Found ${schedules.length} active schedules to fix.\n`);

  const now = new Date();
  let updatedCount = 0;

  for (const schedule of schedules) {
    const newNextRunAt = calculateNextRunTime(
      schedule.frequency,
      schedule.timeOfDay,
      schedule.timezone,
      schedule.dayOfWeek,
      schedule.dayOfMonth,
      now
    );

    const oldStr = schedule.nextRunAt ? schedule.nextRunAt.toISOString() : 'null';
    const newStr = newNextRunAt.toISOString();

    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: newNextRunAt },
    });

    console.log(`  ✅ "${schedule.name}" (${schedule.frequency} @ ${schedule.timeOfDay})`);
    console.log(`     OLD: ${oldStr}`);
    console.log(`     NEW: ${newStr}`);
    updatedCount++;
  }

  console.log(`\n✅ Done! Updated ${updatedCount} schedule(s).`);
}

fixNextRunAt()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
