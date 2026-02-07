import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Get encryption key from environment
const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error('DB_ENCRYPTION_KEY environment variable is required');
}

const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');

interface EncryptedData {
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  options?: Record<string, unknown>;
}

function decryptOldSecret(iv: string, tag: string, cipherText: string): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(cipherText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptData(data: string): { iv: string; tag: string; cipherText: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), cipherText: encrypted };
}

async function main() {
  console.log('Starting encryption migration...');
  
  // Fetch all old connections using raw query since schema has changed
  const oldConnections = await prisma.$queryRaw<any[]>`
    SELECT 
      id, 
      client_id,
      name,
      engine, 
      host, 
      port, 
      database_name, 
      username, 
      secrets_enc_iv, 
      secrets_enc_tag, 
      secrets_enc_cipher,
      options_json
    FROM database_connections
  `;

  console.log(`Found ${oldConnections.length} connections to migrate`);

  for (const conn of oldConnections) {
    try {
      // Decrypt old password
      let password = '';
      if (conn.secrets_enc_iv && conn.secrets_enc_tag && conn.secrets_enc_cipher) {
        const secretJson = decryptOldSecret(conn.secrets_enc_iv, conn.secrets_enc_tag, conn.secrets_enc_cipher);
        const secrets = JSON.parse(secretJson || '{}');
        password = secrets.password || '';
      }

      // Build new encrypted data object
      const encryptedData: EncryptedData = {
        engine: conn.engine,
        host: conn.host,
        port: conn.port,
        database: conn.database_name,
        username: conn.username,
        password,
        options: conn.options_json ? (typeof conn.options_json === 'string' ? JSON.parse(conn.options_json) : conn.options_json) : undefined,
      };

      // Encrypt all data together
      const dataJson = JSON.stringify(encryptedData);
      const { iv, tag, cipherText } = encryptData(dataJson);

      // Update the record with new encrypted data
      await prisma.$executeRaw`
        UPDATE database_connections
        SET 
          data_enc_iv = ${iv},
          data_enc_tag = ${tag},
          data_enc_cipher = ${cipherText}
        WHERE id = ${conn.id}
      `;

      console.log(`✓ Migrated connection: ${conn.name} (${conn.id})`);
    } catch (error) {
      console.error(`✗ Failed to migrate connection ${conn.id}:`, error);
      throw error;
    }
  }

  console.log('Migration complete!');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
