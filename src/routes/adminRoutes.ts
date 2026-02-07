import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getEmailSettings, updateEmailSettings, sendMail, buildInvitationEmail, buildVerificationEmail } from '../services/emailService.js';
import { logUserRoleChange } from '../services/auditService.js';

const router = Router();

// Helper to generate cryptographically secure random token
function generateInvitationToken(): string {
  return `inv_${crypto.randomBytes(24).toString('base64url')}`;
}

// Simple role check helper
function requirePlatformAdmin(req: Request, res: Response): boolean {
  if (req.user?.roles?.includes('platform_admin')) return true;
  res.status(403).json({ error: 'Forbidden: platform_admin role required' });
  return false;
}

// List all clients
router.get('/clients', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  try {
    const clients = await prisma.client.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(clients.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt })));
  } catch (e: any) {
    console.error('List clients error', e);
    res.status(500).json({ error: e?.message || 'Failed to list clients' });
  }
});

// List all managers
router.get('/managers', async (_req: Request, res: Response) => {
  try {
    const managerRoles = await prisma.userRole.findMany({
      where: { role: 'manager' },
      include: { user: true },
      distinct: ['userId']
    });
    const managers = managerRoles.map(mr => ({
      id: mr.user.id,
      email: mr.user.email,
      emailVerified: mr.user.emailVerified
    }));
    res.json(managers);
  } catch (e: any) {
    console.error('List managers error', e);
    res.status(500).json({ error: e?.message || 'Failed to list managers' });
  }
});

// List invitations for a client (with user account status)
router.get('/invitations', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  try {
    const { clientId } = req.query;

    let invitations;
    if (clientId) {
      // Get invitations for specific client
      const parsedClientId = parseInt(String(clientId), 10);
      invitations = await prisma.invitation.findMany({
        where: { clientId: parsedClientId, invitationType: 'account_creation' },
        orderBy: { sentAt: 'desc' }
      });
    } else {
      // Get all invitations if no client specified
      invitations = await prisma.invitation.findMany({
        where: { invitationType: 'account_creation' },
        orderBy: { sentAt: 'desc' }
      });
    }

    const invitationsWithStatus = invitations.map(async (inv) => {
      // If user exists, check if they've created an account
      const user = await prisma.user.findUnique({ where: { email: inv.email } });
      const hasAccount = !!user;
      
      return {
        id: inv.id,
        email: inv.email,
        clientId: inv.clientId,
        clientName: inv.client?.name,
        status: inv.status,
        sentAt: inv.sentAt,
        expiresAt: inv.expiresAt,
        hasAccount
      };
    });

    res.json(await Promise.all(invitationsWithStatus));
  } catch (e: any) {
    console.error('List invitations error', e);
    res.status(500).json({ error: e?.message || 'Failed to list invitations' });
  }
});

// Create/send invitation
router.post('/invitations', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;

  const { email, clientId, clientName, invitationType = 'account_creation' } = req.body || {};
  try {
    // Validate email format
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }
    
    // If clientId provided, verify it exists
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: parseInt(clientId) } });
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
    }
    
    const clientIdNum = clientId ? parseInt(clientId) : null;
    
    // Generate new token and expiration
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    let invitation: any;
    if (clientIdNum === null) {
      // For generic invites without a client
      const existing = await prisma.invitation.findFirst({
        where: { email: normalizedEmail, clientId: null, invitationType },
        orderBy: { sentAt: 'desc' }
      });

      if (existing) {
        invitation = await prisma.invitation.update({
          where: { id: existing.id },
          data: {
            token,
            status: 'pending',
            sentAt: new Date(),
            expiresAt,
            acceptedAt: null,
            updatedAt: new Date()
          },
          include: { client: true }
        });
      } else {
        invitation = await prisma.invitation.create({
          data: {
            email: normalizedEmail,
            clientId: null,
            invitationType,
            token,
            status: 'pending',
            expiresAt
          },
          include: { client: true }
        });
      }
    } else {
      // Client-specific invites
      invitation = await prisma.invitation.upsert({
        where: {
          email_invitationType_clientId: {
            email: normalizedEmail,
            invitationType,
            clientId: clientIdNum as any
          }
        },
        update: {
          token,
          status: 'pending',
          sentAt: new Date(),
          expiresAt,
          acceptedAt: null,
          updatedAt: new Date()
        },
        create: {
          email: normalizedEmail,
          clientId: clientIdNum,
          invitationType,
          token,
          status: 'pending',
          expiresAt
        },
        include: { client: true }
      }) as any;
    }
    
    const displayName = clientId ? invitation.client?.name : (clientName && clientName.trim()) || '';

    // Send invitation email
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?token=${invitation.token}`;
    const builtInvite = buildInvitationEmail(displayName || '', invitationLink);
    const mailResult = await sendMail(normalizedEmail, builtInvite.subject, builtInvite.text, builtInvite.html);
    
    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        clientId: invitation.clientId,
        status: invitation.status,
        sentAt: invitation.sentAt,
        expiresAt: invitation.expiresAt
      },
      emailSent: mailResult.sent,
      emailError: mailResult.sent ? undefined : (mailResult.error || 'Failed to send email')
    });
  } catch (e: any) {
    console.error('Create invitation error', e);
    res.status(500).json({ error: e?.message || 'Failed to create invitation' });
  }
});

// Resend invitation
router.post('/invitations/:id/resend', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const invitationId = parseInt(req.params.id);
  if (isNaN(invitationId)) {
    return res.status(400).json({ error: 'Invalid invitation ID' });
  }

  try {
    const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Update the invitation token and timestamps
    const newToken = generateInvitationToken();
    const updatedInvitation = await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        token: newToken,
        status: 'pending',
        sentAt: new Date(),
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      include: { client: true }
    });

    const displayName = updatedInvitation.client?.name || '';
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?token=${newToken}`;
    const builtInvite = buildInvitationEmail(displayName, invitationLink);
    const mailResult = await sendMail(invitation.email, builtInvite.subject, builtInvite.text, builtInvite.html);

    res.json({
      sent: mailResult.sent,
      error: mailResult.sent ? undefined : (mailResult.error || 'Failed to send email')
    });
  } catch (e: any) {
    console.error('Resend invitation error', e);
    res.status(500).json({ error: e?.message || 'Failed to resend invitation' });
  }
});

// Create user (platform_admin): supports role creation like manager
router.post('/users', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const { email, role, clientId, firstName }: { email?: string, role?: string, clientId?: string | number, firstName?: string } = req.body || {};
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !role) return res.status(400).json({ error: 'Missing email or role' });
  try {
    if ((role === 'business_owner' || role === 'delegate') && !clientId) return res.status(400).json({ error: 'clientId required for business_owner/delegate' });

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      const userRoles = await prisma.userRole.findMany({ where: { userId: existingUser.id } });
      const roleNames = userRoles.map(ur => ur.role);
      return res.status(409).json({
        error: 'A user with this email already exists',
        existingUserId: existingUser.id,
        roles: roleNames
      });
    }

    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        emailVerified: false
      }
    });

    // Create user_role entry
    let clientIdNum: number | null = null;
    if (role === 'platform_admin') {
      await prisma.userRole.create({ data: { userId: created.id, clientId: null, role: 'platform_admin' } });
    } else if (role === 'manager') {
      await prisma.userRole.create({ data: { userId: created.id, clientId: null, role: 'manager' } });
    } else {
      clientIdNum = (typeof clientId === 'string' ? parseInt(clientId) : clientId) ?? null;
      if (clientIdNum && (role === 'business_owner' || role === 'delegate')) {
        await prisma.userRole.create({ data: { userId: created.id, clientId: clientIdNum, role: role as any } });
      }
    }

    const result: any = { id: created.id, email: created.email, role: role, emailVerified: created.emailVerified };
    if (clientIdNum) {
      result.clientId = clientIdNum;
    }

    // Create email verification invitation
    const verificationToken = `verify_${Math.random().toString(36).slice(2, 18)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.invitation.create({
      data: {
        email: normalizedEmail,
        invitationType: 'email_verification',
        token: verificationToken,
        expiresAt,
        status: 'pending'
      }
    });

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const builtEmail = buildVerificationEmail(firstName || normalizedEmail.split('@')[0], verificationUrl);
    const sendResult = await sendMail(normalizedEmail, builtEmail.subject, builtEmail.text, builtEmail.html);
    result.emailSent = sendResult.sent;
    if (!sendResult.sent) {
      result.emailError = sendResult.error;
    }

    res.status(201).json(result);
  } catch (e: any) {
    console.error('Create user error', e);
    res.status(500).json({ error: e?.message || 'Failed to create user' });
  }
});

// Manager assignments management
router.get('/managers/:userId/assignments', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const userId = parseInt(req.params.userId);
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const managerRole = await prisma.userRole.findFirst({ where: { userId, role: 'manager' } });
    if (!managerRole) return res.status(400).json({ error: 'User is not a manager' });
    const assignments = await prisma.userRole.findMany({ where: { userId, role: 'manager' } });
    res.json(assignments.map(a => ({ clientId: a.clientId, createdAt: a.createdAt, active: a.managerActive })));
  } catch (e: any) {
    console.error('List assignments error', e);
    res.status(500).json({ error: e?.message || 'Failed to list assignments' });
  }
});

router.post('/managers/:userId/assignments', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const userId = parseInt(req.params.userId);
  const clientIdParam: string | undefined = req.body?.clientId;
  if (!clientIdParam) return res.status(400).json({ error: 'Missing clientId' });
  const clientId = parseInt(clientIdParam);
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const managerRole = await prisma.userRole.findFirst({ where: { userId, role: 'manager' } });
    if (!managerRole) return res.status(400).json({ error: 'User is not a manager' });
    if (!user.emailVerified) return res.status(400).json({ error: 'Manager must verify email before assignments' });
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const existing = await prisma.userRole.findFirst({
      where: { userId, clientId, role: 'manager' }
    });
    if (existing) return res.status(409).json({ error: 'Assignment already exists' });
    const assignment = await prisma.userRole.create({
      data: { userId, clientId, role: 'manager', managerActive: true }
    });
    await logUserRoleChange({
      userRoleId: assignment.id,
      clientId,
      userId,
      changedBy: parseInt(req.user!.userId as any),
      action: 'created',
      field: 'role',
      oldValue: null,
      newValue: 'manager'
    });
    res.status(201).json({ clientId: assignment.clientId, createdAt: assignment.createdAt, active: assignment.managerActive });
  } catch (e: any) {
    console.error('Create assignment error', e);
    res.status(500).json({ error: e?.message || 'Failed to create assignment' });
  }
});

router.patch('/managers/:userId/assignments/:clientId', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const userId = parseInt(req.params.userId);
  const clientId = parseInt(req.params.clientId);
  const active: boolean | undefined = req.body?.active;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'Missing active boolean' });
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const hasManagerRole = await prisma.userRole.findFirst({ where: { userId, role: 'manager' } });
    if (!hasManagerRole) return res.status(400).json({ error: 'User is not a manager' });
    if (!user.emailVerified) return res.status(400).json({ error: 'Manager must verify email before assignments' });
    const before = await prisma.userRole.findFirst({ where: { userId, clientId, role: 'manager' } });
    await prisma.userRole.updateMany({
      where: { userId, clientId, role: 'manager' },
      data: { managerActive: active }
    });
    if (before && before.managerActive !== active) {
      await logUserRoleChange({
        userRoleId: before.id,
        clientId,
        userId,
        changedBy: parseInt(req.user!.userId as any),
        action: 'updated',
        field: 'managerActive',
        oldValue: String(before.managerActive),
        newValue: String(active)
      });
    }
    res.json({ clientId, active });
  } catch (e: any) {
    console.error('Toggle assignment error', e);
    res.status(500).json({ error: e?.message || 'Failed to update assignment' });
  }
});

// Resend verification email for a manager
router.post('/managers/:userId/resend-verification', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const userId = parseInt(req.params.userId);
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Create verification token
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

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const builtEmail = buildVerificationEmail(user.email.split('@')[0], verificationUrl);
    const sendResult = await sendMail(user.email, builtEmail.subject, builtEmail.text, builtEmail.html);

    if (sendResult.sent) {
      res.json({ sent: true });
    } else {
      res.status(500).json({ error: sendResult.error || 'Failed to send verification email' });
    }
  } catch (e: any) {
    console.error('Resend verification error', e);
    res.status(500).json({ error: e?.message || 'Failed to resend verification email' });
  }
});

// Email settings (platform_admin only)
router.get('/email-settings', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  try {
    const settings = await getEmailSettings();
    if (!settings) return res.json({ configured: false });
    res.json({ configured: true, ...settings });
  } catch (e: any) {
    console.error('Get email settings error', e);
    res.status(500).json({ error: e?.message || 'Failed to get email settings' });
  }
});

router.put('/email-settings', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const { host, port, username, password, fromAddress } = req.body || {};
  if (!host || !port || !username || !fromAddress) {
    return res.status(400).json({ error: 'Missing required fields: host, port, username, fromAddress' });
  }
  try {
    await updateEmailSettings({ host, port: Number(port), secure: true, username, password, fromAddress });
    res.json({ saved: true });
  } catch (e: any) {
    console.error('Update email settings error', e);
    res.status(500).json({ error: e?.message || 'Failed to update email settings' });
  }
});

// Test email endpoint
router.post('/email-test', async (req: Request, res: Response) => {
  if (!requirePlatformAdmin(req, res)) return;
  const { testEmail } = req.body || {};
  if (!testEmail) {
    return res.status(400).json({ error: 'Missing testEmail field' });
  }
  try {
    console.log('[email-test] Sending test email to:', testEmail);
    const result = await sendMail(
      testEmail,
      'Test Email from PestControl CRM',
      'This is a test email to verify your SMTP configuration is working correctly.',
      '<p>This is a test email to verify your SMTP configuration is working correctly.</p><p>If you received this, email sending is operational!</p>'
    );
    if (result.sent) {
      res.json({ 
        success: true, 
        messageId: result.messageId, 
        accepted: result.accepted,
        rejected: result.rejected,
        response: result.response,
        message: 'Test email sent successfully!' 
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send test email' });
    }
  } catch (e: any) {
    console.error('Email test error', e);
    res.status(500).json({ error: e?.message || 'Failed to send test email' });
  }
});

export default router;
