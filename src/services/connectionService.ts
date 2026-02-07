import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import mysql from 'mysql2/promise';
import { prisma } from '../db/prisma.js';
import { encryptSecret, decryptSecret } from '../security/crypto.js';

export type DbEngine = 'mysql' | 'postgres' | 'sqlserver' | 'oracle' | 'snowflake' | 'other';

export interface ConnectionInput {
  name: string;
  engine: DbEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string; // write-only; optional on update
  options?: Prisma.InputJsonValue | null;
}

// All sensitive data encrypted - only display name and metadata exposed
// For authorized users (manager/owner/delegate/platform_admin), also expose host, port, database, and engine
export interface SafeConnection {
  id: number;
  clientId: number;
  name: string;
  engine?: string;  // Only included for authorized users
  host?: string;  // Only included for authorized users
  port?: number;  // Only included for authorized users
  database?: string;  // Only included for authorized users
  hasPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Decrypted connection with all details (only used server-side)
interface DecryptedConnection {
  id: number;
  clientId: number;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  options?: Prisma.JsonValue | null;
}

interface EncryptedData {
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  options?: Prisma.InputJsonValue | null;
}

function toSafe(conn: any, includeDetails = false): SafeConnection {
  const safe: SafeConnection = {
    id: conn.id,
    clientId: conn.clientId,
    name: conn.name,
    hasPassword: Boolean(conn.dataCipher),
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
  
  // For authorized users, decrypt and expose connection details
  if (includeDetails && conn.dataCipher) {
    try {
      const dataJson = decryptSecret({ iv: conn.dataIv, tag: conn.dataTag, cipherText: conn.dataCipher });
      const data: EncryptedData = JSON.parse(dataJson);
      safe.engine = data.engine;
      safe.host = data.host;
      safe.port = data.port;
      safe.database = data.database;
    } catch (err) {
      console.error('Failed to decrypt connection details for listing:', err);
    }
  }
  
  return safe;
}

async function ensureConnectionOwned(id: number, clientId: number) {
  const conn = await prisma.databaseConnection.findUnique({ where: { id } });
  if (!conn || conn.clientId !== clientId) return null;
  return conn;
}

export async function listConnections(clientId: number, includeDetails = false): Promise<SafeConnection[]> {
  const rows = await prisma.databaseConnection.findMany({ where: { clientId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  return rows.map(r => toSafe(r, includeDetails));
}

export async function createConnection(clientId: number, input: ConnectionInput): Promise<SafeConnection> {
  const encData: EncryptedData = {
    engine: input.engine,
    host: input.host,
    port: input.port,
    database: input.database,
    username: input.username,
    password: input.password || '',
    options: input.options ?? null,
  };
  const enc = encryptSecret(JSON.stringify(encData));
  const created = await prisma.databaseConnection.create({
    data: {
      clientId,
      name: input.name,
      dataIv: enc.iv,
      dataTag: enc.tag,
      dataCipher: enc.cipherText,
    }
  });
  return toSafe(created);
}

export async function updateConnection(clientId: number, id: number, input: ConnectionInput): Promise<SafeConnection | null> {
  const existing = await ensureConnectionOwned(id, clientId);
  if (!existing) return null;

  // Decrypt existing data
  const decrypted = decryptSecret({ 
    cipherText: existing.dataCipher, 
    iv: existing.dataIv, 
    tag: existing.dataTag 
  });
  const existingData: EncryptedData = JSON.parse(decrypted);

  // Update with new values, keeping old if not provided
  const updatedData: EncryptedData = {
    engine: input.engine ?? existingData.engine,
    host: input.host ?? existingData.host,
    port: input.port ?? existingData.port,
    database: input.database ?? existingData.database,
    username: input.username ?? existingData.username,
    password: (input.password && input.password.length > 0) ? input.password : existingData.password,
    options: input.options !== undefined ? input.options : existingData.options,
  };

  const enc = encryptSecret(JSON.stringify(updatedData));

  const updated = await prisma.databaseConnection.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      dataIv: enc.iv,
      dataTag: enc.tag,
      dataCipher: enc.cipherText,
    }
  });
  return toSafe(updated);
}

export async function deleteConnection(clientId: number, id: number): Promise<boolean> {
  const existing = await ensureConnectionOwned(id, clientId);
  if (!existing) return false;
  await prisma.databaseConnection.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

export async function getDecryptedConnection(clientId: number, id: number): Promise<DecryptedConnection | null> {
  const conn = await ensureConnectionOwned(id, clientId);
  if (!conn) return null;
  
  // Decrypt the data blob
  const dataJson = decryptSecret({ iv: conn.dataIv, tag: conn.dataTag, cipherText: conn.dataCipher });
  const data: EncryptedData = JSON.parse(dataJson);
  
  return {
    id: conn.id,
    clientId: conn.clientId,
    name: conn.name,
    engine: data.engine,
    host: data.host,
    port: data.port,
    database: data.database,
    username: data.username,
    password: data.password || '',
    options: data.options as any ?? null,
  };
}

export async function testConnection(
  clientId: number,
  id: number | null,
  overridePassword?: string,
  unsavedData?: { engine: string; host: string; port: number; database: string; username: string; options?: Record<string, unknown> }
): Promise<{ ok: boolean; message?: string; }> {
  let conn;
  
  if (unsavedData) {
    // Testing unsaved connection with provided data
    const password = overridePassword;
    if (!password) return { ok: false, message: 'Password is missing' };
    
    conn = {
      engine: unsavedData.engine,
      host: unsavedData.host,
      port: unsavedData.port,
      database: unsavedData.database,
      username: unsavedData.username,
      password,
      options: unsavedData.options
    };
  } else {
    // Testing saved connection
    if (!id) return { ok: false, message: 'Connection ID required' };
    conn = await getDecryptedConnection(clientId, id);
    if (!conn) return { ok: false, message: 'Connection not found for tenant' };
    const password = overridePassword ?? conn.password;
    if (!password) return { ok: false, message: 'Password is missing' };
    conn = { ...conn, password };
  }

  if (conn.engine === 'mysql') {
    try {
      const opts = (conn.options && typeof conn.options === 'object' && !Array.isArray(conn.options))
        ? conn.options as Record<string, unknown>
        : {};
      const ssl = (opts as Record<string, unknown>).ssl ? {} : undefined;
      const connection = await mysql.createConnection({
        host: conn.host,
        port: conn.port,
        user: conn.username,
        password: conn.password,
        database: conn.database,
        ssl,
        connectTimeout: 4000,
      });
      await connection.execute('SELECT 1');
      await connection.end();
      return { ok: true };
    } catch (err: any) {
      // Provide user-friendly error messages
      const errorCode = err?.code;
      const errorMessage = err?.message || '';
      
      if (errorCode === 'ENOTFOUND') {
        return { ok: false, message: `Cannot reach host "${conn.host}". Please check that the hostname is correct and the server is accessible.` };
      }
      if (errorCode === 'ECONNREFUSED') {
        return { ok: false, message: `Connection refused on ${conn.host}:${conn.port}. Please verify the host and port are correct and the server is running.` };
      }
      if (errorCode === 'ECONNRESET') {
        return { ok: false, message: `Connection was reset by the server. The server may be overloaded or rejecting the connection.` };
      }
      if (errorCode === 'ETIMEDOUT' || errorCode === 'EHOSTUNREACH') {
        return { ok: false, message: `Connection timed out connecting to ${conn.host}:${conn.port}. The host may be unreachable or the network is slow.` };
      }
      if (errorMessage.includes('Access denied')) {
        return { ok: false, message: `Authentication failed. Please check your username and password.` };
      }
      if (errorMessage.includes('Unknown database')) {
        return { ok: false, message: `Database "${conn.database}" does not exist. Please check the database name.` };
      }
      if (errorMessage.includes('too many connections')) {
        return { ok: false, message: `Too many connections to the database. Please try again later.` };
      }
      
      // Fallback for unexpected errors
      return { ok: false, message: `Connection failed: ${errorMessage || 'Unknown error'}` };
    }
  }

  // Engines not yet implemented
  return { ok: false, message: `Engine ${conn.engine} not supported for live test yet` };
}

export async function connectionInUse(id: number): Promise<number> {
  return await prisma.report.count({ where: { connectionId: id } });
}
