import jwt from 'jsonwebtoken';
import { getJWTConfig } from '../config/jwt.config.js';
import { Request, Response, Application } from 'express';

// SSE: store connected clients for admin updates
export const sseAdminClients = new Set<any>();

// SSE: store connected managers by userId for assignment updates
export const sseManagerClients = new Map<string, Set<any>>();

// Export global function to notify admins of manager verification
export function notifyManagerUpdate() {
  const data = JSON.stringify({ type: 'managerVerified', timestamp: new Date().toISOString() });
  console.log('[SSE] Broadcasting managerVerified event to', sseAdminClients.size, 'admin clients');
  sseAdminClients.forEach(res => {
    res.write(`event: managerVerified\ndata: ${data}\n\n`);
  });
}

// Export global function to notify a specific manager of assignment updates
export function notifyManagerAssignmentUpdate(userId: string) {
  const data = JSON.stringify({ type: 'assignmentUpdated', timestamp: new Date().toISOString() });
  const managerConnections = sseManagerClients.get(userId);
  if (managerConnections && managerConnections.size > 0) {
    console.log(`[SSE] Broadcasting assignmentUpdated event to ${userId}`);
    managerConnections.forEach(res => {
      res.write(`event: managerUpdated\ndata: ${data}\n\n`);
    });
  }
}

// Setup SSE endpoints
export function setupSSEEndpoints(app: Application) {
  // Server-Sent Events endpoint for real-time manager updates
  app.get('/api/admin/managers/updates', (req: Request, res: Response, next: any) => {
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
      if (decoded.role !== 'platform_admin') {
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
  app.get('/api/manager/assignments/updates', (req: Request, res: Response) => {
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
}

// Make functions globally available
(global as any).notifyManagerUpdate = notifyManagerUpdate;
(global as any).notifyManagerAssignmentUpdate = notifyManagerAssignmentUpdate;