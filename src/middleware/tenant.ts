import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { userHasClientAccess } from '../db/clientAccess.js';

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Managers and platform_admin can set `x-tenant-id` header; others must have tenantId from token
  const roles = req.user?.roles || [];
  if (roles.includes('platform_admin')) {
    // Platform admins don't require a tenant context for all routes
    // If they provide x-tenant-id, use it; otherwise proceed without tenant context
    return next();
  }
  if (roles.includes('manager')) {
    if (!req.tenantId) return res.status(400).json({ error: 'Client context missing for elevated role; provide x-tenant-id' });
    // Check email verified
    const userId = parseInt(req.user!.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.emailVerified) return res.status(403).json({ error: 'Email not verified. Please verify your email first.' });
    try {
      const tenantId = parseInt(req.tenantId);
      const assigned = await prisma.userRole.findFirst({
        where: {
          userId,
          clientId: tenantId,
          role: 'manager',
          managerActive: true
        }
      });
      if (!assigned) return res.status(403).json({ error: 'Forbidden: manager not assigned to this client' });
      return next();
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Tenant check failed' });
    }
  }

  // For business_owner/delegate/viewer roles, verify they have access to the requested client
  if (!req.tenantId) return res.status(400).json({ error: 'Client context missing' });
  
  try {
    const userId = parseInt(req.user!.userId);
    const tenantId = parseInt(req.tenantId);
    const hasAccess = await userHasClientAccess(userId, tenantId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden: you do not have access to this client' });
    }
    next();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Tenant check failed' });
  }
};
