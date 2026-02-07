/**
 * Input validation utilities
 */

/**
 * Safely parse an integer and validate it's not NaN
 * @param value - Value to parse
 * @param fieldName - Name of field for error messages
 * @returns Parsed integer
 * @throws Error if value is not a valid integer
 */
export function parseIntSafe(value: any, fieldName: string = 'value'): number {
  const parsed = parseInt(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName}: must be a valid integer`);
  }
  return parsed;
}

/**
 * Safely parse an integer from request param
 * @param value - Value to parse
 * @param fieldName - Name of field for error messages
 * @returns Parsed integer or null if invalid
 */
export function parseIntParam(value: any, fieldName: string = 'ID'): number | null {
  if (value === undefined || value === null) return null;
  const parsed = parseInt(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Validate that a value is a positive integer
 * @param value - Value to validate
 * @param fieldName - Name of field for error messages
 * @returns true if valid
 * @throws Error if invalid
 */
export function validatePositiveInt(value: any, fieldName: string = 'value'): boolean {
  const parsed = parseIntSafe(value, fieldName);
  if (parsed < 1) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }
  return true;
}
