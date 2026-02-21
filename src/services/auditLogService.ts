import { prisma } from '../db/prisma.js';
import { Request } from 'express';

/**
 * Comprehensive audit logging service for security events
 * Tracks all security-relevant operations across the system
 */

export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',

  // Tenant Access
  TENANT_ACCESS_DENIED = 'TENANT_ACCESS_DENIED',
  TENANT_ACCESS_GRANTED = 'TENANT_ACCESS_GRANTED',
  CROSS_TENANT_ATTEMPT = 'CROSS_TENANT_ATTEMPT',
  
  // Email Security
  EMAIL_SENT = 'EMAIL_SENT',
  EMAIL_BLOCKED_DOMAIN = 'EMAIL_BLOCKED_DOMAIN',
  EMAIL_BLOCKED_TEST_SERVICE = 'EMAIL_BLOCKED_TEST_SERVICE',
  EMAIL_EXTERNAL_APPROVAL_REQUIRED = 'EMAIL_EXTERNAL_APPROVAL_REQUIRED',
  
  // Schedule Operations
  SCHEDULE_CREATED = 'SCHEDULE_CREATED',
  SCHEDULE_UPDATED = 'SCHEDULE_UPDATED',
  SCHEDULE_DELETED = 'SCHEDULE_DELETED',
  SCHEDULE_EXECUTED = 'SCHEDULE_EXECUTED',
  SCHEDULE_FAILED = 'SCHEDULE_FAILED',
  SCHEDULE_CREATED_WITH_EXTERNAL = 'SCHEDULE_CREATED_WITH_EXTERNAL',
  SCHEDULE_RECIPIENTS_CHANGED = 'SCHEDULE_RECIPIENTS_CHANGED',
  SCHEDULE_EXTERNAL_RECIPIENT_ADDED = 'SCHEDULE_EXTERNAL_RECIPIENT_ADDED',
  SCHEDULE_EXTERNAL_RECIPIENT_REMOVED = 'SCHEDULE_EXTERNAL_RECIPIENT_REMOVED',
  SCHEDULE_PERMISSION_GRANTED = 'SCHEDULE_PERMISSION_GRANTED',
  SCHEDULE_PERMISSION_REVOKED = 'SCHEDULE_PERMISSION_REVOKED',
  
  // Report Operations
  REPORT_CREATED = 'REPORT_CREATED',
  REPORT_UPDATED = 'REPORT_UPDATED',
  REPORT_DELETED = 'REPORT_DELETED',
  REPORT_ACCESSED = 'REPORT_ACCESSED',
  
  // User Management
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_INVITED = 'USER_INVITED',
  
  // Security Events
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT_DETECTED = 'INVALID_INPUT_DETECTED',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  CSRF_DETECTED = 'CSRF_DETECTED',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface AuditLogEntry {
  action: AuditAction;
  severity: AuditSeverity;
  userId?: number;
  tenantId?: number;
  ipAddress?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  errorMessage?: string;
}

/**
 * Create audit log entry
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    // Log to database
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        severity: entry.severity,
        userId: entry.userId,
        tenantId: entry.tenantId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details ? sanitizeLogData(entry.details) : undefined,
        errorMessage: entry.errorMessage
      }
    }).catch(dbError => {
      // Fallback to console if database fails
      console.error('[AUDIT DB ERROR]', dbError);
    });

    // Also log to console for real-time monitoring
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      ...entry,
      details: entry.details ? sanitizeLogData(entry.details) : undefined
    };
    console.log('[AUDIT]', JSON.stringify(logData));
  } catch (error) {
    // Never let audit logging break the application
    console.error('[AUDIT ERROR]', error);
  }
}

/**
 * Log security event from HTTP request
 */
export async function logSecurityEvent(
  req: Request,
  action: AuditAction,
  severity: AuditSeverity,
  details?: Record<string, any>
): Promise<void> {
  const userId = req.user ? parseInt(req.user.userId) : undefined;
  const tenantId = req.tenantId ? parseInt(req.tenantId) : undefined;
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  await logAudit({
    action,
    severity,
    userId,
    tenantId,
    ipAddress,
    userAgent,
    details
  });
}

/**
 * Log tenant access violation
 */
export async function logTenantAccessViolation(
  req: Request,
  attemptedTenantId: number,
  reason: string
): Promise<void> {
  await logSecurityEvent(
    req,
    AuditAction.CROSS_TENANT_ATTEMPT,
    AuditSeverity.CRITICAL,
    {
      attemptedTenantId,
      reason,
      requestedUrl: req.originalUrl,
      method: req.method
    }
  );
}

/**
 * Log email security event
 */
export async function logEmailSecurityEvent(
  action: AuditAction,
  severity: AuditSeverity,
  userId: number,
  tenantId: number,
  recipients: string[],
  reason?: string
): Promise<void> {
  await logAudit({
    action,
    severity,
    userId,
    tenantId,
    resourceType: 'email',
    details: {
      recipients,
      reason
    }
  });
}

/**
 * Log schedule operation
 */
export async function logScheduleOperation(
  action: AuditAction,
  userId: number,
  tenantId: number,
  scheduleId: string,
  details?: Record<string, any>
): Promise<void> {
  await logAudit({
    action,
    severity: AuditSeverity.INFO,
    userId,
    tenantId,
    resourceType: 'schedule',
    resourceId: scheduleId,
    details
  });
}

/**
 * Log rate limit exceeded
 */
export async function logRateLimitExceeded(
  req: Request,
  limitType: string,
  currentValue: number,
  maxValue: number
): Promise<void> {
  await logSecurityEvent(
    req,
    AuditAction.RATE_LIMIT_EXCEEDED,
    AuditSeverity.WARNING,
    {
      limitType,
      currentValue,
      maxValue
    }
  );
}

/**
 * Log invalid input detection
 */
export async function logInvalidInput(
  req: Request,
  field: string,
  value: any,
  validationType: string
): Promise<void> {
  await logSecurityEvent(
    req,
    AuditAction.INVALID_INPUT_DETECTED,
    AuditSeverity.WARNING,
    {
      field,
      value: typeof value === 'string' ? value.substring(0, 100) : value,
      validationType
    }
  );
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ips = forwardedStr.split(',');
    return ips[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Sanitize log data to remove sensitive information
 */
function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'apiKey', 'creditCard'];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Query audit logs for analysis
 */
export async function getAuditLogs(filters: {
  userId?: number;
  tenantId?: number;
  action?: AuditAction;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<any[]> {
  const where: any = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.action) where.action = filters.action;
  if (filters.severity) where.severity = filters.severity;
  
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  return await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters.limit || 100
  });
}

/**
 * Get security events for tenant (for compliance reporting)
 */
export async function getTenantSecurityEvents(
  tenantId: number,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  return await prisma.auditLog.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      severity: {
        in: [AuditSeverity.WARNING, AuditSeverity.ERROR, AuditSeverity.CRITICAL]
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}
