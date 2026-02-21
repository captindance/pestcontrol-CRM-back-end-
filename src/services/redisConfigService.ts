import { prisma } from '../db/prisma.js';
import { encryptSecret, decryptSecret } from '../security/crypto.js';
import crypto from 'crypto';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

/**
 * Load Redis configuration from database
 * Falls back to environment variables if not in DB
 */
export async function loadRedisConfig(): Promise<RedisConfig> {
  try {
    // Try to load from database first
    const integration = await prisma.integrationSetting.findFirst({
      where: {
        kind: 'queue',
        provider: 'redis',
        active: true,
        clientId: null // Platform-wide setting
      }
    });

    if (integration) {
      console.log('[redis-config] Loading Redis configuration from database');
      
      const config = integration.configJson as any;
      
      // Decrypt password if present
      let password: string | undefined = undefined;
      if (integration.secretsIv && integration.secretsTag && integration.secretsCipher) {
        try {
          const secretsStr = decryptSecret({
            iv: integration.secretsIv,
            tag: integration.secretsTag,
            cipherText: integration.secretsCipher
          });
          const secrets = JSON.parse(secretsStr || '{}');
          password = secrets.password;
        } catch (error) {
          console.error('[redis-config] Failed to decrypt Redis password:', error);
        }
      }

      return {
        host: config.host || 'localhost',
        port: config.port || 6379,
        password
      };
    }

    // Fallback to environment variables
    console.log('[redis-config] No database configuration found, using environment variables');
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    };
  } catch (error) {
    console.error('[redis-config] Error loading Redis configuration:', error);
    
    // Final fallback to defaults
    return {
      host: 'localhost',
      port: 6379
    };
  }
}

/**
 * Save Redis configuration to database
 */
export async function saveRedisConfig(config: RedisConfig): Promise<void> {
  try {
    const configJson = {
      host: config.host,
      port: config.port
    };

    // Encrypt password if provided
    let secretsEncrypted = null;
    if (config.password) {
      const secretsObj = { password: config.password };
      secretsEncrypted = encryptSecret(JSON.stringify(secretsObj));
    } else {
      // Empty secrets still need to be encrypted
      secretsEncrypted = encryptSecret('{}');
    }

    // Check if configuration already exists
    const existing = await prisma.integrationSetting.findFirst({
      where: {
        kind: 'queue',
        provider: 'redis',
        clientId: null
      }
    });

    if (existing) {
      // Update existing
      await prisma.integrationSetting.update({
        where: { id: existing.id },
        data: {
          configJson,
          secretsIv: secretsEncrypted.iv,
          secretsTag: secretsEncrypted.tag,
          secretsCipher: secretsEncrypted.cipherText,
          active: true,
          updatedAt: new Date()
        }
      });
      console.log('[redis-config] Updated Redis configuration in database');
    } else {
      // Create new
      await prisma.integrationSetting.create({
        data: {
          kind: 'queue',
          provider: 'redis',
          clientId: null, // Platform-wide
          configJson,
          secretsIv: secretsEncrypted.iv,
          secretsTag: secretsEncrypted.tag,
          secretsCipher: secretsEncrypted.cipherText,
          active: true
        }
      });
      console.log('[redis-config] Saved Redis configuration to database');
    }
  } catch (error) {
    console.error('[redis-config] Failed to save Redis configuration:', error);
    throw error;
  }
}

/**
 * Initialize Redis configuration in database from environment variables
 * Run this once during setup
 */
export async function initializeRedisConfig(): Promise<void> {
  try {
    // Check if already initialized
    const existing = await prisma.integrationSetting.findFirst({
      where: {
        kind: 'queue',
        provider: 'redis',
        clientId: null
      }
    });

    if (existing) {
      console.log('[redis-config] Redis configuration already exists in database');
      return;
    }

    // Initialize from environment variables
    const config: RedisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    };

    try {
      await saveRedisConfig(config);
      console.log('[redis-config] ✓ Redis configuration initialized in database');
    } catch (error: any) {
      // Handle race condition: another instance may have created it simultaneously
      if (error.code === 'P2002') { // Unique constraint violation
        console.log('[redis-config] ✓ Config created by another instance (race condition handled gracefully)');
        return;
      }
      throw error; // Re-throw if it's a different error
    }
  } catch (error) {
    console.error('[redis-config] Failed to initialize Redis configuration:', error);
    throw error;
  }
}

/**
 * Generate secure Redis password if not set
 */
export function generateRedisPassword(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Get Redis configuration (for admin display)
 */
export async function getRedisConfig(): Promise<{ host: string; port: number; hasPassword: boolean } | null> {
  try {
    const integration = await prisma.integrationSetting.findFirst({
      where: {
        kind: 'queue',
        provider: 'redis',
        clientId: null
      }
    });

    if (!integration) {
      return null;
    }

    const config = integration.configJson as any;
    
    // Check if password exists without decrypting
    let hasPassword = false;
    if (integration.secretsIv && integration.secretsTag && integration.secretsCipher) {
      try {
        const secretsStr = decryptSecret({
          iv: integration.secretsIv,
          tag: integration.secretsTag,
          cipherText: integration.secretsCipher
        });
        const secrets = JSON.parse(secretsStr || '{}');
        hasPassword = !!secrets.password;
      } catch {
        hasPassword = false;
      }
    }

    return {
      host: config.host || 'localhost',
      port: config.port || 6379,
      hasPassword
    };
  } catch (error) {
    console.error('[redis-config] Error getting Redis configuration:', error);
    return null;
  }
}

/**
 * Update Redis password only
 */
export async function updateRedisPassword(password: string): Promise<void> {
  try {
    const existing = await prisma.integrationSetting.findFirst({
      where: {
        kind: 'queue',
        provider: 'redis',
        clientId: null
      }
    });

    if (!existing) {
      throw new Error('Redis configuration not found');
    }

    const config = existing.configJson as any;
    
    await saveRedisConfig({
      host: config.host,
      port: config.port,
      password
    });

    console.log('[redis-config] Redis password updated');
  } catch (error) {
    console.error('[redis-config] Failed to update Redis password:', error);
    throw error;
  }
}
