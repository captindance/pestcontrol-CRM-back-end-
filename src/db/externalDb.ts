import mysql from 'mysql2/promise';
import { decryptSecret, EncryptedPayload } from '../security/crypto.js';
import { prisma } from './prisma.js';

export async function connectExternalDb(clientId: string) {
  // Fetch database credentials from IntegrationSetting (kind=database, provider=mysql, clientId)
  const setting = await prisma.integrationSetting.findFirst({
    where: { kind: 'database', clientId, active: true } as any
  });
  if (!setting) throw new Error('External DB credentials not configured for client');

  // Parse non-sensitive config
  const cfg = setting.configJson as unknown as { host: string; port: number; databaseName: string };
  
  // Decrypt secrets
  const secretStr = decryptSecret({ iv: setting.secretsIv, tag: setting.secretsTag, cipherText: setting.secretsCipher });
  const secrets = JSON.parse(secretStr || '{}');
  const username = secrets.username || '';
  const password = secrets.password || '';

  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: username,
    password,
    database: cfg.databaseName,
    connectionLimit: 5
  });
}
