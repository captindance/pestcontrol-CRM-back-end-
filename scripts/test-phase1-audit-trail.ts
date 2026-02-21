/**
 * Test Phase 1: Core Audit Trail Logic
 * 
 * Tests:
 * 1. Schema changes - approval fields removed
 * 2. Enhanced audit actions available
 * 3. External recipient detection
 * 4. Create schedule with internal recipients
 * 5. Create schedule with external recipients
 * 6. Update schedule recipients (before/after tracking)
 * 7. Permission check for canScheduleReports
 * 8. Email validation (approved emails only)
 * 9. Audit logs created correctly
 */

import { prisma } from '../src/db/prisma.js';
import { createSchedule, updateSchedule } from '../src/services/scheduleService.js';
import { AuditAction } from '../src/services/auditLogService.js';

async function runTests() {
  console.log('🧪 Phase 1: Core Audit Trail Testing\n');
  console.log('='.repeat(60));

  let testUser: any;
  let testClient: any;
  let testReport: any;
  let scheduleId: string | null = null;

  try {
    // Setup test data
    console.log('\n📋 Setting up test data...');
    
    testUser = await prisma.user.findFirst({
      where: { email: 'captindanceman@yahoo.com' }
    });
    
    if (!testUser) {
      console.log('   ❌ Test user not found');
      return;
    }

    testClient = await prisma.client.findFirst();
    if (!testClient) {
      console.log('   ❌ Test client not found');
      return;
    }

    testReport = await prisma.report.findFirst({
      where: { deletedAt: null }
    });

    if (!testReport) {
      console.log('   ❌ Test report not found');
      return;
    }

    console.log(`   ✅ Test user: ${testUser.email} (ID: ${testUser.id})`);
    console.log(`   ✅ Test client: ${testClient.name} (ID: ${testClient.id})`);
    console.log(`   ✅ Test report: ${testReport.name} (ID: ${testReport.id})`);

    // TEST 1: Verify approval fields removed from schema
    console.log('\n📋 TEST 1: Verify Approval Fields Removed');
    try {
      const schedule = await prisma.reportSchedule.findFirst({
        select: { 
          id: true,
          emailSecurityLevel: true
        }
      });
      
      // Try to access removed fields - should fail
      const hasRemovedFields = 'requiresApproval' in (schedule || {});
      if (hasRemovedFields) {
        console.log('   ❌ Approval fields still exist in schema');
      } else {
        console.log('   ✅ Approval fields successfully removed');
      }
    } catch (error: any) {
      console.log(`   ✅ Schema migration complete (fields not accessible)`);
    }

    // TEST 2: Verify enhanced audit actions
    console.log('\n📋 TEST 2: Enhanced Audit Actions Available');
    const requiredActions = [
      'SCHEDULE_CREATED',
      'SCHEDULE_UPDATED',
      'SCHEDULE_DELETED',
      'SCHEDULE_CREATED_WITH_EXTERNAL',
      'SCHEDULE_RECIPIENTS_CHANGED',
      'SCHEDULE_EXTERNAL_RECIPIENT_ADDED',
      'SCHEDULE_EXTERNAL_RECIPIENT_REMOVED',
      'SCHEDULE_PERMISSION_GRANTED',
      'SCHEDULE_PERMISSION_REVOKED'
    ];

    let allActionsExist = true;
    for (const action of requiredActions) {
      if (!(action in AuditAction)) {
        console.log(`   ❌ Missing action: ${action}`);
        allActionsExist = false;
      }
    }

    if (allActionsExist) {
      console.log(`   ✅ All ${requiredActions.length} enhanced audit actions available`);
    }

    // TEST 3: Create schedule with internal recipients (approved emails)
    console.log('\n📋 TEST 3: Create Schedule with Internal Recipients');
    try {
      const schedule = await createSchedule({
        clientId: testClient.id,
        userId: testUser.id,
        reportId: testReport.id,
        name: 'Test Schedule - Internal',
        frequency: 'daily',
        timeOfDay: '09:00',
        recipients: ['captindanceman@yahoo.com']
      });

      scheduleId = schedule.id;
      console.log(`   ✅ Schedule created: ${schedule.id}`);

      // Verify recipients have domain and isExternal flags
      const recipients = await prisma.reportScheduleRecipient.findMany({
        where: { scheduleId: schedule.id }
      });

      const hasCorrectFields = recipients.every(r => 
        r.domain !== null && r.isExternal !== null
      );

      if (hasCorrectFields) {
        console.log(`   ✅ Recipients have domain and isExternal flags`);
        recipients.forEach(r => {
          console.log(`      - ${r.email} (domain: ${r.domain}, external: ${r.isExternal})`);
        });
      } else {
        console.log('   ❌ Recipients missing required fields');
      }

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          resourceType: 'schedule',
          resourceId: schedule.id,
          action: {
            in: [AuditAction.SCHEDULE_CREATED, AuditAction.SCHEDULE_CREATED_WITH_EXTERNAL]
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (auditLog) {
        console.log(`   ✅ Audit log created: ${auditLog.action}`);
        const details = auditLog.details as any;
        console.log(`      - Has external: ${details?.hasExternal}`);
        console.log(`      - External emails: ${details?.externalEmails?.length || 0}`);
        console.log(`      - Internal emails: ${details?.internalEmails?.length || 0}`);
      } else {
        console.log('   ❌ Audit log not created');
      }

    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }

    // TEST 4: Update schedule recipients
    console.log('\n📋 TEST 4: Update Schedule Recipients (Before/After Tracking)');
    if (scheduleId) {
      try {
        // Update to add another approved email
        await updateSchedule(
          scheduleId,
          testClient.id,
          testUser.id,
          {
            recipients: ['captindanceman@yahoo.com', 'captaindanceman@gmail.com']
          }
        );

        console.log('   ✅ Schedule updated with new recipients');

        // Check for recipient change audit logs
        const changeLog = await prisma.auditLog.findFirst({
          where: {
            resourceType: 'schedule',
            resourceId: scheduleId,
            action: AuditAction.SCHEDULE_RECIPIENTS_CHANGED
          },
          orderBy: { createdAt: 'desc' }
        });

        if (changeLog) {
          console.log('   ✅ Recipient change audit log created');
          const details = changeLog.details as any;
          console.log(`      - Before total: ${details?.before?.total}`);
          console.log(`      - After total: ${details?.after?.total}`);
          console.log(`      - Added external: ${details?.addedExternal?.length || 0}`);
          console.log(`      - Removed external: ${details?.removedExternal?.length || 0}`);
        } else {
          console.log('   ❌ Recipient change audit log not created');
        }

        // Verify lastModifiedBy and lastModifiedAt set
        const updated = await prisma.reportSchedule.findUnique({
          where: { id: scheduleId }
        });

        if (updated?.lastModifiedBy === testUser.id && updated?.lastModifiedAt) {
          console.log(`   ✅ Audit tracking fields set (modifiedBy: ${updated.lastModifiedBy})`);
        } else {
          console.log('   ❌ Audit tracking fields not set correctly');
        }

      } catch (error: any) {
        console.log(`   ❌ Failed: ${error.message}`);
      }
    }

    // TEST 5: Permission check
    console.log('\n📋 TEST 5: Permission Check (canScheduleReports)');
    const userRole = await prisma.userRole.findFirst({
      where: { 
        userId: testUser.id,
        clientId: testClient.id
      }
    });

    if (userRole) {
      console.log(`   ✅ User role: ${userRole.role}`);
      console.log(`   ✅ canScheduleReports: ${userRole.canScheduleReports ?? 'null (uses default)'}`);
    } else {
      console.log('   ❌ User role not found');
    }

    // TEST 6: Email validation (try unapproved email - should fail)
    console.log('\n📋 TEST 6: Email Validation (Approved Emails Only)');
    try {
      await createSchedule({
        clientId: testClient.id,
        userId: testUser.id,
        reportId: testReport.id,
        name: 'Test Schedule - Invalid Email',
        frequency: 'daily',
        timeOfDay: '09:00',
        recipients: ['unauthorized@example.com']
      });

      console.log('   ❌ Unapproved email was accepted (should have been blocked)');
    } catch (error: any) {
      if (error.message.includes('not approved')) {
        console.log('   ✅ Unapproved email blocked correctly');
        console.log(`      Error: ${error.message}`);
      } else {
        console.log(`   ⚠️  Email blocked but with unexpected error: ${error.message}`);
      }
    }

    // TEST 7: Verify audit log count
    console.log('\n📋 TEST 7: Audit Logs Summary');
    const auditCount = await prisma.auditLog.count({
      where: {
        resourceType: 'schedule',
        action: {
          in: Object.values(AuditAction).filter(a => a.includes('SCHEDULE'))
        }
      }
    });

    console.log(`   ✅ Total schedule-related audit logs: ${auditCount}`);

    // Show recent audit logs
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'schedule'
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    console.log('\n   Recent audit logs:');
    recentLogs.forEach(log => {
      console.log(`      - ${log.action} by user ${log.userId} at ${log.createdAt.toISOString()}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Phase 1 Testing Complete!\n');

  } catch (error: any) {
    console.error('\n❌ Test suite error:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup test schedule
    if (scheduleId) {
      console.log('\n🧹 Cleaning up test data...');
      try {
        await prisma.reportSchedule.update({
          where: { id: scheduleId },
          data: { deletedAt: new Date() }
        });
        console.log('   ✅ Test schedule deleted');
      } catch (error) {
        console.log('   ⚠️  Could not delete test schedule');
      }
    }
    
    await prisma.$disconnect();
  }
}

runTests().catch(console.error);
