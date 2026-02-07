const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'dev_secret';
const token = jwt.sign({ userId: 'user_owner_a', tenantId: 'client_a', role: 'business_owner' }, secret, { expiresIn: '1h' });
console.log(token);
