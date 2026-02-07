import { prisma } from './prisma.js';

/**
 * Get all client IDs for a user based on their role and permissions
 */
export async function getUserClientIds(userId: number): Promise<number[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { clientId: true }
  });

  // Filter out null clientIds (platform roles) and deduplicate
  const clientIds = userRoles.map(ur => ur.clientId).filter((id): id is number => id !== null);
  return [...new Set(clientIds)];
}

/**
 * Get user's primary client ID for backward compatibility
 * Returns first business_owner client, then delegate, then viewer, then manager (by priority)
 */
export async function getUserPrimaryClientId(userId: number): Promise<number | null> {
  // Check business_owner first (highest priority)
  const businessOwner = await prisma.userRole.findFirst({
    where: { userId, role: 'business_owner' },
    select: { clientId: true }
  });

  if (businessOwner) return businessOwner.clientId;

  // Then delegate
  const delegate = await prisma.userRole.findFirst({
    where: { userId, role: 'delegate' },
    select: { clientId: true }
  });

  if (delegate) return delegate.clientId;

  // Then viewer
  const viewer = await prisma.userRole.findFirst({
    where: { userId, role: 'viewer' },
    select: { clientId: true }
  });

  if (viewer) return viewer.clientId;

  // Finally manager (with managerActive = true)
  const manager = await prisma.userRole.findFirst({
    where: { userId, role: 'manager', managerActive: true },
    select: { clientId: true }
  });

  if (manager) return manager.clientId;

  return null;
}

/**
 * Check if user has access to a specific client
 */
export async function userHasClientAccess(userId: number, clientId: number): Promise<boolean> {
  const clientIds = await getUserClientIds(userId);
  return clientIds.includes(clientId);
}

/**
 * Get user's role for a specific client
 */
export async function getUserRoleForClient(userId: number, clientId: number): Promise<'business_owner' | 'delegate' | 'viewer' | 'manager' | 'platform_admin' | null> {
  const userRole = await prisma.userRole.findFirst({
    where: { userId, clientId }
  });
  
  if (!userRole) return null;
  
  // If manager role but not active, return null
  if (userRole.role === 'manager' && !userRole.managerActive) return null;
  
  return userRole.role;
}
