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
        // Allow tenant override for elevated roles via header `x-tenant-id`
        const overrideTenant = req.headers['x-tenant-id']?.trim();
        if (overrideTenant && (payload.roles.includes('platform_admin') || payload.roles.includes('manager'))) {
            req.tenantId = overrideTenant;
        }
        else {
            req.tenantId = payload.tenantId;
        }
        next();
    }
    catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
//# sourceMappingURL=auth.js.map