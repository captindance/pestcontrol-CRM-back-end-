import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { getUserClientIds, getUserRoleForClient } from '../db/clientAccess.js';
import { sendMail } from '../services/emailService.js';
import { userHasPermission, getUserPermissions } from '../services/permissionService.js';
import { logUserRoleChange } from '../services/auditService.js';

const router = Router();

function authorizeOwnerOrAdmin(req: Request, res: Response, next: NextFunction) {
  const targetClientId = req.params.id ? parseInt(req.params.id) : req.tenantId;
  if (!targetClientId) return res.status(400).json({ error: 'Client id missing' });
  const roles = req.user?.roles || [];
  if (roles.includes('platform_admin')) return next();
  if ((roles.includes('business_owner') || roles.includes('delegate')) && req.tenantId === targetClientId) return next();
  return res.status(403).json({ error: 'Forbidden: requires business_owner/delegate of client or platform_admin' });
}

// Get all clients accessible to the current user
router.get('/all', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const clientIds = await getUserClientIds(userId);
    
    const clients = await prisma.client.findMany({
      where: {
        id: { in: clientIds }
      },
      select: {
        id: true,
        name: true,
        createdAt: true
      }
    });

    // Enrich with user's role for each client
    const clientsWithRole = await Promise.all(
      clients.map(async (client) => {
        const role = await getUserRoleForClient(userId, client.id);
        return { ...client, role };
      })
    );

    res.json(clientsWithRole);
  } catch (e: any) {
    console.error('Get clients error', e);
    res.status(500).json({ error: e?.message || 'Failed to get clients' });
  }
});

// Current client info
router.get('/me', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  const client = await prisma.client.findUnique({ where: { id: tenantId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({ id: client.id, name: client.name });
});

// List users (business_owner + delegates + viewers) for a client
router.get('/:id/users', authorizeOwnerOrAdmin, async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  
  // Get all users associated with this client via userRole table
  const userRoles = await prisma.userRole.findMany({
    where: { clientId, role: { in: ['business_owner', 'delegate', 'viewer'] } },
    include: { user: true }
  });
  
  const users = userRoles.map(ur => ({
    id: ur.user.id,
    email: ur.user.email,
    firstName: ur.user.firstName,
    lastName: ur.user.lastName,
    role: ur.role,
    emailVerified: ur.user.emailVerified,
    createdAt: ur.user.createdAt
  }));
  
  res.json(users);
});

interface CreateUserBody { email: string; role: string; }
// Invite a new user (delegate or viewer) to the client organization
router.post('/:id/users', authorizeOwnerOrAdmin, async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  const { email, role }: CreateUserBody = req.body || {};
  
  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }
  
  if (!['delegate', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be delegate or viewer' });
  }
  
  // Check if user has permission to invite users
  const userId = parseInt(req.user!.userId);
  const canInvite = await userHasPermission(userId, clientId, 'canInviteUsers');
  if (!canInvite) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to invite users' });
  }
  
  try {
    const trimmedEmail = email.trim().toLowerCase();
    
    // Check if this user already has a role in this client
    const existingUser = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existingUser) {
      // Check if user already has ANY role in this client
      const existingRole = await prisma.userRole.findFirst({
        where: {
          userId: existingUser.id,
          clientId
        }
      });
      if (existingRole) {
        return res.status(409).json({ error: 'User already has a role in this organization' });
      }
      // User exists but doesn't have a role in this client, so add them
      await prisma.userRole.create({
        data: {
          userId: existingUser.id,
          clientId,
          role: role as any
        }
      });
      
      return res.status(201).json({ 
        id: existingUser.id, 
        email: existingUser.email, 
        role: role,
        alreadyExisted: true
      });
    }
    
    const user = await prisma.user.create({ 
      data: { 
        email: trimmedEmail, 
        emailVerified: false
      } 
    });

    // Create email verification invitation
    const verificationToken = `verify_${Math.random().toString(36).slice(2, 18)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await prisma.invitation.create({
      data: {
        email: user.email,
        invitationType: 'email_verification',
        token: verificationToken,
        expiresAt,
        status: 'pending'
      }
    });

    // Create userRole entry with requested role
    await prisma.userRole.create({
      data: {
        userId: user.id,
        clientId,
        role: role as any
      }
    });
    
    // Send verification email
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const emailHtml = `
      <h2>You've been invited to join PestControl CRM</h2>
      <p>Please verify your email address and set your password to complete your registration.</p>
      <p><a href="${verificationLink}" style="background-color: #0078d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email & Set Password</a></p>
      <p>Or copy this link: ${verificationLink}</p>
      <p>This link will expire in 24 hours.</p>
    `;
    
    const mailResult = await sendMail(
      user.email,
      'Invitation to Join PestControl CRM',
      undefined,
      emailHtml
    );
    
    res.status(201).json({ 
      id: user.id, 
      email: user.email, 
      role: role,
      emailSent: mailResult.sent,
      emailError: mailResult.sent ? undefined : mailResult.error
    });
  } catch (e: any) {
    console.error('Invite user error', e);
    res.status(500).json({ error: e?.message || 'Failed to invite user' });
  }
});

// Get managers assigned to this client
router.get('/:id/managers', authorizeOwnerOrAdmin, async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  try {
    const assignments = await prisma.userRole.findMany({
      where: { clientId, role: 'manager' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            emailVerified: true
          }
        }
      }
    });
    
    const managers = assignments.map(a => ({
      id: a.user.id,
      email: a.user.email,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
      emailVerified: a.user.emailVerified,
      active: a.managerActive,
      assignedAt: a.createdAt
    }));
    
    res.json(managers);
  } catch (e: any) {
    console.error('Get managers error', e);
    res.status(500).json({ error: e?.message || 'Failed to get managers' });
  }
});

interface CreateDelegateBody { email: string; userId?: string; }
// Create a delegate for a client
router.post('/:id/delegates', authorizeOwnerOrAdmin, async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  const { email, userId }: CreateDelegateBody = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  try {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return res.status(409).json({ error: 'Email already in use' });
    const user = await prisma.user.create({ data: { email } });
    // Create userRole entry with delegate role
    await prisma.userRole.create({ data: { userId: user.id, clientId, role: 'delegate' } });
    res.status(201).json({ id: user.id, email: user.email, role: 'delegate' });
  } catch (e: any) {
    console.error('Create delegate error', e);
    res.status(500).json({ error: e?.message || 'Failed to create delegate' });
  }
});

// Get current user's effective permissions for a client
router.get('/:id/my-permissions', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  const userId = parseInt(req.user!.userId);
  
  try {
    const permissions = await getUserPermissions(userId, clientId);
    res.json(permissions);
  } catch (e: any) {
    console.error('Get my permissions error', e);
    res.status(500).json({ error: e?.message || 'Failed to get permissions' });
  }
});

// Get specific user's permissions for a client
router.get('/:id/users/:userId/permissions', authorizeOwnerOrAdmin, async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  
  // Check if current user has permission to manage users
  const currentUserId = parseInt(req.user!.userId);
  const canManageUsers = await userHasPermission(currentUserId, clientId, 'canManageUsers');
  if (!canManageUsers && !req.user?.roles?.includes('platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to view user permissions' });
  }
  
  try {
    const permissions = await getUserPermissions(targetUserId, clientId);
    
    // Also get the raw permission overrides (to distinguish between null and explicit values)
    const userRole = await prisma.userRole.findFirst({
      where: { userId: targetUserId, clientId },
      select: {
        role: true,
        canViewReports: true,
        canCreateReports: true,
        canEditReports: true,
        canDeleteReports: true,
        canManageConnections: true,
        canInviteUsers: true,
        canManageUsers: true
      }
    });
    
    res.json({
      effective: permissions,
      overrides: userRole ? {
        canViewReports: userRole.canViewReports,
        canCreateReports: userRole.canCreateReports,
        canEditReports: userRole.canEditReports,
        canDeleteReports: userRole.canDeleteReports,
        canManageConnections: userRole.canManageConnections,
        canInviteUsers: userRole.canInviteUsers,
        canManageUsers: userRole.canManageUsers
      } : null,
      role: userRole?.role
    });
  } catch (e: any) {
    console.error('Get user permissions error', e);
    res.status(500).json({ error: e?.message || 'Failed to get user permissions' });
  }
});

// Update specific user's permissions for a client
router.patch('/:id/users/:userId/permissions', authorizeOwnerOrAdmin, async (req: Request, res: Response) => {
  const clientId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  
  // Check if current user has permission to manage users
  const currentUserId = parseInt(req.user!.userId);
  const canManageUsers = await userHasPermission(currentUserId, clientId, 'canManageUsers');
  if (!canManageUsers && !req.user?.roles?.includes('platform_admin')) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to update user permissions' });
  }
  
  const {
    canViewReports,
    canCreateReports,
    canEditReports,
    canDeleteReports,
    canManageConnections,
    canInviteUsers,
    canManageUsers: canManageUsersUpdate
  } = req.body;
  
  try {
    const before = await prisma.userRole.findFirst({
      where: { userId: targetUserId, clientId },
    });

    if (!before) {
      return res.status(404).json({ error: 'User role not found for this client' });
    }

    const updated = await prisma.userRole.update({
      where: { id: before.id },
      data: {
        canViewReports: canViewReports !== undefined ? canViewReports : undefined,
        canCreateReports: canCreateReports !== undefined ? canCreateReports : undefined,
        canEditReports: canEditReports !== undefined ? canEditReports : undefined,
        canDeleteReports: canDeleteReports !== undefined ? canDeleteReports : undefined,
        canManageConnections: canManageConnections !== undefined ? canManageConnections : undefined,
        canInviteUsers: canInviteUsers !== undefined ? canInviteUsers : undefined,
        canManageUsers: canManageUsersUpdate !== undefined ? canManageUsersUpdate : undefined
      }
    });

    const fields: Array<keyof typeof updated> = [
      'canViewReports',
      'canCreateReports',
      'canEditReports',
      'canDeleteReports',
      'canManageConnections',
      'canInviteUsers',
      'canManageUsers'
    ];

    await Promise.all(fields.map(async (field) => {
      const newVal = updated[field];
      const oldVal = before[field];
      // Only log when a value was provided AND it changed (including from null)
      const wasProvided = ((): boolean => {
        switch (field) {
          case 'canViewReports': return canViewReports !== undefined;
          case 'canCreateReports': return canCreateReports !== undefined;
          case 'canEditReports': return canEditReports !== undefined;
          case 'canDeleteReports': return canDeleteReports !== undefined;
          case 'canManageConnections': return canManageConnections !== undefined;
          case 'canInviteUsers': return canInviteUsers !== undefined;
          case 'canManageUsers': return canManageUsersUpdate !== undefined;
          default: return false;
        }
      })();

      if (wasProvided && newVal !== oldVal) {
        await logUserRoleChange({
          userRoleId: updated.id,
          clientId,
          userId: targetUserId,
          changedBy: currentUserId,
          action: 'updated',
          field,
          oldValue: oldVal === null || oldVal === undefined ? null : String(oldVal),
          newValue: newVal === null || newVal === undefined ? null : String(newVal),
        });
      }
    }));
    
    // Return the updated effective permissions
    const permissions = await getUserPermissions(targetUserId, clientId);
    res.json({ success: true, permissions });
  } catch (e: any) {
    console.error('Update user permissions error', e);
    res.status(500).json({ error: e?.message || 'Failed to update user permissions' });
  }
});

export default router;
