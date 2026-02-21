import { prisma } from '../db/prisma.js';
import { 
  ScheduleFrequency, 
  ReportSchedule, 
  ReportScheduleRecipient,
  ReportScheduleExecution,
  ExecutionStatus 
} from '@prisma/client';
import { 
  validateScheduleFrequency,
  validateStringInput,
  validateIntegerInput,
  validateTimezone,
  validateArrayInput,
  validateEmailInput,
  ValidationError
} from './inputValidationService.js';
import { validateEmailSend, DataClassification } from './emailSecurityService.js';
import { 
  logAudit,
  AuditAction,
  AuditSeverity
} from './auditLogService.js';

// Approved emails for sending
const APPROVED_EMAILS = [
  'captindanceman@yahoo.com',
  'captaindanceman@gmail.com'
];

/**
 * Validate that all recipient emails are in the approved list
 */
function validateApprovedEmails(recipients: string[]): void {
  const invalid = recipients.filter(email => !APPROVED_EMAILS.includes(email.toLowerCase().trim()));
  if (invalid.length > 0) {
    throw new ValidationError(`Email addresses not approved: ${invalid.join(', ')}`, 'recipients');
  }
}

/**
 * Detect external recipients using email validation service
 */
async function detectExternalRecipients(
  recipients: string[],
  clientId: number
): Promise<{
  hasExternal: boolean;
  externalEmails: string[];
  internalEmails: string[];
}> {
  const external: string[] = [];
  const internal: string[] = [];
  
  for (const email of recipients) {
    const domain = email.split('@')[1];
    
    // For now, consider all emails as internal (since we validate against approved list)
    // In production, this would check against client's allowed email domains
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { allowedEmailDomains: true }
    });
    
    let isExternal = false;
    
    if (client?.allowedEmailDomains) {
      try {
        const allowedDomains = JSON.parse(client.allowedEmailDomains);
        isExternal = !allowedDomains.includes(domain);
      } catch {
        // If parsing fails, treat as external
        isExternal = true;
      }
    } else {
      // No allowed domains configured - consider external
      isExternal = true;
    }
    
    if (isExternal) {
      external.push(email);
    } else {
      internal.push(email);
    }
  }
  
  return {
    hasExternal: external.length > 0,
    externalEmails: external,
    internalEmails: internal
  };
}

export interface CreateScheduleInput {
  clientId: number;
  userId: number;
  reportId: number;
  name: string;
  frequency: ScheduleFrequency;
  timeOfDay: string; // "HH:MM" format
  timezone?: string;
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  recipients: string[];
  emailSecurityLevel?: string;
}

export interface UpdateScheduleInput {
  name?: string;
  frequency?: ScheduleFrequency;
  timeOfDay?: string;
  timezone?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipients?: string[];
  isEnabled?: boolean;
}

/**
 * Validate schedule input data
 */
function validateScheduleInput(input: CreateScheduleInput): void {
  // Validate name
  validateStringInput(input.name, 'name', { maxLength: 255 });

  // Validate frequency
  validateScheduleFrequency(input.frequency);

  // Validate time format (HH:MM)
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(input.timeOfDay)) {
    throw new ValidationError('timeOfDay must be in HH:MM format (00:00 to 23:59)', 'timeOfDay');
  }

  // Validate timezone (optional - being phased out)
  // TODO: Remove timezone field entirely - frontend should send UTC times
  if (input.timezone) {
    validateTimezone(input.timezone);
  }

  // Validate day of week for weekly schedules
  if (input.frequency === 'weekly') {
    if (input.dayOfWeek === undefined) {
      throw new ValidationError('dayOfWeek is required for weekly schedules', 'dayOfWeek');
    }
    const dow = validateIntegerInput(input.dayOfWeek, 'dayOfWeek', { min: 0, max: 6, required: true });
    if (dow === null) {
      throw new ValidationError('dayOfWeek is required for weekly schedules', 'dayOfWeek');
    }
  }

  // Validate day of month for monthly schedules
  if (input.frequency === 'monthly') {
    if (input.dayOfMonth === undefined) {
      throw new ValidationError('dayOfMonth is required for monthly schedules', 'dayOfMonth');
    }
    const dom = validateIntegerInput(input.dayOfMonth, 'dayOfMonth', { min: 1, max: 31, required: true });
    if (dom === null) {
      throw new ValidationError('dayOfMonth is required for monthly schedules', 'dayOfMonth');
    }
  }

  // Validate recipients
  const validatedRecipients = validateArrayInput(
    input.recipients,
    'recipients',
    (email: any) => validateEmailInput(email, 'recipient'),
    { minLength: 1, maxLength: 5 }
  );

  if (validatedRecipients.length === 0) {
    throw new ValidationError('At least one recipient is required', 'recipients');
  }
}

/**
 * Calculate next run time based on frequency and schedule settings
 */
export function calculateNextRunTime(
  frequency: ScheduleFrequency,
  timeOfDay: string,
  timezone: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate: Date = new Date()
): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const now = new Date(fromDate);
  const next = new Date(now);
  
  next.setUTCHours(hours, minutes, 0, 0);

  switch (frequency) {
    case 'daily':
      // Run tomorrow at specified time if today's time has passed
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case 'weekly':
      // Find next occurrence of specified day of week
      const targetDay = dayOfWeek ?? 0;
      const currentDay = next.getUTCDay();
      let daysToAdd = targetDay - currentDay;
      
      if (daysToAdd < 0 || (daysToAdd === 0 && next <= now)) {
        daysToAdd += 7;
      }
      
      next.setUTCDate(next.getUTCDate() + daysToAdd);
      break;

    case 'monthly': {
      // Run on specified day of month, clamped to last valid day of that month
      const targetDate = dayOfMonth ?? 1;
      const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(targetDate, daysInMonth));

      if (next <= now) {
        // Reset to day 1 before incrementing month to prevent date overflow (e.g. Mar 31 + 1 month → May 1)
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + 1);
        const dim2 = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDate, dim2));
      }
      break;
    }

    case 'quarterly': {
      const targetDate = dayOfMonth ?? 1;
      const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(targetDate, daysInMonth));
      if (next <= now) {
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + 3);
        const dim2 = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDate, dim2));
      }
      break;
    }

    case 'semi_annually': {
      const targetDate = dayOfMonth ?? 1;
      const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(targetDate, daysInMonth));
      if (next <= now) {
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + 6);
        const dim2 = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDate, dim2));
      }
      break;
    }

    case 'annually': {
      // Run on dayOfMonth of January (or Jan 1 if not set)
      const targetDate = dayOfMonth ?? 1;
      next.setUTCMonth(0);
      const daysInJan = 31;
      next.setUTCDate(Math.min(targetDate, daysInJan));
      if (next <= now) {
        next.setUTCFullYear(next.getUTCFullYear() + 1);
      }
      break;
    }
  }

  return next;
}

/**
 * Create a new schedule
 */
export async function createSchedule(input: CreateScheduleInput): Promise<ReportSchedule> {
  // Validate input
  validateScheduleInput(input);

  // CRITICAL: Validate approved emails
  validateApprovedEmails(input.recipients);

  // Detect external recipients
  const recipientAnalysis = await detectExternalRecipients(
    input.recipients,
    input.clientId
  );

  // Validate email security
  await validateEmailSend(
    input.userId,
    input.clientId,
    input.recipients,
    `Scheduled Report: ${input.name}`,
    DataClassification.INTERNAL
  );

  // Check rate limit: max 10 schedules per tenant
  const activeCount = await prisma.reportSchedule.count({
    where: {
      clientId: input.clientId,
      isEnabled: true,
      deletedAt: null
    }
  });

  if (activeCount >= 10) {
    throw new ValidationError('Maximum of 10 active schedules per tenant', 'schedule');
  }

  // Calculate next run time
  const nextRunAt = calculateNextRunTime(
    input.frequency,
    input.timeOfDay,
    input.timezone || 'America/New_York',
    input.dayOfWeek,
    input.dayOfMonth
  );

  // Create schedule with createdBy
  const schedule = await prisma.reportSchedule.create({
    data: {
      clientId: input.clientId,
      userId: input.userId,
      reportId: input.reportId,
      name: input.name,
      frequency: input.frequency,
      timeOfDay: input.timeOfDay,
      timezone: input.timezone || 'America/New_York',
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      nextRunAt,
      emailSecurityLevel: input.emailSecurityLevel || 'internal',
      createdBy: input.userId
    }
  });

  // Create recipients with domain and isExternal flags
  const recipientRecords = input.recipients.map(email => {
    const trimmed = email.trim();
    const domain = trimmed.split('@')[1];
    const isExternal = recipientAnalysis.externalEmails.includes(trimmed);
    
    return {
      scheduleId: schedule.id,
      email: trimmed,
      domain,
      isExternal
    };
  });

  await prisma.reportScheduleRecipient.createMany({
    data: recipientRecords
  });

  // Log appropriate action based on whether external recipients exist
  await logAudit({
    action: recipientAnalysis.hasExternal
      ? AuditAction.SCHEDULE_CREATED_WITH_EXTERNAL
      : AuditAction.SCHEDULE_CREATED,
    severity: AuditSeverity.INFO,
    userId: input.userId,
    tenantId: input.clientId,
    resourceType: 'schedule',
    resourceId: schedule.id,
    details: {
      scheduleName: schedule.name,
      reportId: schedule.reportId,
      frequency: schedule.frequency,
      hasExternal: recipientAnalysis.hasExternal,
      externalEmails: recipientAnalysis.externalEmails,
      internalEmails: recipientAnalysis.internalEmails,
      totalRecipients: recipientRecords.length
    }
  });

  return schedule;
}

/**
 * Get schedule by ID
 */
export async function getScheduleById(
  scheduleId: string,
  clientId: number
): Promise<(ReportSchedule & { recipients: ReportScheduleRecipient[] }) | null> {
  return await prisma.reportSchedule.findFirst({
    where: {
      id: scheduleId,
      clientId,
      deletedAt: null
    },
    include: {
      recipients: true,
      report: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * List schedules for tenant
 */
export async function listSchedules(
  clientId: number,
  options?: { includeDisabled?: boolean; reportId?: number }
): Promise<(ReportSchedule & { recipients: ReportScheduleRecipient[] })[]> {
  const where: any = {
    clientId,
    deletedAt: null
  };

  if (!options?.includeDisabled) {
    where.isEnabled = true;
  }

  if (options?.reportId) {
    where.reportId = options.reportId;
  }

  return await prisma.reportSchedule.findMany({
    where,
    include: {
      recipients: true,
      report: {
        select: {
          id: true,
          name: true
        }
      },
      creator: {
        select: { firstName: true, lastName: true }
      },
      modifier: {
        select: { firstName: true, lastName: true }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

/**
 * Update schedule
 */
export async function updateSchedule(
  scheduleId: string,
  clientId: number,
  userId: number,
  updates: UpdateScheduleInput
): Promise<ReportSchedule> {
  // Get existing schedule with recipients
  const existing = await prisma.reportSchedule.findFirst({
    where: {
      id: scheduleId,
      clientId,
      deletedAt: null
    },
    include: {
      recipients: true
    }
  });

  if (!existing) {
    throw new Error('Schedule not found');
  }

  // Validate updates
  if (updates.name) {
    validateStringInput(updates.name, 'name', { maxLength: 255 });
  }

  if (updates.frequency) {
    validateScheduleFrequency(updates.frequency);
  }

  if (updates.timeOfDay) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(updates.timeOfDay)) {
      throw new ValidationError('timeOfDay must be in HH:MM format', 'timeOfDay');
    }
  }

  // Handle recipient changes with detailed tracking
  if (updates.recipients) {
    validateArrayInput(
      updates.recipients,
      'recipients',
      (email: any) => validateEmailInput(email, 'recipient'),
      { minLength: 1, maxLength: 5 }
    );

    // CRITICAL: Validate approved emails
    validateApprovedEmails(updates.recipients);

    // Validate email security
    await validateEmailSend(
      userId,
      clientId,
      updates.recipients,
      `Scheduled Report: ${existing.name}`,
      DataClassification.INTERNAL
    );

    // Get old recipients
    const oldRecipients = existing.recipients;
    const oldExternal = oldRecipients.filter(r => r.isExternal).map(r => r.email);
    const oldInternal = oldRecipients.filter(r => !r.isExternal).map(r => r.email);

    // Analyze new recipients
    const newRecipientAnalysis = await detectExternalRecipients(
      updates.recipients,
      clientId
    );

    // Calculate changes
    const addedExternal = newRecipientAnalysis.externalEmails.filter(
      e => !oldExternal.includes(e)
    );
    const removedExternal = oldExternal.filter(
      e => !newRecipientAnalysis.externalEmails.includes(e)
    );

    // Log recipient changes
    await logAudit({
      action: AuditAction.SCHEDULE_RECIPIENTS_CHANGED,
      severity: AuditSeverity.INFO,
      userId,
      tenantId: clientId,
      resourceType: 'schedule',
      resourceId: scheduleId,
      details: {
        scheduleName: existing.name,
        before: {
          total: oldRecipients.length,
          external: oldExternal,
          internal: oldInternal
        },
        after: {
          total: newRecipientAnalysis.externalEmails.length + 
                 newRecipientAnalysis.internalEmails.length,
          external: newRecipientAnalysis.externalEmails,
          internal: newRecipientAnalysis.internalEmails
        },
        addedExternal,
        removedExternal
      }
    });

    // Log external additions separately
    if (addedExternal.length > 0) {
      await logAudit({
        action: AuditAction.SCHEDULE_EXTERNAL_RECIPIENT_ADDED,
        severity: AuditSeverity.WARNING,
        userId,
        tenantId: clientId,
        resourceType: 'schedule',
        resourceId: scheduleId,
        details: {
          scheduleName: existing.name,
          addedEmails: addedExternal
        }
      });
    }

    // Log external removals separately
    if (removedExternal.length > 0) {
      await logAudit({
        action: AuditAction.SCHEDULE_EXTERNAL_RECIPIENT_REMOVED,
        severity: AuditSeverity.INFO,
        userId,
        tenantId: clientId,
        resourceType: 'schedule',
        resourceId: scheduleId,
        details: {
          scheduleName: existing.name,
          removedEmails: removedExternal
        }
      });
    }

    // Delete old recipients
    await prisma.reportScheduleRecipient.deleteMany({
      where: { scheduleId }
    });

    // Create new recipients with domain and isExternal
    const newRecipientRecords = updates.recipients.map(email => {
      const trimmed = email.trim();
      const domain = trimmed.split('@')[1];
      const isExternal = newRecipientAnalysis.externalEmails.includes(trimmed);
      
      return {
        scheduleId,
        email: trimmed,
        domain,
        isExternal
      };
    });

    await prisma.reportScheduleRecipient.createMany({
      data: newRecipientRecords
    });
  }

  // Recalculate next run time if schedule parameters changed
  let nextRunAt = existing.nextRunAt;
  if (updates.frequency || updates.timeOfDay || updates.dayOfWeek !== undefined || updates.dayOfMonth !== undefined) {
    nextRunAt = calculateNextRunTime(
      updates.frequency || existing.frequency,
      updates.timeOfDay || existing.timeOfDay,
      updates.timezone || existing.timezone,
      updates.dayOfWeek !== undefined ? updates.dayOfWeek : existing.dayOfWeek,
      updates.dayOfMonth !== undefined ? updates.dayOfMonth : existing.dayOfMonth
    );
  }

  // Build update data with audit fields
  const updateData: any = {
    lastModifiedBy: userId,
    lastModifiedAt: new Date(),
    updatedAt: new Date()
  };

  if (updates.name) updateData.name = updates.name;
  if (updates.frequency) updateData.frequency = updates.frequency;
  if (updates.timeOfDay) updateData.timeOfDay = updates.timeOfDay;
  if (updates.timezone) updateData.timezone = updates.timezone;
  if (updates.dayOfWeek !== undefined) updateData.dayOfWeek = updates.dayOfWeek;
  if (updates.dayOfMonth !== undefined) updateData.dayOfMonth = updates.dayOfMonth;
  if (updates.isEnabled !== undefined) updateData.isEnabled = updates.isEnabled;
  if (nextRunAt !== existing.nextRunAt) updateData.nextRunAt = nextRunAt;

  // Update schedule
  const updated = await prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: updateData
  });

  // Log general update
  await logAudit({
    action: AuditAction.SCHEDULE_UPDATED,
    severity: AuditSeverity.INFO,
    userId,
    tenantId: clientId,
    resourceType: 'schedule',
    resourceId: scheduleId,
    details: {
      scheduleName: updated.name,
      updatedFields: Object.keys(updates).filter(k => updates[k as keyof UpdateScheduleInput] !== undefined)
    }
  });

  return updated;
}

/**
 * Delete schedule (soft delete)
 */
export async function deleteSchedule(
  scheduleId: string,
  clientId: number,
  userId: number
): Promise<void> {
  const schedule = await getScheduleById(scheduleId, clientId);
  if (!schedule) {
    throw new Error('Schedule not found');
  }

  await prisma.reportSchedule.update({
    where: { id: scheduleId },
    data: {
      deletedAt: new Date(),
      isEnabled: false
    }
  });

  await logAudit({
    action: AuditAction.SCHEDULE_DELETED,
    severity: AuditSeverity.INFO,
    userId,
    tenantId: clientId,
    resourceType: 'schedule',
    resourceId: scheduleId,
    details: { name: schedule.name }
  });
}

/**
 * Get schedules due for execution
 */
export async function getSchedulesDueForExecution(): Promise<(ReportSchedule & { 
  recipients: ReportScheduleRecipient[],
  report: any 
})[]> {
  const now = new Date();

  return await prisma.reportSchedule.findMany({
    where: {
      isEnabled: true,
      deletedAt: null,
      nextRunAt: {
        lte: now
      }
    },
    include: {
      recipients: true,
      report: true,
      client: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Record schedule execution
 */
export async function recordScheduleExecution(
  scheduleId: string,
  clientId: number,
  reportId: number,
  status: ExecutionStatus,
  emailsSent: number = 0,
  emailsFailed: number = 0,
  errorMessage?: string
): Promise<ReportScheduleExecution> {
  return await prisma.reportScheduleExecution.create({
    data: {
      scheduleId,
      clientId,
      reportId,
      startedAt: new Date(),
      completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      status,
      emailsSent,
      emailsFailed,
      errorMessage
    }
  });
}

/**
 * Get execution history for schedule
 */
export async function getScheduleExecutions(
  scheduleId: string,
  clientId: number,
  limit: number = 50
): Promise<ReportScheduleExecution[]> {
  return await prisma.reportScheduleExecution.findMany({
    where: {
      scheduleId,
      clientId
    },
    orderBy: {
      startedAt: 'desc'
    },
    take: limit
  });
}
