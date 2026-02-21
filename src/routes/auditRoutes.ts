import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

/**
 * GET /api/audit/schedule-changes
 * Get audit trail for schedule changes
 * Query params:
 *   - scheduleId (optional): Filter by schedule
 *   - days (optional): Number of days to look back (default 30)
 */
router.get('/schedule-changes', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.tenantId!);
    const { scheduleId, days } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (parseInt(days as string) || 30));
    
    const where: any = {
      tenantId: tenantId,
      action: {
        in: [
          'SCHEDULE_CREATED',
          'SCHEDULE_CREATED_WITH_EXTERNAL',
          'SCHEDULE_RECIPIENTS_CHANGED',
          'SCHEDULE_EXTERNAL_RECIPIENT_ADDED',
          'SCHEDULE_EXTERNAL_RECIPIENT_REMOVED',
          'SCHEDULE_UPDATED',
          'SCHEDULE_DELETED',
          'SCHEDULE_PERMISSION_GRANTED',
          'SCHEDULE_PERMISSION_REVOKED'
        ]
      },
      createdAt: { gte: cutoff }
    };
    
    if (scheduleId) {
      where.resourceId = scheduleId.toString();
    }
    
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Fetch unique user IDs
    const userIds = [...new Set(logs.map(log => log.userId).filter((id): id is number => id !== null))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true }
    });
    
    const userMap = new Map(users.map(u => [u.id, u]));
    
    res.json({
      success: true,
      logs: logs.map(log => {
        const user = log.userId ? userMap.get(log.userId) : null;
        return {
          id: log.id,
          action: log.action,
          timestamp: log.createdAt,
          user: user ? {
            id: user.id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email
          } : {
            id: 0,
            name: 'Unknown User',
            email: 'unknown@unknown.com'
          },
          details: log.details,
          scheduleId: log.resourceId ? parseInt(log.resourceId) : null
        };
      })
    });
  } catch (error: any) {
    console.error('[audit] Get schedule changes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audit logs'
    });
  }
});

export default router;
