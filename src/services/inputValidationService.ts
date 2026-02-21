/**
 * INPUT VALIDATION SERVICE
 * 
 * Prevents SQL injection, XSS, and other injection attacks
 */

// Keywords that must be whole words (avoids false positives like "for" matching "OR")
const SQL_WORD_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
  'TRUNCATE', 'EXEC', 'EXECUTE', 'UNION', 'JOIN', 'WHERE', 'OR', 'AND',
  'SCRIPT', 'JAVASCRIPT', 'EVAL', 'EXPRESSION', 'ONERROR', 'ONLOAD'
];

// Patterns that are dangerous regardless of word boundaries
const SQL_PATTERN_KEYWORDS = ['--', '/*', '*/', 'xp_', 'sp_'];

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Check if string contains SQL keywords (potential SQL injection).
 * Uses word-boundary matching for alphabetic keywords to avoid false positives
 * (e.g. "for" containing "OR"). Special character patterns use exact matching.
 */
export function containsSQLKeywords(value: string): boolean {
  const upperValue = value.toUpperCase();
  // Check word-boundary keywords
  if (SQL_WORD_KEYWORDS.some(keyword => new RegExp(`\\b${keyword}\\b`).test(upperValue))) {
    return true;
  }
  // Check exact pattern matches (no word boundary needed)
  if (SQL_PATTERN_KEYWORDS.some(pattern => upperValue.includes(pattern))) {
    return true;
  }
  return false;
}

/**
 * Validate string input - no SQL keywords, reasonable length
 */
export function validateStringInput(
  value: any,
  fieldName: string,
  options?: { maxLength?: number; allowEmpty?: boolean; pattern?: RegExp }
): string {
  if (value === null || value === undefined) {
    if (options?.allowEmpty) {
      return '';
    }
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }

  const trimmed = value.trim();

  if (!options?.allowEmpty && trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName);
  }

  const maxLength = options?.maxLength || 1000;
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength}`, fieldName);
  }

  if (containsSQLKeywords(trimmed)) {
    throw new ValidationError(`${fieldName} contains invalid characters`, fieldName);
  }

  if (options?.pattern && !options.pattern.test(trimmed)) {
    throw new ValidationError(`${fieldName} format is invalid`, fieldName);
  }

  return trimmed;
}

/**
 * Validate integer input
 */
export function validateIntegerInput(
  value: any,
  fieldName: string,
  options?: { min?: number; max?: number; required?: boolean }
): number | null {
  if (value === null || value === undefined || value === '') {
    if (options?.required) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return null;
  }

  const parsed = typeof value === 'number' ? value : parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new ValidationError(`${fieldName} must be a valid integer`, fieldName);
  }

  if (options?.min !== undefined && parsed < options.min) {
    throw new ValidationError(`${fieldName} must be at least ${options.min}`, fieldName);
  }

  if (options?.max !== undefined && parsed > options.max) {
    throw new ValidationError(`${fieldName} must not exceed ${options.max}`, fieldName);
  }

  return parsed;
}

/**
 * Validate boolean input
 */
export function validateBooleanInput(value: any, fieldName: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === 'false' || value === '0' || value === 0 || value === null || value === undefined) {
    return false;
  }

  throw new ValidationError(`${fieldName} must be a boolean`, fieldName);
}

/**
 * Validate ISO date string
 */
export function validateDateInput(value: any, fieldName: string, required: boolean = false): Date | null {
  if (!value) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return null;
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new ValidationError(`${fieldName} is invalid`, fieldName);
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a valid date string`, fieldName);
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO date`, fieldName);
  }

  return date;
}

/**
 * Validate email format
 */
export function validateEmailInput(value: any, fieldName: string = 'Email'): string {
  const email = validateStringInput(value, fieldName, { maxLength: 255 });
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(`${fieldName} format is invalid`, fieldName);
  }

  return email.toLowerCase();
}

/**
 * Validate UUID format
 */
export function validateUUIDInput(value: any, fieldName: string): string {
  const uuid = validateStringInput(value, fieldName, { maxLength: 36 });
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`, fieldName);
  }

  return uuid.toLowerCase();
}

/**
 * Validate enum value
 */
export function validateEnumInput<T extends string>(
  value: any,
  fieldName: string,
  allowedValues: readonly T[]
): T {
  if (!value) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  const strValue = String(value);
  if (!allowedValues.includes(strValue as T)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      fieldName
    );
  }

  return strValue as T;
}

/**
 * Validate array input
 */
export function validateArrayInput<T>(
  value: any,
  fieldName: string,
  itemValidator: (item: any, index: number) => T,
  options?: { minLength?: number; maxLength?: number }
): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }

  if (options?.minLength !== undefined && value.length < options.minLength) {
    throw new ValidationError(
      `${fieldName} must contain at least ${options.minLength} items`,
      fieldName
    );
  }

  if (options?.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(
      `${fieldName} must contain at most ${options.maxLength} items`,
      fieldName
    );
  }

  return value.map((item, index) => {
    try {
      return itemValidator(item, index);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `${fieldName}[${index}]: ${error.message}`,
          `${fieldName}[${index}]`
        );
      }
      throw error;
    }
  });
}

/**
 * Validate JSON object structure
 */
export function validateObjectInput<T>(
  value: any,
  fieldName: string,
  schema: Record<string, (val: any) => any>
): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`, fieldName);
  }

  const validated: any = {};

  for (const [key, validator] of Object.entries(schema)) {
    try {
      validated[key] = validator(value[key]);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `${fieldName}.${key}: ${error.message}`,
          `${fieldName}.${key}`
        );
      }
      throw error;
    }
  }

  return validated as T;
}

/**
 * Sanitize string for safe display (prevent XSS)
 */
export function sanitizeForDisplay(value: string): string {
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate report parameters JSON
 */
export interface ReportParameters {
  dateRange?: {
    start: string;
    end: string;
  };
  filters?: Record<string, string | number | boolean>;
  limit?: number;
}

export function validateReportParameters(params: any): ReportParameters {
  if (!params || typeof params !== 'object') {
    return {};
  }

  const validated: ReportParameters = {};

  // Validate dateRange
  if (params.dateRange) {
    if (typeof params.dateRange !== 'object') {
      throw new ValidationError('dateRange must be an object', 'dateRange');
    }

    const startDate = validateDateInput(params.dateRange.start, 'dateRange.start', false);
    const endDate = validateDateInput(params.dateRange.end, 'dateRange.end', false);

    if (startDate && endDate) {
      validated.dateRange = {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
    }
  }

  // Validate filters
  if (params.filters) {
    if (typeof params.filters !== 'object' || Array.isArray(params.filters)) {
      throw new ValidationError('filters must be an object', 'filters');
    }

    const validatedFilters: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(params.filters)) {
      // Validate key
      if (containsSQLKeywords(key)) {
        throw new ValidationError(`Invalid filter key: ${key}`, 'filters');
      }

      // Validate value
      if (typeof value === 'string') {
        if (containsSQLKeywords(value)) {
          throw new ValidationError(`Invalid filter value for ${key}`, 'filters');
        }
        validatedFilters[key] = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        validatedFilters[key] = value;
      } else {
        throw new ValidationError(`Filter ${key} has invalid type`, 'filters');
      }
    }

    validated.filters = validatedFilters;
  }

  // Validate limit
  if (params.limit !== undefined) {
    const limit = validateIntegerInput(params.limit, 'limit', { min: 1, max: 10000 });
    if (limit !== null) {
      validated.limit = limit;
    }
  }

  return validated;
}

/**
 * Validate schedule frequency (for scheduled reports)
 */
export const SCHEDULE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi-annually',
  'annually'
] as const;

export type ScheduleFrequency = typeof SCHEDULE_FREQUENCIES[number];

export function validateScheduleFrequency(value: any): ScheduleFrequency {
  return validateEnumInput(value, 'frequency', SCHEDULE_FREQUENCIES);
}

/**
 * Validate timezone string
 */
export function validateTimezone(value: any): string {
  // Validate timezone without SQL keyword check (timezones like America/New_York contain "OR")
  if (value === null || value === undefined) {
    throw new ValidationError('timezone is required', 'timezone');
  }

  if (typeof value !== 'string') {
    throw new ValidationError('timezone must be a string', 'timezone');
  }

  const tz = value.trim();

  if (tz.length === 0) {
    throw new ValidationError('timezone cannot be empty', 'timezone');
  }

  if (tz.length > 50) {
    throw new ValidationError('timezone exceeds maximum length of 50', 'timezone');
  }

  // IANA timezone format validation (allows underscores and slashes)
  if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(tz) && tz !== 'UTC') {
    throw new ValidationError('Invalid timezone format', 'timezone');
  }

  return tz;
}
