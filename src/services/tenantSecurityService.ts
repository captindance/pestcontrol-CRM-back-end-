import { Request } from 'express';
import { prisma } from '../db/prisma.js';
import { userHasClientAccess } from '../db/clientAccess.js';

/**
 * SECURITY-CRITICAL: Tenant validation service
 * 
 * This service ensures proper tenant isolation by:
 * 1. Never trusting client-supplied tenant IDs from headers
 * 2. Always validating tenant access from database
 * 3. Enforcing role-based tenant access rules
 */

export interface TenantValidationResult {
  isValid: boolean;
  tenantId: number | null;
  error?: string;
}

/**
 * Get and validate tenant ID from authenticated request
 * NEVER trusts x-tenant-id header except for platform_admin
 * 
 * @param req - Express request with authenticated user
 * @param requiredTenantId - Optional: specific tenant ID to validate access for
 * @returns Validated tenant ID or null if invalid
 */
export async function getValidatedTenantId(
  req: Request,
  requiredTenantId?: number
): Promise<TenantValidationResult> {
  if (!req.user) {
    return {
      isValid: false,
      tenantId: null,
      error: 'User not authenticated'
    };
  }

  const userId = parseInt(req.user.userId);
  const roles = req.user.roles || [];

  // Platform admins can operate without tenant context or with x-tenant-id
  if (roles.includes('platform_admin')) {
    if (requiredTenantId) {
      // Validate the specific tenant exists
      const tenant = await prisma.client.findUnique({
        where: { id: requiredTenantId }
      });
      
      if (!tenant) {
        return {
          isValid: false,
          tenantId: null,
          error: 'Tenant not found'
        };
      }
      
      return {
        isValid: true,
        tenantId: requiredTenantId
      };
    }
    
    // Platform admin without specific tenant - allow
    return {
      isValid: true,
      tenantId: null
    };
  }

  // For all other users, get tenant from JWT token (NEVER from header)
  const tokenTenantId = req.user.tenantId ? parseInt(req.user.tenantId) : null;
  
  if (!tokenTenantId) {
    return {
      isValid: false,
      tenantId: null,
      error: 'No tenant context in token'
    };
  }

  // If a specific tenant is required, validate it matches and user has access
  const targetTenantId = requiredTenantId || tokenTenantId;
  
  // Verify user has access to this tenant from database
  const hasAccess = await userHasClientAccess(userId, targetTenantId);
  
  if (!hasAccess) {
    return {
      isValid: false,
      tenantId: null,
      error: 'Access denied to tenant'
    };
  }

  return {
    isValid: true,
    tenantId: targetTenantId
  };
}

/**
 * Validate manager has access to specific tenant
 * Managers can access multiple tenants, so we validate from x-tenant-id
 * but ALWAYS verify against database
 */
export async function validateManagerTenantAccess(
  req: Request,
  requestedTenantId: number
): Promise<TenantValidationResult> {
  if (!req.user) {
    return {
      isValid: false,
      tenantId: null,
      error: 'User not authenticated'
    };
  }

  const userId = parseInt(req.user.userId);
  const roles = req.user.roles || [];

  if (!roles.includes('manager')) {
    return {
      isValid: false,
      tenantId: null,
      error: 'Not a manager'
    };
  }

  // Verify email is verified
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true }
  });

  if (!user?.emailVerified) {
    return {
      isValid: false,
      tenantId: null,
      error: 'Email not verified'
    };
  }

  // Verify manager is assigned to this specific tenant AND is active
  const managerAssignment = await prisma.userRole.findFirst({
    where: {
      userId,
      clientId: requestedTenantId,
      role: 'manager',
      managerActive: true
    }
  });

  if (!managerAssignment) {
    return {
      isValid: false,
      tenantId: null,
      error: 'Manager not assigned to this tenant'
    };
  }

  return {
    isValid: true,
    tenantId: requestedTenantId
  };
}

/**
 * Extract tenant ID from request headers for manager/admin roles
 * Returns null if header is missing or invalid
 */
export function extractTenantIdFromHeader(req: Request): number | null {
  const headerValue = req.headers['x-tenant-id'];
  
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const tenantId = parseInt(headerValue.trim());
  
  if (isNaN(tenantId) || tenantId <= 0) {
    return null;
  }

  return tenantId;
}

/**
 * Validate that user can only access their own tenant data
 * Throws error with 404 (not 403) to prevent information leakage
 */
export async function enforceUserTenantIsolation(
  userId: number,
  requestedTenantId: number
): Promise<void> {
  const hasAccess = await userHasClientAccess(userId, requestedTenantId);
  
  if (!hasAccess) {
    // Use 404 instead of 403 to prevent tenant enumeration
    throw new Error('TENANT_ACCESS_DENIED');
  }
}

/**
 * Get user's accessible tenant IDs for listing operations
 */
export async function getUserAccessibleTenants(userId: number, roles: string[]): Promise<number[]> {
  // Platform admins can access all tenants
  if (roles.includes('platform_admin')) {
    const allClients = await prisma.client.findMany({
      select: { id: true }
    });
    return allClients.map(c => c.id);
  }

  // All other users: get from user_roles
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      OR: [
        { role: 'business_owner' },
        { role: 'delegate' },
        { role: 'viewer' },
        { role: 'manager', managerActive: true }
      ]
    },
    select: { clientId: true }
  });

  return userRoles
    .map(ur => ur.clientId)
    .filter((id): id is number => id !== null);
}
