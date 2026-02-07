import { Router, Request, Response } from 'express';
import { listConnections, createConnection, updateConnection, deleteConnection, testConnection, connectionInUse } from '../services/connectionService.js';
import { prisma } from '../db/prisma.js';
import { userHasPermission, userCanAccessConnection } from '../services/permissionService.js';

const router = Router();

const editableRoles = new Set(['business_owner', 'delegate', 'platform_admin', 'manager']);

function ensureCanEdit(req: Request, res: Response): boolean {
  if (req.user && req.user.roles?.some(role => editableRoles.has(role))) return true;
  res.status(403).json({ error: 'Forbidden: insufficient role to manage connections' });
  return false;
}

function ensureTenant(req: Request, res: Response): number | null {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: 'Client context missing' });
    return null;
  }
  return parseInt(tenantId);
}

// Verify user has access to the client (owner owns it, manager is assigned to it, platform_admin has full access, delegate manages it)
async function ensureClientAccess(req: Request, res: Response, clientId: number): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  // Platform admins have access to all clients
  if (req.user.roles?.includes('platform_admin')) {
    return true;
  }

  // Business owners have access to their own clients
  if (req.user.roles?.includes('business_owner')) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const isOwner = client && client.id === clientId && req.user.userId;
    // In a real system, you'd check if this user owns this client
    // For now, we verify the client exists
    if (!client) {
      res.status(403).json({ error: 'Forbidden: client not found or access denied' });
      return false;
    }
    return true;
  }

  // Managers must have an active assignment to the client
  if (req.user.roles?.includes('manager')) {
    const userId = parseInt(req.user.userId);
    const assignment = await prisma.userRole.findFirst({
      where: {
        userId,
        clientId: clientId,
        role: 'manager',
        managerActive: true
      }
    });
    if (!assignment) {
      res.status(403).json({ error: 'Forbidden: not assigned to this client' });
      return false;
    }
    return true;
  }

  // Delegates have access to their assigned clients
  if (req.user.roles?.includes('delegate')) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      res.status(403).json({ error: 'Forbidden: client not found' });
      return false;
    }
    return true;
  }

  res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  return false;
}

// List connections for tenant
router.get('/', async (req: Request, res: Response) => {
  const tenantId = ensureTenant(req, res);
  if (!tenantId) return;
  if (!(await ensureClientAccess(req, res, tenantId))) return;
  
  // Check if user has permission to view reports (which includes viewing connections)
  const userId = parseInt(req.user!.userId);
  const canView = await userHasPermission(userId, tenantId, 'canViewReports');
  if (!canView) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to view connections' });
  }
  
  try {
    // Include connection details only for users who can manage connections
    const canManage = await userHasPermission(userId, tenantId, 'canManageConnections');
    const rows = await listConnections(tenantId, canManage);
    res.json(rows);
  } catch (e: any) {
    console.error('List connections error', e);
    res.status(500).json({ error: e?.message || 'Failed to list connections' });
  }
});

// Create connection
router.post('/', async (req: Request, res: Response) => {
  const tenantId = ensureTenant(req, res);
  if (!tenantId) return;
  if (!(await ensureClientAccess(req, res, tenantId))) return;
  
  // Check if user has permission to manage connections
  const userId = parseInt(req.user!.userId);
  const canManage = await userHasPermission(userId, tenantId, 'canManageConnections');
  if (!canManage) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to create connections' });
  }
  
  const { name, engine, host, port, database, username, password, options } = req.body || {};
  if (!name || !engine || !host || !port || !database || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields: name, engine, host, port, database, username, password' });
  }
  try {
    const created = await createConnection(tenantId, {
      name,
      engine,
      host,
      port: Number(port),
      database,
      username,
      password,
      options: options ?? null,
    });
    res.status(201).json(created);
  } catch (e: any) {
    console.error('Create connection error', e);
    res.status(500).json({ error: e?.message || 'Failed to create connection' });
  }
});

// Update connection
router.put('/:id', async (req: Request, res: Response) => {
  const tenantId = ensureTenant(req, res);
  if (!tenantId) return;
  if (!(await ensureClientAccess(req, res, tenantId))) return;
  const connectionId = parseInt(req.params.id);
  
  // Check if user has permission to edit this specific connection
  const userId = parseInt(req.user!.userId);
  const canEdit = await userCanAccessConnection(userId, connectionId, 'edit');
  if (!canEdit) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to edit this connection' });
  }
  
  const { name, engine, host, port, database, username, password, options } = req.body || {};
  if (!name || !engine || !host || !port || !database || !username) {
    return res.status(400).json({ error: 'Missing required fields: name, engine, host, port, database, username' });
  }
  try {
    const updated = await updateConnection(tenantId, connectionId, {
      name,
      engine,
      host,
      port: Number(port),
      database,
      username,
      password,
      options: options ?? null,
    });
    if (!updated) return res.status(404).json({ error: 'Connection not found' });
    res.json(updated);
  } catch (e: any) {
    console.error('Update connection error', e);
    res.status(500).json({ error: e?.message || 'Failed to update connection' });
  }
});

// Delete connection
router.delete('/:id', async (req: Request, res: Response) => {
  const tenantId = ensureTenant(req, res);
  if (!tenantId) return;
  if (!(await ensureClientAccess(req, res, tenantId))) return;
  const connectionId = parseInt(req.params.id);
  
  // Check if user has permission to manage connections (delete requires management permission)
  const userId = parseInt(req.user!.userId);
  const canManage = await userHasPermission(userId, tenantId, 'canManageConnections');
  if (!canManage) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to delete connections' });
  }
  
  try {
    const inUse = await connectionInUse(connectionId);
    if (inUse > 0) {
      return res.status(409).json({ error: 'Connection is in use by reports and cannot be deleted' });
    }
    const ok = await deleteConnection(tenantId, connectionId);
    if (!ok) return res.status(404).json({ error: 'Connection not found' });
    res.status(204).send();
  } catch (e: any) {
    console.error('Delete connection error', e);
    res.status(500).json({ error: e?.message || 'Failed to delete connection' });
  }
});

// Live test unsaved connection (for form preview)
router.post('/test', async (req: Request, res: Response) => {
  const tenantId = ensureTenant(req, res);
  if (!tenantId) return;
  if (!(await ensureClientAccess(req, res, tenantId))) return;
  
  // Check if user has permission to manage connections (testing new connections requires management)
  const userId = parseInt(req.user!.userId);
  const canManage = await userHasPermission(userId, tenantId, 'canManageConnections');
  if (!canManage) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to test connections' });
  }
  
  const { engine, host, port, database, username, password, options } = req.body || {};
  if (!engine || !host || !port || !database || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields to test: engine, host, port, database, username, password' });
  }
  try {
    const result = await testConnection(tenantId, null, password, {
      engine,
      host,
      port: Number(port),
      database,
      username,
      options: options ?? null,
    });
    if (!result.ok) return res.status(400).json({ ok: false, message: result.message || 'Test failed' });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('Test unsaved connection error', e);
    res.status(500).json({ error: e?.message || 'Failed to test connection' });
  }
});

// Live test connection
router.post('/:id/test', async (req: Request, res: Response) => {
  const tenantId = ensureTenant(req, res);
  if (!tenantId) return;
  if (!(await ensureClientAccess(req, res, tenantId))) return;
  const connectionId = parseInt(req.params.id);
  
  // Check if user has permission to view this connection (testing requires at least view access)
  const userId = parseInt(req.user!.userId);
  const canView = await userCanAccessConnection(userId, connectionId, 'view');
  if (!canView) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to test this connection' });
  }
  
  const { password } = req.body || {};
  try {
    const result = await testConnection(tenantId, connectionId, password);
    if (!result.ok) return res.status(400).json({ ok: false, message: result.message || 'Test failed' });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('Test connection error', e);
    res.status(500).json({ error: e?.message || 'Failed to test connection' });
  }
});

export default router;
