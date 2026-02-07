const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeSchema() {
  try {
    console.log('\n========== DATABASE SCHEMA ANALYSIS ==========\n');
    
    // Check users
    const users = await prisma.user.findMany();
    console.log(`Total Users: ${users.length}`);
    if (users.length > 0) {
      console.log('Sample users:', users.slice(0, 3).map(u => ({ id: u.id, email: u.email })));
    }
    
    // Check clients
    const clients = await prisma.client.findMany();
    console.log(`\nTotal Clients: ${clients.length}`);
    if (clients.length > 0) {
      console.log('Sample clients:', clients.slice(0, 3).map(c => ({ id: c.id, name: c.name })));
    }
    
    // Check user_roles table structure
    console.log('\n========== USER ROLES TABLE ==========');
    const userRoles = await prisma.userRole.findMany({
      include: {
        user: { select: { email: true } },
        client: { select: { name: true } }
      }
    });
    console.log(`Total UserRoles: ${userRoles.length}`);
    
    if (userRoles.length > 0) {
      console.log('\nSample UserRoles:');
      userRoles.slice(0, 5).forEach(ur => {
        console.log(`  - UserRole ID ${ur.id}:`);
        console.log(`    User: ${ur.user.email} (ID: ${ur.userId})`);
        console.log(`    Client: ${ur.client?.name || 'NULL'} (ID: ${ur.clientId || 'NULL'})`);
        console.log(`    Role: ${ur.role}`);
        console.log(`    Manager Active: ${ur.managerActive}`);
        console.log(`    Permissions:`);
        console.log(`      canViewReports: ${ur.canViewReports}`);
        console.log(`      canCreateReports: ${ur.canCreateReports}`);
        console.log(`      canManageUsers: ${ur.canManageUsers}`);
      });
    }
    
    // Check for role distribution
    console.log('\n========== ROLE DISTRIBUTION ==========');
    const roleStats = await prisma.$queryRaw`
      SELECT role, COUNT(*) as count 
      FROM user_roles 
      GROUP BY role
    `;
    console.log('Roles:', roleStats);
    
    // Check foreign key relationships
    console.log('\n========== FOREIGN KEY CONSTRAINTS ==========');
    const constraints = await prisma.$queryRaw`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_NAME IN ('user_roles', 'connection_permissions', 'user_role_audit_log')
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
    console.log('Foreign Keys:', JSON.stringify(constraints, null, 2));
    
    // Check indexes
    console.log('\n========== INDEXES ON user_roles ==========');
    const indexes = await prisma.$queryRaw`
      SHOW INDEX FROM user_roles
    `;
    console.log('Indexes:', indexes.map(i => ({
      key: i.Key_name,
      column: i.Column_name,
      unique: i.Non_unique === 0
    })));
    
  } catch (error) {
    console.error('Analysis error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeSchema();
