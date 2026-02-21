import { prisma } from '../src/db/prisma.js';

async function verifyChanges() {
  console.log('🔍 Verifying schema changes...\n');

  // Check schedules with audit fields
  const schedule = await prisma.reportSchedule.findFirst({
    include: {
      creator: {
        select: { email: true, firstName: true, lastName: true },
      },
      modifier: {
        select: { email: true, firstName: true, lastName: true },
      },
      recipients: {
        select: {
          email: true,
          domain: true,
          isExternal: true,
        },
      },
    },
  });

  if (schedule) {
    console.log('📋 Sample Schedule:');
    console.log(`  ID: ${schedule.id}`);
    console.log(`  Name: ${schedule.name}`);
    console.log(`  Created By: ${schedule.creator.email} (ID: ${schedule.createdBy})`);
    console.log(`  Last Modified By: ${schedule.modifier ? schedule.modifier.email : 'N/A'}`);
    console.log(`  Last Modified At: ${schedule.lastModifiedAt || 'N/A'}`);
    console.log(`  Recipients:`);
    
    for (const recipient of schedule.recipients) {
      console.log(`    - ${recipient.email}`);
      console.log(`      Domain: ${recipient.domain}`);
      console.log(`      External: ${recipient.isExternal}`);
    }
  }

  console.log('\n📊 Statistics:');
  const totalSchedules = await prisma.reportSchedule.count();
  const totalRecipients = await prisma.reportScheduleRecipient.count();
  const externalRecipients = await prisma.reportScheduleRecipient.count({
    where: { isExternal: true },
  });

  console.log(`  Total Schedules: ${totalSchedules}`);
  console.log(`  Total Recipients: ${totalRecipients}`);
  console.log(`  External Recipients: ${externalRecipients}`);
  console.log(`  Internal Recipients: ${totalRecipients - externalRecipients}`);

  // Check UserRole permissions
  console.log('\n🔐 Checking UserRole permissions...');
  const userRoles = await prisma.userRole.findMany({
    select: {
      id: true,
      role: true,
      canScheduleReports: true,
      user: {
        select: { email: true },
      },
    },
  });

  for (const userRole of userRoles) {
    console.log(`  ${userRole.user.email} (${userRole.role}): canScheduleReports = ${userRole.canScheduleReports ?? 'null (uses default)'}`);
  }

  console.log('\n✅ Verification complete!');
}

verifyChanges()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
