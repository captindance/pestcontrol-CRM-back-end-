import { prisma } from '../db/prisma.js';
export async function logUserRoleChange(entry) {
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
    }
    catch (err) {
        console.error('[audit] failed to log user role change', err);
    }
}
//# sourceMappingURL=auditService.js.map