import Bull, { Queue, Job } from 'bull';
import { 
  getSchedulesDueForExecution,
  recordScheduleExecution,
  calculateNextRunTime
} from './scheduleService.js';
import { executeAndCacheQuery } from './queryService.js';
import { generateChartImage } from './chartImageService.js';
import { sendMail } from './emailService.js';
import { prisma } from '../db/prisma.js';
import { 
  logScheduleOperation,
  AuditAction,
  AuditSeverity
} from './auditLogService.js';
import { loadRedisConfig } from './redisConfigService.js';

// Queue for scheduled report jobs
let reportQueue: Queue | null = null;

export interface ScheduleJobData {
  scheduleId: string;
  clientId: number;
  reportId: number;
  userId: number;
}

/**
 * Initialize Bull queue with Redis connection from database
 */
export async function initializeQueue(): Promise<Queue> {
  if (reportQueue) {
    return reportQueue;
  }

  // Load Redis configuration from database (falls back to env)
  const redisConfig = await loadRedisConfig();

  console.log('[queue] Initializing report queue with Redis:', {
    host: redisConfig.host,
    port: redisConfig.port,
    hasPassword: !!redisConfig.password
  });

  reportQueue = new Bull('scheduled-reports', {
    redis: {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      maxRetriesPerRequest: 3
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000 // Start with 1 minute delay
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 200 // Keep last 200 failed jobs
    }
  });

  // Error handling
  reportQueue.on('error', (error) => {
    console.error('[queue] Queue error:', error);
  });

  reportQueue.on('failed', (job, error) => {
    console.error('[queue] Job failed:', {
      jobId: job.id,
      data: job.data,
      error: error.message
    });
  });

  reportQueue.on('completed', (job) => {
    console.log('[queue] Job completed:', {
      jobId: job.id,
      scheduleId: job.data.scheduleId
    });
  });

  // Start processing jobs
  reportQueue.process(5, processScheduledReport); // Process 5 concurrent jobs

  console.log('[queue] Report queue initialized successfully');
  return reportQueue;
}

/**
 * Get queue instance
 */
export async function getQueue(): Promise<Queue> {
  if (!reportQueue) {
    return await initializeQueue();
  }
  return reportQueue;
}

/**
 * Process a scheduled report job
 */
async function processScheduledReport(job: Job<ScheduleJobData>): Promise<void> {
  const { scheduleId, clientId, reportId, userId } = job.data;

  console.log('[queue] Processing scheduled report:', {
    jobId: job.id,
    scheduleId,
    clientId,
    reportId
  });

  // Update job progress
  await job.progress(10);

  try {
    // Get schedule with recipients
    const schedule = await prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        recipients: true,
        report: true,
        client: true
      }
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (!schedule.isEnabled) {
      console.log('[queue] Schedule is disabled, skipping');
      return;
    }

    await job.progress(20);

    // Execute the report query to get fresh data
    console.log('[queue] Executing report:', reportId);
    const report = schedule.report;

    if (report.sqlQuery && report.connectionId) {
      try {
        console.log('[queue] Re-running SQL query for fresh data');
        await executeAndCacheQuery(clientId, reportId, report.connectionId, report.sqlQuery);
      } catch (queryError: any) {
        console.error('[queue] Query re-execution failed, using existing data:', queryError.message);
        if (!report.dataJson) {
          throw new Error(`Report has no data and query re-execution failed: ${queryError.message}`);
        }
        // Fall back to existing stale data — email will still be sent
      }
    } else if (!report.dataJson) {
      throw new Error('Report has no data and no SQL query configured');
    }

    await job.progress(40);

    // Generate chart image
    console.log('[queue] Generating chart image');
    await generateChartImage(reportId);
    
    await job.progress(60);

    // Load updated report with chart image
    const reportWithImage = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        name: true,
        chartImageData: true,
        chartImageError: true
      }
    });

    if (!reportWithImage?.chartImageData) {
      throw new Error('Failed to generate chart image');
    }

    await job.progress(70);

    // Send email to each recipient
    const recipients = schedule.recipients.map(r => r.email);
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const recipient of recipients) {
      try {
        console.log('[queue] Sending email to:', recipient);

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${report.name}</title>
          </head>
          <body style="margin: 0; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; color: white; font-size: 24px;">Scheduled Report</h1>
                <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                  ${schedule.client.name}
                </p>
              </div>
              
              <div style="padding: 30px;">
                <h2 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">${report.name}</h2>
                
                <div style="background: #f8f9fa; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
                  <p style="margin: 0; color: #666; font-size: 14px;">
                    <strong>Schedule:</strong> ${schedule.frequency.replace('_', '-')} at ${schedule.timeOfDay}
                  </p>
                  <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
                    <strong>Generated:</strong> ${new Date().toLocaleString()}
                  </p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <img src="cid:report-chart" alt="${report.name}" style="display: block; max-width: 100%; height: auto; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
                </div>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                  <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                    This is an automated report from PestControl CRM.<br>
                    To unsubscribe or modify your preferences, please contact your administrator.
                  </p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const result = await sendMail(
          recipient,
          `Scheduled Report: ${report.name}`,
          undefined,
          emailHtml,
          {
            attachments: [
              {
                content: reportWithImage.chartImageData,
                cid: 'report-chart',
                contentType: 'image/png',
                contentDisposition: 'inline'
              }
            ],
            skipSecurityValidation: false
          }
        );

        if (result.sent) {
          emailsSent++;
        } else {
          emailsFailed++;
          console.error('[queue] Failed to send email:', result.error);
        }
      } catch (emailError: any) {
        emailsFailed++;
        console.error('[queue] Email send error:', emailError.message);
      }
    }

    await job.progress(90);

    // Record execution
    await recordScheduleExecution(
      scheduleId,
      clientId,
      reportId,
      emailsFailed > 0 ? 'failed' : 'completed',
      emailsSent,
      emailsFailed,
      emailsFailed > 0 ? `Failed to send ${emailsFailed} emails` : undefined
    );

    // Update next run time
    const nextRunAt = calculateNextRunTime(
      schedule.frequency,
      schedule.timeOfDay,
      schedule.timezone,
      schedule.dayOfWeek,
      schedule.dayOfMonth
    );

    await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: { nextRunAt }
    });

    await job.progress(100);

    // Audit log
    await logScheduleOperation(
      AuditAction.SCHEDULE_EXECUTED,
      userId,
      clientId,
      scheduleId,
      {
        emailsSent,
        emailsFailed,
        recipients: recipients.length
      }
    );

    console.log('[queue] Scheduled report completed:', {
      scheduleId,
      emailsSent,
      emailsFailed,
      nextRunAt
    });

  } catch (error: any) {
    console.error('[queue] Error processing scheduled report:', error);

    // Record failed execution
    await recordScheduleExecution(
      scheduleId,
      clientId,
      reportId,
      'failed',
      0,
      0,
      error.message
    );

    // Audit log
    await logScheduleOperation(
      AuditAction.SCHEDULE_FAILED,
      userId,
      clientId,
      scheduleId,
      {
        error: error.message
      }
    );

    throw error; // Re-throw for Bull retry logic
  }
}

/**
 * Add schedule to queue for immediate execution
 */
export async function queueScheduleExecution(
  scheduleId: string,
  clientId: number,
  reportId: number,
  userId: number,
  dueAt?: Date | null
): Promise<Job<ScheduleJobData>> {
  const queue = await getQueue();
  // Use dueAt-based job IDs for scheduled runs so the same due slot can't be queued twice.
  const jobNonce = dueAt ? new Date(dueAt).getTime() : Date.now();

  return await queue.add(
    {
      scheduleId,
      clientId,
      reportId,
      userId
    },
    {
      jobId: `schedule-${scheduleId}-${jobNonce}`,
      priority: 1
    }
  );
}

/**
 * Check for due schedules and queue them
 * Should be called by a cron job every minute
 */
export async function checkAndQueueDueSchedules(): Promise<number> {
  console.log('[queue] Checking for due schedules...');

  const dueSchedules = await getSchedulesDueForExecution();

  console.log('[queue] Found', dueSchedules.length, 'due schedules');

  let queued = 0;
  for (const schedule of dueSchedules) {
    try {
      await queueScheduleExecution(
        schedule.id,
        schedule.clientId,
        schedule.reportId,
        schedule.userId,
        schedule.nextRunAt
      );
      queued++;
    } catch (error: any) {
      if (error?.message?.toLowerCase()?.includes('already exists')) {
        console.log('[queue] Schedule already queued for this due slot, skipping duplicate:', schedule.id);
        continue;
      }
      console.error('[queue] Failed to queue schedule:', {
        scheduleId: schedule.id,
        error: error.message
      });
    }
  }

  return queued;
}

/**
 * Start the schedule checker (runs every minute)
 */
export function startScheduleChecker(): NodeJS.Timeout {
  console.log('[queue] Starting schedule checker (runs every minute)');
  
  // Run immediately
  checkAndQueueDueSchedules();

  // Then run every minute
  return setInterval(async () => {
    try {
      await checkAndQueueDueSchedules();
    } catch (error) {
      console.error('[queue] Schedule checker error:', error);
    }
  }, 60000); // 60 seconds
}

/**
 * Close queue gracefully
 */
export async function closeQueue(): Promise<void> {
  if (reportQueue) {
    console.log('[queue] Closing report queue...');
    await reportQueue.close();
    reportQueue = null;
    console.log('[queue] Queue closed');
  }
}
