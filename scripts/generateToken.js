// Simple script to output a signed JWT for dev testing
const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId: 'user_owner_a', tenantId: 'client_a', role: 'owner' }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '1h' });
console.log(token);
