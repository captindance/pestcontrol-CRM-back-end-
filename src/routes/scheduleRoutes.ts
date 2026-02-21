import express, { Request, Response } from 'express';
import { 
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getScheduleById,
  listSchedules,
  getScheduleExecutions,
  CreateScheduleInput,
  UpdateScheduleInput
} from '../services/scheduleService.js';
import { queueScheduleExecution } from '../services/queueService.js';
import { ValidationError } from '../services/inputValidationService.js';
import { EmailSecurityViolation } from '../services/emailSecurityService.js';
import { logInvalidInput, logRateLimitExceeded } from '../services/auditLogService.js';
import { userHasPermission } from '../services/permissionService.js';

const router = express.Router();

/**
 * POST /api/schedules
 * Create a new schedule
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const tenantId = parseInt(req.tenantId!);

    // Check canScheduleReports permission
    const hasPermission = await userHasPermission(userId, tenantId, 'canScheduleReports');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to create schedules'
      });
    }

    const input: CreateScheduleInput = {
      clientId: tenantId,
      userId,
      reportId: req.body.reportId,
      name: req.body.name,
      frequency: req.body.frequency,
      timeOfDay: req.body.timeOfDay,
      timezone: req.body.timezone,
      dayOfWeek: req.body.dayOfWeek,
      dayOfMonth: req.body.dayOfMonth,
      recipients: req.body.recipients,
      emailSecurityLevel: req.body.emailSecurityLevel
    };

    const schedule = await createSchedule(input);

    res.status(201).json({
      success: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        frequency: schedule.frequency,
        timeOfDay: schedule.timeOfDay,
        timezone: schedule.timezone,
        nextRunAt: schedule.nextRunAt,
        isEnabled: schedule.isEnabled,
        createdAt: schedule.createdAt
      }
    });
  } catch (error: any) {
    console.error('[schedules] Create error:', error);

    if (error instanceof ValidationError) {
      await logInvalidInput(req, error.field || 'unknown', '', error.message);
      return res.status(400).json({
        success: false,
        error: error.message,
        field: error.field
      });
    }

    if (error instanceof EmailSecurityViolation) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('Maximum of 10 active schedules')) {
      await logRateLimitExceeded(req, 'schedules_per_tenant', -1, 10);
      return res.status(429).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create schedule'
    });
  }
});

/**
 * GET /api/schedules
 * List all schedules for tenant
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.tenantId!);
    const includeDisabled = req.query.includeDisabled !== 'false'; // default true
    const reportId = req.query.reportId ? parseInt(req.query.reportId as string) : undefined;

    const schedules = await listSchedules(tenantId, { includeDisabled, reportId });

    res.json({
      success: true,
      schedules: schedules.map((s: any) => ({
        id: s.id,
        name: s.name,
        reportId: s.reportId,
        reportName: s.report?.name,
        frequency: s.frequency,
        timeOfDay: s.timeOfDay,
        timezone: s.timezone,
        dayOfWeek: s.dayOfWeek,
        dayOfMonth: s.dayOfMonth,
        nextRunAt: s.nextRunAt,
        isEnabled: s.isEnabled,
        recipients: s.recipients.map((r: any) => r.email),
        createdBy: s.createdBy,
        lastModifiedBy: s.lastModifiedBy,
        lastModifiedAt: s.lastModifiedAt,
        creator: s.creator ? { firstName: s.creator.firstName, lastName: s.creator.lastName } : null,
        modifier: s.modifier ? { firstName: s.modifier.firstName, lastName: s.modifier.lastName } : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    });
  } catch (error: any) {
    console.error('[schedules] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list schedules'
    });
  }
});

/**
 * GET /api/schedules/:id
 * Get schedule by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.tenantId!);
    const scheduleId = req.params.id;

    const schedule = await getScheduleById(scheduleId, tenantId);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Not found'
      });
    }

    res.json({
      success: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        reportId: schedule.reportId,
        reportName: (schedule as any).report?.name,
        frequency: schedule.frequency,
        timeOfDay: schedule.timeOfDay,
        timezone: schedule.timezone,
        dayOfWeek: schedule.dayOfWeek,
        dayOfMonth: schedule.dayOfMonth,
        nextRunAt: schedule.nextRunAt,
        isEnabled: schedule.isEnabled,
        recipients: schedule.recipients.map(r => r.email),
        emailSecurityLevel: schedule.emailSecurityLevel,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt
      }
    });
  } catch (error: any) {
    console.error('[schedules] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedule'
    });
  }
});

/**
 * PATCH /api/schedules/:id
 * Update schedule
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const tenantId = parseInt(req.tenantId!);
    const scheduleId = req.params.id;

    // Check canScheduleReports permission
    const hasPermission = await userHasPermission(userId, tenantId, 'canScheduleReports');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to modify schedules'
      });
    }

    const updates: UpdateScheduleInput = {
      name: req.body.name,
      frequency: req.body.frequency,
      timeOfDay: req.body.timeOfDay,
      timezone: req.body.timezone,
      dayOfWeek: req.body.dayOfWeek,
      dayOfMonth: req.body.dayOfMonth,
      recipients: req.body.recipients,
      isEnabled: req.body.isEnabled
    };

    const schedule = await updateSchedule(scheduleId, tenantId, userId, updates);

    res.json({
      success: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        frequency: schedule.frequency,
        timeOfDay: schedule.timeOfDay,
        nextRunAt: schedule.nextRunAt,
        isEnabled: schedule.isEnabled,
        updatedAt: schedule.updatedAt
      }
    });
  } catch (error: any) {
    console.error('[schedules] Update error:', error);

    if (error.message === 'Schedule not found') {
      return res.status(404).json({
        success: false,
        error: 'Not found'
      });
    }

    if (error instanceof ValidationError) {
      await logInvalidInput(req, error.field || 'unknown', '', error.message);
      return res.status(400).json({
        success: false,
        error: error.message,
        field: error.field
      });
    }

    if (error instanceof EmailSecurityViolation) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update schedule'
    });
  }
});

/**
 * DELETE /api/schedules/:id
 * Delete schedule (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const tenantId = parseInt(req.tenantId!);
    const scheduleId = req.params.id;

    // Check canScheduleReports permission
    const hasPermission = await userHasPermission(userId, tenantId, 'canScheduleReports');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete schedules'
      });
    }

    await deleteSchedule(scheduleId, tenantId, userId);

    res.json({
      success: true,
      message: 'Schedule deleted'
    });
  } catch (error: any) {
    console.error('[schedules] Delete error:', error);

    if (error.message === 'Schedule not found') {
      return res.status(404).json({
        success: false,
        error: 'Not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete schedule'
    });
  }
});

/**
 * GET /api/schedules/:id/executions
 * Get execution history for schedule
 */
router.get('/:id/executions', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.tenantId!);
    const scheduleId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const executions = await getScheduleExecutions(scheduleId, tenantId, limit);

    res.json({
      success: true,
      executions: executions.map(e => ({
        id: e.id,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        status: e.status,
        emailsSent: e.emailsSent,
        emailsFailed: e.emailsFailed,
        errorMessage: e.errorMessage
      }))
    });
  } catch (error: any) {
    console.error('[schedules] Get executions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get executions'
    });
  }
});

/**
 * POST /api/schedules/:id/run
 * Manually trigger schedule execution
 */
router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const tenantId = parseInt(req.tenantId!);
    const scheduleId = req.params.id;

    const schedule = await getScheduleById(scheduleId, tenantId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Not found'
      });
    }

    const job = await queueScheduleExecution(
      scheduleId,
      tenantId,
      schedule.reportId,
      userId
    );

    res.json({
      success: true,
      message: 'Schedule queued for execution',
      jobId: job.id
    });
  } catch (error: any) {
    console.error('[schedules] Run error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to queue schedule'
    });
  }
});

export default router;
