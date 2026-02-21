import { prisma } from '../src/db/prisma.js';

async function backfillScheduleAuditFields() {
  console.log('🔄 Starting backfill of schedule audit fields...\n');

  // 1. Extract domain from existing recipients
  console.log('Step 1: Extracting domains from recipient emails...');
  const recipients = await prisma.reportScheduleRecipient.findMany({
    where: {
      domain: null,
    },
  });
  
  console.log(`  Found ${recipients.length} recipients without domain`);
  
  for (const recipient of recipients) {
    const domain = recipient.email.split('@')[1];
    await prisma.reportScheduleRecipient.update({
      where: { id: recipient.id },
      data: { domain },
    });
  }
  
  console.log(`  ✅ Updated ${recipients.length} recipient domains\n`);

  // 2. Detect isExternal by comparing against client allowed domains
  console.log('Step 2: Detecting external recipients...');
  const allRecipients = await prisma.reportScheduleRecipient.findMany({
    include: {
      schedule: {
        include: {
          client: {
            select: {
              id: true,
              allowedEmailDomains: true,
            },
          },
        },
      },
    },
  });

  let externalCount = 0;
  for (const recipient of allRecipients) {
    const allowedDomains = recipient.schedule.client.allowedEmailDomains;
    let isExternal = false;

    if (allowedDomains) {
      try {
        const domainsArray = JSON.parse(allowedDomains);
        if (Array.isArray(domainsArray) && recipient.domain) {
          isExternal = !domainsArray.includes(recipient.domain.toLowerCase());
        }
      } catch (e) {
        console.log(`  ⚠️  Could not parse allowed domains for client ${recipient.schedule.client.id}`);
      }
    } else {
      // No allowed domains set - mark all as external for safety
      isExternal = true;
    }

    if (isExternal !== recipient.isExternal) {
      await prisma.reportScheduleRecipient.update({
        where: { id: recipient.id },
        data: { isExternal },
      });
      if (isExternal) externalCount++;
    }
  }

  console.log(`  ✅ Marked ${externalCount} recipients as external\n`);

  // 3. Verify createdBy and lastModifiedAt were populated by migration
  console.log('Step 3: Verifying audit fields...');
  
  const totalSchedules = await prisma.reportSchedule.count();
  const schedulesWithCreator = await prisma.reportSchedule.count({
    where: { 
      createdBy: { not: undefined }
    },
  });

  if (schedulesWithCreator < totalSchedules) {
    console.log(`  ⚠️  Found ${totalSchedules - schedulesWithCreator} schedules without createdBy - this should not happen!`);
  } else {
    console.log(`  ✅ All schedules have createdBy field populated`);
  }

  console.log(`  📊 Total schedules: ${totalSchedules}\n`);

  console.log('✅ Backfill complete!');
}

backfillScheduleAuditFields()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
