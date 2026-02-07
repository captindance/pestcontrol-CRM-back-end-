import { readFileSync } from 'fs';
import { createHash } from 'crypto';

interface JWTConfig {
  secret: string;
  expiresIn: string;
}

/**
 * Calculate Shannon entropy to measure randomness of a string
 * Higher values indicate more randomness (good for secrets)
 */
function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  return Object.values(freq).reduce((sum, f) => {
    const p = f / str.length;
    return sum - p * Math.log2(p);
  }, 0);
}

/**
 * Validates JWT secret meets security requirements
 */
function validateJWTSecret(secret: string, env: string): void {
  const errors: string[] = [];
  
  // Basic presence check
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET is required but not provided');
  }
  
  // Length validation
  if (secret.length < 32) {
    errors.push(`JWT_SECRET must be at least 32 characters (current: ${secret.length})`);
  }
  
  // Production-specific validations
  if (env === 'production') {
    // Check for obvious development/test secrets
    const lowerSecret = secret.toLowerCase();
    const dangerousPatterns = ['dev', 'test', 'secret', 'changeme', 'change_me', 'password', 'example'];
    const foundPattern = dangerousPatterns.find(pattern => lowerSecret.includes(pattern));
    
    if (foundPattern) {
      errors.push(`JWT_SECRET contains suspicious pattern '${foundPattern}' - appears to be a development secret`);
    }
    
    // Entropy check - ensure sufficient randomness
    const entropy = calculateEntropy(secret);
    const minEntropy = 4.0; // Good randomness threshold
    
    if (entropy < minEntropy) {
      errors.push(`JWT_SECRET has insufficient entropy (${entropy.toFixed(2)} < ${minEntropy}) - use a cryptographically random secret`);
    }
    
    // Check for repeated characters (like "aaaaaaa...")
    const repeatedChars = /(.)\1{4,}/.test(secret);
    if (repeatedChars) {
      errors.push('JWT_SECRET contains repeated character sequences - use a more random secret');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`JWT_SECRET validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Load JWT secret from file (production)
 * Falls back to environment variable (development)
 */
function loadJWTSecret(): string {
  const env = process.env.NODE_ENV || 'development';
  const secretFilePath = process.env.JWT_SECRET_FILE;
  
  // Try file-based secret first (production approach)
  if (secretFilePath) {
    try {
      console.log(`[JWT Config] Loading JWT secret from file: ${secretFilePath}`);
      const secret = readFileSync(secretFilePath, 'utf8').trim();
      validateJWTSecret(secret, env);
      return secret;
    } catch (error) {
      if (env === 'production') {
        throw new Error(`FATAL: Cannot read JWT_SECRET_FILE at ${secretFilePath}: ${error}`);
      }
      console.warn(`[JWT Config] Failed to read JWT_SECRET_FILE, falling back to environment variable`);
    }
  }
  
  // Fall back to environment variable
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    if (env === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is not set in production');
    }
    throw new Error('JWT_SECRET must be set in environment variables or via JWT_SECRET_FILE');
  }
  
  validateJWTSecret(secret, env);
  return secret;
}

/**
 * Generate a secure JWT secret (for setup scripts)
 * Usage: node -e "require('./dist/config/jwt.config.js').generateSecureSecret()"
 */
export function generateSecureSecret(length: number = 64): string {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('base64');
}

/**
 * Initialize and validate JWT configuration
 * Call this at application startup
 */
export function initializeJWTConfig(): JWTConfig {
  const env = process.env.NODE_ENV || 'development';
  
  try {
    const secret = loadJWTSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    
    console.log(`✓ JWT configuration validated successfully (${env} environment)`);
    console.log(`  Secret length: ${secret.length} characters`);
    console.log(`  Entropy: ${calculateEntropy(secret).toFixed(2)} bits`);
    console.log(`  Token expiry: ${expiresIn}`);
    
    return { secret, expiresIn };
  } catch (error) {
    console.error('\n❌ JWT CONFIGURATION ERROR:');
    console.error((error as Error).message);
    console.error('\nTo generate a secure JWT secret, run:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"');
    console.error('\nThen set it in your environment:');
    console.error('  Development: Add to backend/.env file');
    console.error('  Production: Add to /opt/pestcontrol-backend/secrets/jwt.key\n');
    
    process.exit(1);
  }
}

// Singleton instance
let jwtConfig: JWTConfig | null = null;

/**
 * Get the JWT configuration (must call initializeJWTConfig first)
 */
export function getJWTConfig(): JWTConfig {
  if (!jwtConfig) {
    jwtConfig = initializeJWTConfig();
  }
  return jwtConfig;
}
