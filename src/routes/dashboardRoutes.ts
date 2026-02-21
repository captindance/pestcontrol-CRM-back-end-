import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

/**
 * GET /api/dashboard/external-schedules
 * Get all active schedules with external recipients
 */
router.get('/external-schedules', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.tenantId!);
    
    // Get all active schedules for this tenant
    const schedules = await prisma.reportSchedule.findMany({
      where: {
        clientId: tenantId,
        isEnabled: true,
        deletedAt: null,
        recipients: {
          some: {
            isExternal: true  // Use the indexed column from Phase 0
          }
        }
      },
      include: {
        recipients: {
          where: {
            isExternal: true  // Only include external recipients
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        report: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        nextRunAt: 'asc'
      },
      take: 50  // Limit for performance
    });
    
    // Transform to widget-friendly format
    const analysis = schedules.map(schedule => ({
      id: schedule.id,
      name: schedule.name,
      reportId: schedule.report.id,
      reportName: schedule.report.name,
      createdBy: {
        id: schedule.creator.id,
        name: `${schedule.creator.firstName} ${schedule.creator.lastName}`,
        email: schedule.creator.email
      },
      externalRecipients: schedule.recipients.map(r => r.email),
      externalCount: schedule.recipients.length,
      frequency: schedule.frequency,
      nextRunAt: schedule.nextRunAt,
      timeOfDay: schedule.timeOfDay
    }));
    
    res.json({
      success: true,
      total: analysis.length,
      schedules: analysis
    });
  } catch (error: any) {
    console.error('[dashboard] Get external schedules error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get external schedules'
    });
  }
});

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.tenantId!);
    
    const [totalSchedules, activeSchedules, externalSchedules, recentExecutions] = await Promise.all([
      prisma.reportSchedule.count({
        where: { clientId: tenantId, deletedAt: null }
      }),
      prisma.reportSchedule.count({
        where: { clientId: tenantId, isEnabled: true, deletedAt: null }
      }),
      prisma.reportSchedule.count({
        where: {
          clientId: tenantId,
          deletedAt: null,
          recipients: { some: { isExternal: true } }
        }
      }),
      prisma.reportScheduleExecution.count({
        where: {
          schedule: { clientId: tenantId },
          startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);
    
    res.json({
      success: true,
      stats: {
        totalSchedules,
        activeSchedules,
        externalSchedules,
        recentExecutions
      }
    });
  } catch (error: any) {
    console.error('[dashboard] Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats'
    });
  }
});

export default router;
