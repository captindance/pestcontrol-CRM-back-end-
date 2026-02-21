import jwt from 'jsonwebtoken';
import { getJWTConfig } from '../config/jwt.config.js';
export const authMiddleware = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header)
        return res.status(401).json({ error: 'Missing Authorization header' });
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token)
        return res.status(401).json({ error: 'Invalid auth format' });
    try {
        const { secret } = getJWTConfig();
        const payload = jwt.verify(token, secret);
        req.user = {
            ...payload,
            hasRole: async (role, clientId) => {
                // Placeholder for role checking - can be extended if needed
                return payload.roles.includes(role);
            }
        };
        // SECURITY FIX: Only set tenantId from JWT token
        // Platform admins and managers will have access validated by tenantMiddleware
        // NEVER trust x-tenant-id header at this stage
        req.tenantId = payload.tenantId;
        next();
    }
    catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
//# sourceMappingURL=auth.js.map