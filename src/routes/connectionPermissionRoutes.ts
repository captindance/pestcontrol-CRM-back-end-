import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { userHasPermission } from '../services/permissionService.js';

const router = Router();

// Get all connection permissions for a client
router.get('/', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  const userId = parseInt(req.user!.userId);
  
  // Check if user has permission to manage users (required to view/manage permissions)
  const canManageUsers = await userHasPermission(userId, tenantId, 'canManageUsers');
  if (!canManageUsers && !req.user?.roles?.includes('platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to view connection permissions' });
  }
  
  try {
    // Get all connection permissions for this client
    const permissions = await prisma.connectionPermission.findMany({
      where: {
        userRole: {
          clientId: tenantId
        }
      },
      include: {
        userRole: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        connection: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    res.json(permissions.map(p => ({
      id: p.id,
      userId: p.userRole.userId,
      userEmail: p.userRole.user.email,
      userName: `${p.userRole.user.firstName || ''} ${p.userRole.user.lastName || ''}`.trim() || p.userRole.user.email,
      connectionId: p.connectionId,
      connectionName: p.connection.name,
      canView: p.canView,
      canEdit: p.canEdit,
      createdAt: p.createdAt
    })));
  } catch (e: any) {
    console.error('Get connection permissions error', e);
    res.status(500).json({ error: e?.message || 'Failed to get connection permissions' });
  }
});

// Get connection permissions for a specific user
router.get('/user/:userId', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  const targetUserId = parseInt(req.params.userId);
  const currentUserId = parseInt(req.user!.userId);
  
  // Check if user has permission to manage users or is viewing their own permissions
  const canManageUsers = await userHasPermission(currentUserId, tenantId, 'canManageUsers');
  if (!canManageUsers && currentUserId !== targetUserId && !req.user?.roles?.includes('platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to view connection permissions' });
  }
  
  try {
    // Get the userRole for this user and client
    const userRole = await prisma.userRole.findFirst({
      where: { userId: targetUserId, clientId: tenantId }
    });
    
    if (!userRole) {
      return res.status(404).json({ error: 'User not found in this client' });
    }
    
    // Get all connection permissions for this user
    const permissions = await prisma.connectionPermission.findMany({
      where: { userRoleId: userRole.id },
      include: {
        connection: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    res.json(permissions.map(p => ({
      id: p.id,
      connectionId: p.connectionId,
      connectionName: p.connection.name,
      canView: p.canView,
      canEdit: p.canEdit
    })));
  } catch (e: any) {
    console.error('Get user connection permissions error', e);
    res.status(500).json({ error: e?.message || 'Failed to get connection permissions' });
  }
});

// Grant or update connection permission for a user
router.post('/', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  const userId = parseInt(req.user!.userId);
  
  // Check if user has permission to manage users
  const canManageUsers = await userHasPermission(userId, tenantId, 'canManageUsers');
  if (!canManageUsers && !req.user?.roles?.includes('platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to manage connection permissions' });
  }
  
  const { targetUserId, connectionId, canView, canEdit } = req.body;
  
  if (!targetUserId || !connectionId) {
    return res.status(400).json({ error: 'targetUserId and connectionId are required' });
  }
  
  try {
    // Get the userRole for the target user and client
    const userRole = await prisma.userRole.findFirst({
      where: { userId: parseInt(targetUserId), clientId: tenantId }
    });
    
    if (!userRole) {
      return res.status(404).json({ error: 'Target user not found in this client' });
    }
    
    // Verify connection belongs to this client
    const connection = await prisma.databaseConnection.findFirst({
      where: { id: parseInt(connectionId), clientId: tenantId }
    });
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found in this client' });
    }
    
    // Check if permission already exists
    const existing = await prisma.connectionPermission.findFirst({
      where: {
        userRoleId: userRole.id,
        connectionId: parseInt(connectionId)
      }
    });
    
    if (existing) {
      // Update existing permission
      const updated = await prisma.connectionPermission.update({
        where: { id: existing.id },
        data: {
          canView: canView !== undefined ? canView : existing.canView,
          canEdit: canEdit !== undefined ? canEdit : existing.canEdit
        }
      });
      return res.json({ success: true, permission: updated });
    }
    
    // Create new permission
    const created = await prisma.connectionPermission.create({
      data: {
        userRoleId: userRole.id,
        connectionId: parseInt(connectionId),
        canView: canView !== undefined ? canView : true,
        canEdit: canEdit !== undefined ? canEdit : false
      }
    });
    
    res.status(201).json({ success: true, permission: created });
  } catch (e: any) {
    console.error('Create/update connection permission error', e);
    res.status(500).json({ error: e?.message || 'Failed to manage connection permission' });
  }
});

// Delete connection permission
router.delete('/:id', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  const userId = parseInt(req.user!.userId);
  const permissionId = parseInt(req.params.id);
  
  // Check if user has permission to manage users
  const canManageUsers = await userHasPermission(userId, tenantId, 'canManageUsers');
  if (!canManageUsers && !req.user?.roles?.includes('platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to delete connection permissions' });
  }
  
  try {
    // Verify permission belongs to this client
    const permission = await prisma.connectionPermission.findUnique({
      where: { id: permissionId },
      include: {
        userRole: true
      }
    });
    
    if (!permission || permission.userRole.clientId !== tenantId) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    
    await prisma.connectionPermission.delete({
      where: { id: permissionId }
    });
    
    res.status(204).send();
  } catch (e: any) {
    console.error('Delete connection permission error', e);
    res.status(500).json({ error: e?.message || 'Failed to delete connection permission' });
  }
});

export default router;
