import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { getUserPrimaryClientId } from '../db/clientAccess.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sendMail, buildVerificationEmail, logSignupEvent, getSignupEventLog } from '../services/emailService.js';
import { getJWTConfig } from '../config/jwt.config.js';

const router = Router();

interface LoginBody { email: string; password: string }

// Check if any users exist (public endpoint for signup form)
router.get('/has-users', async (_req: Request, res: Response) => {
  try {
    const count = await prisma.user.count();
    res.json({ hasUsers: count > 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to check users' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = (req.body || {}) as LoginBody;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const { secret } = getJWTConfig();
    
    // Get all user roles from user_roles table
    const allUserRoles = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: true }
    });
    const roles = allUserRoles.map(ur => ur.role);
    
    // Get primary client ID based on user's roles and permissions
    let tenantId: number | undefined;
    const isPlatformAdmin = roles.includes('platform_admin');
    if (!isPlatformAdmin) {
      const primaryClientId = await getUserPrimaryClientId(user.id);
      tenantId = primaryClientId || undefined;
    }
    
    const payload = {
      userId: user.id,
      tenantId,
      roles,
    } as any;
    const token = jwt.sign(payload, secret, { expiresIn: '24h' });
    res.json({ token, roles, clientId: tenantId });
  } catch (e: any) {
    console.error('Login error', e);
    res.status(500).json({ error: e?.message || 'Login failed' });
  }
});

interface SignupBody { 
  email: string; 
  firstName: string;
  lastName: string;
  clientId?: string;
  companyName?: string;
  password?: string;
  token?: string;  // Invitation token
}

// Client self-registration endpoint (public, no auth required)
// Creates a new client and owner user
// If this is the FIRST user ever, they become platform_admin
// If invitation token provided, associates with existing client
router.post('/signup', async (req: Request, res: Response) => {
  const { email, firstName, lastName, clientId, companyName, password, token } = (req.body || {}) as SignupBody;
  const normalizedEmail = email?.trim().toLowerCase();
  
  if (!normalizedEmail || !firstName || !lastName) {
    return res.status(400).json({ error: 'Email, firstName, and lastName are required' });
  }
  
  if (!firstName.trim() || !lastName.trim()) {
    return res.status(400).json({ error: 'First name and last name cannot be empty' });
  }
  
  try {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Check if this is the first user ever
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;
    
    if (isFirstUser) {
      // First user becomes platform_admin (no client needed)
      // No email verification required since email may not be set up yet
      // Password is REQUIRED for first user
      
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password is required for the first user and must be at least 6 characters' });
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          passwordHash,
          emailVerified: true  // Auto-verify first user
        }
      });
      
      // Create platform_admin role in user_roles table
      await prisma.userRole.create({
        data: {
          userId: user.id,
          clientId: null,
          role: 'platform_admin'
        }
      });
      
      return res.status(201).json({ 
        message: 'Platform admin account created successfully. You can now log in.',
        userId: user.id,
        roles: ['platform_admin'],
        note: 'As the first user, your account is automatically verified. Please set up email settings in the admin panel.'
      });
    }
    
    // Regular signup flow for subsequent users
    // Password is optional - if not provided, user will set it during email verification
    
    let finalClientId: number | undefined;
    let invitationRecord = null;
    
    // If invitation token provided, validate and use it
    if (token) {
      invitationRecord = await prisma.invitation.findUnique({ where: { token } });
      if (!invitationRecord) {
        return res.status(404).json({ error: 'Invalid or expired invitation' });
      }
      if (invitationRecord.email !== normalizedEmail) {
        return res.status(400).json({ error: 'Invitation email does not match signup email' });
      }
      if (invitationRecord.status !== 'pending') {
        return res.status(400).json({ error: `This invitation has already been ${invitationRecord.status}` });
      }
      if (new Date(invitationRecord.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Invitation has expired' });
      }
      
      // If invitation has clientId, use it
      if (invitationRecord.clientId) {
        finalClientId = invitationRecord.clientId;
      } else {
        // Invitation without client: allow signup without creating a tenant
        if (companyName && companyName.trim()) {
          const newClient = await prisma.client.create({
            data: { name: companyName.trim() }
          });
          finalClientId = newClient.id;
        } else {
          finalClientId = undefined;
        }
      }
    } else {
      // No invitation token - require either clientId or companyName
      if (!clientId && !companyName) {
        return res.status(400).json({ error: 'Either clientId, companyName, or invitation token is required' });
      }
      
      if (clientId) {
        // Verify the client exists
        const clientIdNum = parseInt(clientId);
        const client = await prisma.client.findUnique({ where: { id: clientIdNum } });
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        finalClientId = clientIdNum;
      } else {
        // Create new client (auto-increment ID)
        const newClient = await prisma.client.create({
          data: {
            name: companyName!.trim()
          }
        });
        finalClientId = newClient.id;
      }
    }
    
    // Create user (roles stored separately in user_roles table)
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        emailVerified: false
      }
    });

    // Create UserRole relationship for business_owner role only when a client is specified
    if (typeof finalClientId === 'number') {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          clientId: finalClientId,
          role: 'business_owner'
        }
      });
    }
    
    // Create email verification invitation - always needed for password setup
    const verificationToken = `verify_${Math.random().toString(36).slice(2, 18)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    const verificationInvitation = await prisma.invitation.create({
      data: {
        email: normalizedEmail,
        invitationType: 'email_verification',
        token: verificationToken,
        expiresAt,
        status: 'pending'
      }
    });
    
    // Do NOT mark the original account_creation invitation as accepted here.
    // Defer acceptance until the user verifies email and sets a password.
    
    // Send verification email (always send so user can set password)
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const built = buildVerificationEmail(user.firstName || '', verificationLink);
    console.log('[signup] Sending verification email to:', user.email);
    logSignupEvent('PRE_SEND_VERIFICATION_EMAIL', user.email, { token: verificationToken });
    const mailResult = await sendMail(user.email, built.subject, built.text, built.html);
    logSignupEvent('POST_SEND_VERIFICATION_EMAIL', user.email, { sent: mailResult.sent, error: mailResult.error });
    
    if (!mailResult.sent) {
      console.error('[signup] Failed to send verification email:', mailResult.error);
    }
    
    const note = typeof finalClientId !== 'number' ? 'No tenant assigned yet. Ask an owner to invite you to a client.' : undefined;

    res.status(201).json({ 
      message: 'Account created successfully. Please check your email to verify your account and set your password.',
      userId: user.id,
      email: user.email,
      clientId: finalClientId,
      note,
      emailSent: mailResult.sent,
      emailError: mailResult.sent ? undefined : (mailResult.error || 'Failed to send email')
    });
  } catch (e: any) {
    console.error('Signup error', e);
    res.status(500).json({ error: e?.message || 'Signup failed' });
  }
});

// Verify email and set password
router.post('/verify-email', async (req: Request, res: Response) => {
  const { token, password } = (req.body || {}) as { token?: string; password?: string };
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    // Find email verification invitation with this token
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.invitationType !== 'email_verification') {
      return res.status(404).json({ error: 'Invalid or expired verification token' });
    }
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'This verification has already been used' });
    }
    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }
    
    // Find user by email
    const user = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const hash = await bcrypt.hash(password, 10);
    
    // Update user and mark invitations as accepted
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, passwordHash: hash }
      }),
      // Accept the email_verification invitation used
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() }
      }),
      // Also accept any pending account_creation invitations for this email
      prisma.invitation.updateMany({
        where: {
          email: invitation.email,
          invitationType: 'account_creation' as any,
          status: 'pending'
        },
        data: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() }
      })
    ]);
    
    // Notify connected SSE clients that a manager has been verified
    if ((global as any).notifyManagerUpdate) {
      (global as any).notifyManagerUpdate();
    }
    res.json({ verified: true, email: user.email, message: 'Email verified and password set. You can now log in.' });
  } catch (e: any) {
    console.error('Verify email error', e);
    res.status(500).json({ error: e?.message || 'Verification failed' });
  }
});

// Get available clients for signup (PROTECTED - platform_admin only)
router.get('/clients', async (req: Request, res: Response) => {
  // Require authentication and platform_admin role
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { secret } = getJWTConfig();
    const payload = jwt.verify(token, secret) as any;
    if (payload.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Forbidden - platform_admin access required' });
    }
    const clients = await prisma.client.findMany({ 
      orderBy: { createdAt: 'asc' }
    });
    res.json(clients.map(c => ({ id: c.id, name: c.name })));
  } catch (e: any) {
    console.error('Get clients error', e);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;