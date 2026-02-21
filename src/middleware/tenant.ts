import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { userHasClientAccess } from '../db/clientAccess.js';
import { 
  extractTenantIdFromHeader,
  validateManagerTenantAccess,
  getValidatedTenantId,
  enforceUserTenantIsolation
} from '../services/tenantSecurityService.js';
import { 
  logTenantAccessViolation,
  logSecurityEvent,
  AuditAction,
  AuditSeverity
} from '../services/auditLogService.js';

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const roles = req.user?.roles || [];
  const userId = parseInt(req.user!.userId);

  try {
    // PLATFORM ADMIN: Can operate without tenant or with x-tenant-id
    if (roles.includes('platform_admin')) {
      const headerTenantId = extractTenantIdFromHeader(req);
      
      if (headerTenantId) {
        // Validate tenant exists
        const tenant = await prisma.client.findUnique({
          where: { id: headerTenantId }
        });
        
        if (!tenant) {
          await logTenantAccessViolation(req, headerTenantId, 'Tenant does not exist');
          return res.status(404).json({ error: 'Not found' });
        }
        
        req.tenantId = headerTenantId.toString();
        
        await logSecurityEvent(req, AuditAction.TENANT_ACCESS_GRANTED, AuditSeverity.INFO, {
          tenantId: headerTenantId,
          role: 'platform_admin'
        });
      }
      
      return next();
    }

    // MANAGER: Can access multiple tenants, validate from x-tenant-id
    if (roles.includes('manager')) {
      const headerTenantId = extractTenantIdFromHeader(req);
      
      if (!headerTenantId) {
        return res.status(400).json({ error: 'Client context missing for elevated role; provide x-tenant-id' });
      }

      // Securely validate manager has access to this specific tenant
      const validation = await validateManagerTenantAccess(req, headerTenantId);
      
      if (!validation.isValid) {
        await logTenantAccessViolation(req, headerTenantId, validation.error || 'Manager access denied');
        return res.status(404).json({ error: 'Not found' });
      }

      req.tenantId = headerTenantId.toString();
      
      await logSecurityEvent(req, AuditAction.TENANT_ACCESS_GRANTED, AuditSeverity.INFO, {
        tenantId: headerTenantId,
        role: 'manager'
      });
      
      return next();
    }

    // BUSINESS OWNER / DELEGATE / VIEWER: Tenant from JWT token only
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Client context missing' });
    }

    const tenantId = parseInt(req.tenantId);
    
    // Enforce tenant isolation from database
    try {
      await enforceUserTenantIsolation(userId, tenantId);
    } catch (error: any) {
      if (error.message === 'TENANT_ACCESS_DENIED') {
        await logTenantAccessViolation(req, tenantId, 'User does not have access to tenant');
        // Return 404 instead of 403 to prevent tenant enumeration
        return res.status(404).json({ error: 'Not found' });
      }
      throw error;
    }

    await logSecurityEvent(req, AuditAction.TENANT_ACCESS_GRANTED, AuditSeverity.INFO, {
      tenantId,
      role: roles[0]
    });

    next();
  } catch (e: any) {
    console.error('[TENANT MIDDLEWARE ERROR]', e);
    return res.status(500).json({ error: 'Tenant validation failed' });
  }
};
