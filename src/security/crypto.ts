import crypto from 'crypto';

const KEY_HEX = process.env.DB_ENCRYPTION_KEY || ''; // Expect 64 hex chars for 32 bytes

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('DB_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Validate that encryption key is properly configured
 * Should be called at startup before any encryption operations
 */
export function validateEncryptionKey(): void {
  try {
    getKey(); // Will throw if key is invalid
    console.log('[crypto] ✓ Encryption key validated');
  } catch (error: any) {
    console.error('[crypto] ✗ Encryption key validation failed:', error.message);
    throw new Error('DB_ENCRYPTION_KEY is not properly configured. Server cannot start.');
  }
}

export interface EncryptedPayload {
  iv: string; // hex
  tag: string; // hex
  cipherText: string; // hex
}

export function encryptSecret(plain: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM recommended 96-bit nonce
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), cipherText: enc.toString('hex') };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, 'hex')),
    decipher.final()
  ]);
  return dec.toString('utf8');
}
