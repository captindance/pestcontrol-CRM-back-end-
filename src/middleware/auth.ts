import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { getJWTConfig } from '../config/jwt.config.js';

export type Role = 'business_owner' | 'delegate' | 'platform_admin' | 'manager' | 'viewer';

export interface AuthTokenPayload {
  userId: string;
  tenantId?: string; // client id (optional for manager/platform_admin)
  roles: Role[];  // All roles from user_roles table
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload & { hasRole: (role: Role, clientId?: number) => Promise<boolean> };
      tenantId?: string;
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing Authorization header' });
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Invalid auth format' });
  try {
    const { secret } = getJWTConfig();
    const payload = jwt.verify(token, secret) as AuthTokenPayload;
    
    req.user = { 
      ...payload,
      hasRole: async (role: Role, clientId?: number) => {
        // Placeholder for role checking - can be extended if needed
        return payload.roles.includes(role);
      }
    };
    
    // Allow tenant override for elevated roles via header `x-tenant-id`
    const overrideTenant = (req.headers['x-tenant-id'] as string | undefined)?.trim();
    if (overrideTenant && (payload.roles.includes('platform_admin') || payload.roles.includes('manager'))) {
      req.tenantId = overrideTenant;
    } else {
      req.tenantId = payload.tenantId;
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
