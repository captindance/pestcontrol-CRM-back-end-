import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { prisma } from './db/prisma.js';
import { initializeJWTConfig, getJWTConfig } from './config/jwt.config.js';
import { setupSSEEndpoints } from './services/sseService.js';
import { setupRoutes } from './services/routeService.js';

// Initialize and validate JWT configuration at startup
initializeJWTConfig();

const app = express();
app.use(cors());
app.use(express.json());

// Basic request logging (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[req] ${req.method} ${req.url}`);
    next();
  });
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.env.NODE_ENV === 'development' ? 3001 : 3000);

// Health check endpoint
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

// Setup SSE endpoints
setupSSEEndpoints(app);

// Setup all routes
setupRoutes(app);

// Start server
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