import mysql from 'mysql2/promise';
import { prisma } from '../db/prisma.js';
import { getDecryptedConnection } from './connectionService.js';

interface QueryResult {
  rows: any[];
  columns: string[];
  rowCount: number;
  executionTimeMs: number;
}

/**
 * Validates that a SQL query is safe to execute
 * - Must be a SELECT statement (read-only)
 * - Rejects INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, etc.
 * - Rejects common SQL injection patterns and advanced attack vectors
 * @throws Error if query is not safe
 */
function validateSQLQuery(sqlQuery: string): void {
  if (!sqlQuery || typeof sqlQuery !== 'string') {
    throw new Error('Query must be a non-empty string');
  }

  let trimmedQuery = sqlQuery.trim();

  if (trimmedQuery.length === 0) {
    throw new Error('Query cannot be empty');
  }

  // Check query length (prevent DOS)
  if (trimmedQuery.length > 50000) {
    throw new Error('Query is too long (max 50000 characters)');
  }

  // Prevent null bytes and other non-printable characters that could be used for bypasses
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g.test(trimmedQuery)) {
    throw new Error('Query contains invalid control characters');
  }

  // Remove comments and get cleaned version for validation
  // This must be done first to catch injection in comments
  let cleanedForValidation = trimmedQuery
    .replace(/--.*$/gm, '') // Remove line comments (SQL standard)
    .replace(/#[^\n]*$/gm, '') // Remove MySQL # comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .trim();

  // Prevent comment-based bypasses by rejecting queries with suspicious comment patterns
  // that might be trying to escape the first-word check
  if (/^\/\*.*?\*\/\s*INSERT|^\/\*.*?\*\/\s*UPDATE|^\/\*.*?\*\/\s*DELETE|^\/\*.*?\*\/\s*DROP|^\/\*.*?\*\/\s*CREATE|^\/\*.*?\*\/\s*ALTER|^\/\*.*?\*\/\s*EXEC|^\/\*.*?\*\/\s*TRUNCATE/i.test(trimmedQuery)) {
    throw new Error('Query contains suspicious comment patterns - SQL injection attempt detected');
  }

  // Normalize whitespace for analysis (preserves logic)
  const normalizedQuery = cleanedForValidation
    .replace(/\s+/g, ' ') // Collapse multiple whitespaces
    .toUpperCase()
    .trim();

  const firstWord = normalizedQuery.split(/\s+/)[0];

  // Whitelist: only SELECT is allowed
  if (firstWord !== 'SELECT') {
    throw new Error(`Only SELECT queries are allowed. "${firstWord}" is not permitted.`);
  }

  // Check for Data Definition Language (DDL) operations
  const ddlPatterns = [
    /\bCREATE\s+(TABLE|DATABASE|SCHEMA|VIEW|FUNCTION|PROCEDURE|TRIGGER|INDEX)\b/i,
    /\bALTER\s+(TABLE|DATABASE|SCHEMA|VIEW|FUNCTION|PROCEDURE|TRIGGER|INDEX)\b/i,
    /\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|FUNCTION|PROCEDURE|TRIGGER|INDEX|TEMPORARY)\b/i,
    /\bTRUNCATE\b/i,
    /\bRENAME\b/i,
  ];

  for (const pattern of ddlPatterns) {
    if (pattern.test(trimmedQuery)) {
      throw new Error('Query contains DDL operations - only SELECT is allowed');
    }
  }

  // Check for Data Manipulation Language (DML) operations
  const dmlPatterns = [
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bDELETE\b/i,
    /\bREPLACE\b/i,
  ];

  for (const pattern of dmlPatterns) {
    if (pattern.test(trimmedQuery)) {
      throw new Error('Query contains DML operations - only SELECT is allowed');
    }
  }

  // Check for administrative/control operations
  const adminPatterns = [
    /\bEXEC\b|\bEXECUTE\b/i, // Execute procedures
    /\bPREPARE\b/i, // Prepared statements
    /\bDEALLOCATE\b/i,
    /\bGRANT\b|\bREVOKE\b/i, // Privilege manipulation
    /\bSOCKET_CONNECT\b/i, // Network functions
    /\bLOAD_FILE\b/i, // File operations
    /\bINTO\s+(OUTFILE|DUMPFILE|@)/i, // Output operations and variable assignment via INTO
    /\bSHELL\b/i, // Shell commands
    /\bSET\s+@/i, // User variable assignment
    /\bSET\s+(GLOBAL|SESSION)/i, // Variable assignment
    /\bFLUSH\b/i, // Cache operations
    /\bSHOW\s+(PROCESSLIST|VARIABLES|STATUS|GRANTS|TABLES|DATABASES|SCHEMAS|ENGINES|PLUGINS|TRIGGERS|FUNCTIONS|PROCEDURES|VIEWS|EVENTS|CREATE|OPEN|MASTER|SLAVE|BINARY|ERROR|WARNINGS|INDEX|COLUMNS|CREATE|KEYS)/i, // Information disclosure
    /\bCALL\b/i, // Stored procedure calls
    /\bLOCK\b/i, // Locking operations
    /\bUNLOCK\b/i,
    /\bSTART\s+TRANSACTION\b|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b|\bSAVEPOINT\b/i, // Transaction control - not safe in report context
  ];

  for (const pattern of adminPatterns) {
    if (pattern.test(trimmedQuery)) {
      throw new Error('Query contains prohibited administrative or privileged operations');
    }
  }

  // Prevent UNION-based queries to prevent cross-table data extraction
  // UNION queries can extract data from other tables the user shouldn't access
  // Allow UNION ALL for combining results from same table (common for pivot/aggregate queries)
  if (/\bUNION\b(?!\s+ALL\b)/i.test(trimmedQuery)) {
    throw new Error('UNION queries are not allowed - only UNION ALL is permitted for combining results');
  }

  // Prevent information_schema and mysql schema access
  if (/\b(information_schema|mysql|performance_schema|sys)\b/i.test(trimmedQuery)) {
    throw new Error('Access to system schemas is prohibited');
  }

  // Prevent subqueries that might attempt privilege escalation
  // Basic check - subqueries in FROM are allowed but not in complex injection patterns
  if (/\(\s*SELECT\s+.*?INTO\b/i.test(trimmedQuery)) {
    throw new Error('Subqueries with INTO are prohibited');
  }

  // Prevent stored function calls that might be dangerous
  // Common dangerous functions
  const dangerousFunctions = [
    'VERSION',
    'USER',
    'CURRENT_USER',
    'LOAD_FILE',
    'EXTRACT',
    'SOURCE',
    'INTO',
    'BENCHMARK',
    'SLEEP',
    'CONCAT_WS',
  ];

  for (const func of dangerousFunctions) {
    if (new RegExp(`\\b${func}\\s*\\(`, 'i').test(trimmedQuery)) {
      // EXTRACT, CONCAT_WS are safe for SELECT - allow them
      if (func !== 'EXTRACT' && func !== 'CONCAT_WS') {
        throw new Error(`Function "${func}" is not allowed in queries`);
      }
    }
  }

  // Check for hex encoding bypass attempts (0x prefix in MySQL)
  if (/0x[0-9A-Fa-f]+/i.test(trimmedQuery)) {
    // Hex is allowed in SELECT (for hex comparison), but be cautious
    // This is a legitimate SQL feature, so we allow it but log it could be monitored
  }

  // Check for stacked queries (multiple statements separated by ;)
  // Allow ; in strings but not outside them
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < trimmedQuery.length; i++) {
    const char = trimmedQuery[i];
    const prevChar = i > 0 ? trimmedQuery[i - 1] : '';

    // Handle string delimiters
    if ((char === "'" || char === '"' || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Check for semicolon outside of strings
    if (char === ';' && !inString) {
      const afterSemicolon = trimmedQuery.substring(i + 1).trim();
      if (afterSemicolon.length > 0) {
        throw new Error('Multiple SQL statements detected - only single SELECT statement allowed');
      }
    }
  }

  // Validate quote balancing (improved to account for strings)
  let singleQuotes = 0;
  let doubleQuotes = 0;
  let backticks = 0;
  let i = 0;

  while (i < trimmedQuery.length) {
    const char = trimmedQuery[i];
    const prevChar = i > 0 ? trimmedQuery[i - 1] : '';

    // Skip properly escaped characters
    if (char === '\\' && prevChar !== '\\') {
      i += 2;
      continue;
    }

    // Count quotes
    if (char === "'" && prevChar !== '\\') singleQuotes++;
    if (char === '"' && prevChar !== '\\') doubleQuotes++;
    if (char === '`' && prevChar !== '\\') backticks++;

    i++;
  }

  // Check if quotes are balanced
  if (singleQuotes % 2 !== 0) {
    throw new Error('Query has unbalanced single quotes - possible SQL injection attempt');
  }
  if (doubleQuotes % 2 !== 0) {
    throw new Error('Query has unbalanced double quotes - possible SQL injection attempt');
  }
  if (backticks % 2 !== 0) {
    throw new Error('Query has unbalanced backticks - possible SQL injection attempt');
  }

  // Prevent Unicode/encoding bypasses
  // Check for null bytes (already done above but extra check)
  if (trimmedQuery.includes('\0')) {
    throw new Error('Query contains null bytes - SQL injection attempt detected');
  }

  // Check for unusual escape patterns that might bypass validation
  if (/\\x00|\\N|\\Z/i.test(trimmedQuery)) {
    throw new Error('Query contains suspicious escape sequences');
  }

  // Final check: ensure the query still contains SELECT after all transformations
  if (!normalizedQuery.startsWith('SELECT')) {
    throw new Error('Query validation failed - must start with SELECT');
  }
}


/**
 * Execute a SQL query against a database connection and save results to report
 */
export async function executeAndCacheQuery(
  clientId: number,
  reportId: number,
  connectionId: number,
  sqlQuery: string
): Promise<QueryResult> {
  // Validate query safety FIRST - before any database operations
  try {
    validateSQLQuery(sqlQuery);
  } catch (validationError: any) {
    // Save validation error to database
    const now = new Date();
    await prisma.report.update({
      where: { id: reportId },
      data: {
        startedAt: now,
        finishedAt: now,
        error: `Query validation failed: ${validationError.message}`,
      },
    });
    throw validationError;
  }

  // Get the decrypted connection details
  const conn = await getDecryptedConnection(clientId, connectionId);
  if (!conn) {
    throw new Error('Connection not found or access denied');
  }

  if (conn.engine !== 'mysql') {
    throw new Error('Only MySQL connections are currently supported');
  }

  // Execute the query with timeout protection
  const connection = await mysql.createConnection({
    host: conn.host,
    port: conn.port,
    user: conn.username,
    password: conn.password,
    database: conn.database,
    connectTimeout: 10000, // 10 second connection timeout
  });

  const startTime = new Date();

  try {
    console.log(`[Query] Starting execution for report ${reportId}`);
    // Set a statement timeout at the database level (MySQL)
    // 1800 seconds (30 minutes) for complex analytical queries
    // This can be adjusted based on actual query performance
    await connection.query('SET SESSION max_execution_time = 1800000'); // 1800 seconds (30 minutes)

    console.log(`[Query] Executing SQL query...`);
    const [rows, fields] = await connection.execute(sqlQuery);
    const columns = (fields || []).map(f => f.name);
    const rowArray = Array.isArray(rows) ? rows : [];
    
    const endTime = new Date();
    const executionTimeMs = endTime.getTime() - startTime.getTime();
    
    console.log(`[Query Success] Completed in ${executionTimeMs}ms, returned ${rowArray.length} rows, ${columns.length} columns`);
    
    // Convert rows to JSON-serializable format
    const jsonRows = rowArray.map(row => {
      if (typeof row === 'object' && row !== null) {
        return Object.assign({}, row);
      }
      return row;
    });

    // Save results to database
    await prisma.report.update({
      where: { id: reportId },
      data: {
        startedAt: startTime,
        finishedAt: endTime,
        dataJson: {
          columns: columns,
          rows: jsonRows,
          rowCount: rowArray.length,
          executionTimeMs: executionTimeMs,
        } as any,
        error: null,
      },
    });

    console.log(`[Query Executed] Report: ${reportId}, Rows: ${rowArray.length}, Time: ${executionTimeMs}ms`);

    return {
      rows: rowArray,
      columns,
      rowCount: rowArray.length,
      executionTimeMs,
    };
  } catch (error: any) {
    // Save error to database
    const errorMessage = error?.message || 'Unknown error executing query';
    const now = new Date();
    
    await prisma.report.update({
      where: { id: reportId },
      data: {
        startedAt: now,
        finishedAt: now,
        error: errorMessage,
      },
    });

    throw new Error(`Query execution failed: ${errorMessage}`);
  } finally {
    await connection.end();
  }
}

/**
 * Get cached query results for a report
 */
export async function getCachedResults(reportId: number) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
  });

  if (!report || !report.startedAt) {
    return null;
  }

  return {
    id: report.id,
    executedAt: report.startedAt,
    data: report.dataJson,
    error: report.error,
  };
}

/**
 * Clear cached results for a report
 */
export async function clearCachedResults(reportId: number) {
  await prisma.report.update({
    where: { id: reportId },
    data: {
      startedAt: null,
      finishedAt: null,
      dataJson: undefined,
      error: null,
    },
  });
}
