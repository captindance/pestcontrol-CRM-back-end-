import { prisma } from '../db/prisma.js';
import type { Prisma } from '@prisma/client';

type AuditAction = 'created' | 'updated' | 'deleted';

interface AuditEntry {
  userRoleId?: number | null;
  clientId?: number | null;
  userId?: number | null;
  changedBy?: number | null;
  action: AuditAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  requestId?: string | null;
}

export async function logUserRoleChange(entry: AuditEntry) {
  try {
    await prisma.userRoleAuditLog.create({
      data: {
        userRoleId: entry.userRoleId ?? null,
        clientId: entry.clientId ?? null,
        userId: entry.userId ?? null,
        changedBy: entry.changedBy ?? null,
        action: entry.action,
        field: entry.field ?? null,
        oldValue: entry.oldValue ?? null,
        newValue: entry.newValue ?? null,
        reason: entry.reason ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to log user role change', err);
  }
}