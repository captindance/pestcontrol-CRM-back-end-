// Check audit logs in database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAuditLogs() {
  try {
    console.log('=== Checking Audit Logs ===\n');
    
    // Count schedule-related logs
    const count = await prisma.auditLog.count({
      where: {
        action: {
          startsWith: 'SCHEDULE'
        }
      }
    });
    
    console.log(`Total schedule-related audit logs: ${count}\n`);
    
    // Get recent logs
    const logs = await prisma.auditLog.findMany({
      where: {
        action: {
          startsWith: 'SCHEDULE'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });
    
    console.log('Recent schedule audit logs:');
    logs.forEach((log, i) => {
      console.log(`\n${i + 1}. ${log.action}`);
      console.log(`   User ID: ${log.userId}`);
      console.log(`   Tenant ID: ${log.tenantId}`);
      console.log(`   Resource ID: ${log.resourceId}`);
      console.log(`   Created: ${log.createdAt}`);
      if (log.details) {
        console.log(`   Details: ${JSON.stringify(log.details)}`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAuditLogs();
