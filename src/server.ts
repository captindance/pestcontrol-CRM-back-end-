import express from 'express';
import cors from 'cors';
import 'dotenv/config';
// Use .js extensions for ESM runtime; TypeScript NodeNext resolution maps to .ts sources.
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';
import reportRoutes from './routes/reportRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import managerRoutes from './routes/managerRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import connectionPermissionRoutes from './routes/connectionPermissionRoutes.js';
import { prisma } from './db/prisma.js';
import jwt from 'jsonwebtoken';
import { initializeJWTConfig, getJWTConfig } from './config/jwt.config.js';

// Initialize and validate JWT configuration at startup
initializeJWTConfig();

const app = express();
app.use(cors());
app.use(express.json());

// SSE: store connected clients for admin updates
const sseAdminClients = new Set<any>();

// SSE: store connected managers by userId for assignment updates
const sseManagerClients = new Map<string, Set<any>>();

// Export global function to notify admins of manager verification
(global as any).notifyManagerUpdate = () => {
  const data = JSON.stringify({ type: 'managerVerified', timestamp: new Date().toISOString() });
  console.log('[SSE] Broadcasting managerVerified event to', sseAdminClients.size, 'admin clients');
  sseAdminClients.forEach(res => {
    res.write(`event: managerVerified\ndata: ${data}\n\n`);
  });
};

// Export global function to notify a specific manager of assignment updates
(global as any).notifyManagerAssignmentUpdate = (userId: string) => {
  const data = JSON.stringify({ type: 'assignmentUpdated', timestamp: new Date().toISOString() });
  const managerConnections = sseManagerClients.get(userId);
  if (managerConnections && managerConnections.size > 0) {
    console.log(`[SSE] Broadcasting assignmentUpdated event to ${userId}`);
    managerConnections.forEach(res => {
      res.write(`event: assignmentUpdated\ndata: ${data}\n\n`);
    });
  }
};

// Basic request logging (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[req] ${req.method} ${req.url}`);
    next();
  });
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.env.NODE_ENV === 'development' ? 3001 : 3000);

app.get('/api/health', async (_req, res) => {
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    dbOk = false;
  }
  res.json({ status: 'ok', db: dbOk ? 'connected' : 'error', timestamp: new Date().toISOString() });
});

// Development helper: issue a signed JWT for quick testing
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/token', (req, res) => {
    try {
      const { secret } = getJWTConfig();
      const userId = (req.query.userId as string) || 'user_owner_a';
      const tenantId = (req.query.tenantId as string) || 'client_a';
      const role = (req.query.role as 'business_owner' | 'delegate' | 'platform_admin' | 'manager') || 'business_owner';
      const roles = [role]; // Convert single role to array
      const token = jwt.sign({ userId, tenantId, roles }, secret, { expiresIn: '1h' });
      res.json({ token });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to generate token' });
    }
  });
  app.get('/api/dev/admin-token', (_req, res) => {
    try {
      const { secret } = getJWTConfig();
      const roles = ['platform_admin'];
      const token = jwt.sign({ userId: 'user_admin', tenantId: 'platform_admin_client', roles }, secret, { expiresIn: '2h' });
      res.json({ token });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to generate admin token' });
    }
  });
}

// Server-Sent Events endpoint for real-time manager updates
// Note: EventSource doesn't support custom headers, so we accept token as query param
app.get('/api/admin/managers/updates', (req, res, next) => {
  // Extract token from query parameter if Authorization header missing
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }

  // Verify token manually (since authMiddleware won't work with query params)
  try {
    const { secret } = getJWTConfig();
    const decoded = jwt.verify(token, secret) as any;
    (req as any).user = decoded;
    
    // Only platform_admin can subscribe to manager updates
    if (!decoded.roles || !decoded.roles.includes('platform_admin')) {
      return res.status(403).json({ error: 'Unauthorized: platform_admin role required' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connection confirmation
    res.write(`:SSE connection established\n\n`);

    // Add this client to the set
    sseAdminClients.add(res);

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      sseAdminClients.delete(res);
      console.log('[SSE] Admin client disconnected');
    });
  } catch (e: any) {
    console.error('[SSE] Token verification failed:', e?.message);
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
});

// Manager SSE endpoint for real-time assignment updates
app.get('/api/manager/assignments/updates', (req, res) => {
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }

  try {
    const { secret } = getJWTConfig();
    const decoded = jwt.verify(token, secret) as any;
    const userId = decoded.userId;
    
    if (!userId) {
      return res.status(403).json({ error: 'Unauthorized: invalid token' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connection confirmation
    res.write(`:SSE connection established\n\n`);

    // Add this client to manager's set
    if (!sseManagerClients.has(userId)) {
      sseManagerClients.set(userId, new Set());
    }
    sseManagerClients.get(userId)!.add(res);

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      const managerSet = sseManagerClients.get(userId);
      if (managerSet) {
        managerSet.delete(res);
        if (managerSet.size === 0) {
          sseManagerClients.delete(userId);
        }
      }
      console.log(`[SSE] Manager ${userId} disconnected`);
    });
  } catch (e: any) {
    console.error('[SSE] Token verification failed:', e?.message);
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
});

// Admin routes (no tenant restriction, platform_admin can manage all clients)
app.use('/api/admin', authMiddleware, adminRoutes);

// Auth routes
app.use('/api/auth', authRoutes);

// Manager routes (auth only; no tenant middleware)
app.use('/api/manager', authMiddleware, managerRoutes);

// Auth + Tenant enforcement for protected tenant routes
app.use('/api', authMiddleware, tenantMiddleware);

app.use('/api/reports', reportRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/connection-permissions', connectionPermissionRoutes);

const server = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${PORT} is already in use. Run free-ports.ps1 or terminate the conflicting process (netstat -ano | findstr :${PORT}).`);
    process.exit(1);
  } else {
    console.error('[startup] Server error during listen:', err);
    process.exit(1);
  }
});

// Surface crashes for easier debugging
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
});
