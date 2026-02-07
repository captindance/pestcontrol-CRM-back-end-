import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import reportRoutes from '../routes/reportRoutes.js';
import clientRoutes from '../routes/clientRoutes.js';
import adminRoutes from '../routes/adminRoutes.js';
import authRoutes from '../routes/authRoutes.js';
import managerRoutes from '../routes/managerRoutes.js';
import connectionRoutes from '../routes/connectionRoutes.js';
import connectionPermissionRoutes from '../routes/connectionPermissionRoutes.js';
import { Application } from 'express';

export function setupRoutes(app: Application) {
  // Admin routes (no tenant restriction, platform_admin can manage all clients)
  app.use('/api/admin', authMiddleware, adminRoutes);

  // Auth routes
  app.use('/api/auth', authRoutes);

  // Manager routes (auth only; no tenant middleware)
  app.use('/api/manager', authMiddleware, managerRoutes);

  // Auth + Tenant enforcement for protected tenant routes
  app.use('/api', authMiddleware, tenantMiddleware);

  app.use('/api/reports', reportRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/connections', connectionRoutes);
  app.use('/api/connection-permissions', connectionPermissionRoutes);
}