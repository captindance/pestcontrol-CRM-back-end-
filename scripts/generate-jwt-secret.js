#!/usr/bin/env node

/**
 * Generate a secure JWT secret for production use
 * Usage: node scripts/generate-jwt-secret.js
 */

const crypto = require('crypto');

console.log('\n=== JWT Secret Generator ===\n');

const secret = crypto.randomBytes(64).toString('base64');

console.log('Generated JWT Secret (store this securely):');
console.log(secret);
console.log('\n');

console.log('Setup Instructions:');
console.log('------------------');
console.log('Development:');
console.log('  1. Add to backend/.env file:');
console.log(`     JWT_SECRET=${secret}`);
console.log('\nProduction (Option 1 - Environment Variable):');
console.log('  1. Add to systemd environment file:');
console.log('     /etc/systemd/system/pestcontrol-api.service.d/secrets.conf');
console.log(`     Environment="JWT_SECRET=${secret}"`);
console.log('  2. Restart service: sudo systemctl restart pestcontrol-api');
console.log('\nProduction (Option 2 - File-Based - RECOMMENDED):');
console.log('  1. Create secret file:');
console.log('     sudo mkdir -p /opt/pestcontrol-backend/secrets');
console.log(`     echo "${secret}" | sudo tee /opt/pestcontrol-backend/secrets/jwt.key`);
console.log('     sudo chmod 400 /opt/pestcontrol-backend/secrets/jwt.key');
console.log('     sudo chown pestcontrol-api:pestcontrol-api /opt/pestcontrol-backend/secrets/jwt.key');
console.log('  2. Add to environment or .env:');
console.log('     JWT_SECRET_FILE=/opt/pestcontrol-backend/secrets/jwt.key');
console.log('  3. Restart service: sudo systemctl restart pestcontrol-api');
console.log('\n');

// Additional entropy info
const entropy = calculateEntropy(secret);
console.log(`Entropy: ${entropy.toFixed(2)} bits (>= 4.0 is good)`);
console.log(`Length: ${secret.length} characters (>= 32 required)\n`);

function calculateEntropy(str) {
  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  return Object.values(freq).reduce((sum, f) => {
    const p = f / str.length;
    return sum - p * Math.log2(p);
  }, 0);
}
