import { prisma } from '../db/prisma.js';
import { Role } from '@prisma/client';

// Role default permissions
const roleDefaults = {
  platform_admin: {
    canViewReports: true,
    canCreateReports: true,
    canEditReports: true,
    canDeleteReports: true,
    canManageConnections: true,
    canInviteUsers: true,
    canManageUsers: true,
  },
  business_owner: {
    canViewReports: true,
    canCreateReports: true,
    canEditReports: true,
    canDeleteReports: true,
    canManageConnections: true,
    canInviteUsers: true,
    canManageUsers: true,
  },
  delegate: {
    canViewReports: true,
    canCreateReports: true,
    canEditReports: true,
    canDeleteReports: true,
    canManageConnections: true,
    canInviteUsers: false,  // Delegates cannot invite by default
    canManageUsers: false,
  },
  viewer: {
    canViewReports: true,
    canCreateReports: false,
    canEditReports: false,
    canDeleteReports: false,
    canManageConnections: false,
    canInviteUsers: false,
    canManageUsers: false,
  },
  manager: {
    canViewReports: true,
    canCreateReports: true,
    canEditReports: true,
    canDeleteReports: true,
    canManageConnections: true,
    canInviteUsers: false,
    canManageUsers: false,
  },
};

export type Permission = 
  | 'canViewReports'
  | 'canCreateReports'
  | 'canEditReports'
  | 'canDeleteReports'
  | 'canManageConnections'
  | 'canInviteUsers'
  | 'canManageUsers';

/**
 * Check if user has a specific permission for a client
 * Checks explicit permission first, falls back to role defaults
 */
export async function userHasPermission(
  userId: number,
  clientId: number,
  permission: Permission
): Promise<boolean> {
  const userRole = await prisma.userRole.findFirst({
    where: { userId, clientId },
  });

  if (!userRole) return false;

  // Check explicit permission override first
  const explicitPermission = userRole[permission];
  if (explicitPermission !== null && explicitPermission !== undefined) {
    return explicitPermission;
  }

  // Fall back to role defaults
  const defaults = roleDefaults[userRole.role as Role];
  return defaults ? defaults[permission] : false;
}

/**
 * Get all effective permissions for a user's role with a client
 */
export async function getUserPermissions(userId: number, clientId: number) {
  const userRole = await prisma.userRole.findFirst({
    where: { userId, clientId },
  });

  if (!userRole) return null;

  const defaults = roleDefaults[userRole.role as Role] || {} as any;
  
  return {
    canViewReports: userRole.canViewReports ?? defaults.canViewReports ?? false,
    canCreateReports: userRole.canCreateReports ?? defaults.canCreateReports ?? false,
    canEditReports: userRole.canEditReports ?? defaults.canEditReports ?? false,
    canDeleteReports: userRole.canDeleteReports ?? defaults.canDeleteReports ?? false,
    canManageConnections: userRole.canManageConnections ?? defaults.canManageConnections ?? false,
    canInviteUsers: userRole.canInviteUsers ?? defaults.canInviteUsers ?? false,
    canManageUsers: userRole.canManageUsers ?? defaults.canManageUsers ?? false,
  };
}

/**
 * Check if user can access a specific database connection
 */
export async function userCanAccessConnection(
  userId: number,
  connectionId: number,
  action: 'view' | 'edit'
): Promise<boolean> {
  // Get user's role for this connection's client
  const connection = await prisma.databaseConnection.findUnique({
    where: { id: connectionId },
    select: { clientId: true },
  });

  if (!connection) return false;

  // Check if user is platform_admin (global access)
  const platformAdminRole = await prisma.userRole.findFirst({
    where: { userId, role: 'platform_admin' },
  });
  
  if (platformAdminRole) {
    return true; // Platform admins can access all connections
  }

  const userRole = await prisma.userRole.findFirst({
    where: { userId, clientId: connection.clientId },
  });

  if (!userRole) return false;

  // Check if there's a specific connection permission
  const connPermission = await prisma.connectionPermission.findFirst({
    where: { userRoleId: userRole.id, connectionId },
  });

  if (connPermission) {
    return action === 'view' ? connPermission.canView : connPermission.canEdit;
  }

  // Fall back to general connection management permission
  const hasManagePermission = await userHasPermission(userId, connection.clientId, 'canManageConnections');
  return action === 'view' ? true : hasManagePermission; // Everyone with client access can view, only managers can edit
}
