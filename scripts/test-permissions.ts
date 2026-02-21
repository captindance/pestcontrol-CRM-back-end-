import { prisma } from '../src/db/prisma.js';
import { getUserPermissions } from '../src/services/permissionService.js';

async function testPermissionService() {
  console.log('🔍 Testing Permission Service...\n');

  const userRoles = await prisma.userRole.findMany({
    include: {
      user: { select: { email: true } },
      client: { select: { name: true } },
    },
  });

  for (const userRole of userRoles) {
    const permissions = await getUserPermissions(userRole.userId, userRole.clientId!);
    
    console.log(`👤 ${userRole.user.email} (${userRole.role}) @ ${userRole.client?.name || 'N/A'}`);
    console.log(`   canScheduleReports: ${permissions?.canScheduleReports}`);
    console.log(`   canViewReports: ${permissions?.canViewReports}`);
    console.log(`   canCreateReports: ${permissions?.canCreateReports}`);
    console.log('');
  }

  console.log('✅ Permission service test complete!');
}

testPermissionService()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
