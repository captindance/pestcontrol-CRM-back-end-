import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { enqueueReport } from '../reportRunner.js';
import { executeAndCacheQuery, getCachedResults } from '../services/queryService.js';
import { userHasPermission } from '../services/permissionService.js';
import { parseIntSafe } from '../utils/validation.js';

const router = Router();

// Helper: check if user has edit permissions
async function canEditReports(req: Request, clientId: number): Promise<boolean> {
  if (!req.user?.userId) return false;
  const userId = parseIntSafe(req.user.userId, 'userId');
  return await userHasPermission(userId, clientId, 'canEditReports');
}

async function canCreateReports(req: Request, clientId: number): Promise<boolean> {
  if (!req.user?.userId) return false;
  const userId = parseIntSafe(req.user.userId, 'userId');
  return await userHasPermission(userId, clientId, 'canCreateReports');
}

async function canDeleteReports(req: Request, clientId: number): Promise<boolean> {
  if (!req.user?.userId) return false;
  const userId = parseIntSafe(req.user.userId, 'userId');
  return await userHasPermission(userId, clientId, 'canDeleteReports');
}

async function validateConnection(clientId: number, connectionId?: number | null): Promise<boolean> {
  if (!connectionId) return true;
  const conn = await prisma.databaseConnection.findUnique({ where: { id: connectionId } });
  return !!conn && conn.clientId === clientId;
}

// List reports for tenant
router.get('/', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  try {
    const tenantId = parseIntSafe(req.tenantId, 'tenantId');
    const list = await prisma.report.findMany({ where: { clientId: tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const connections = await prisma.databaseConnection.findMany({ where: { clientId: tenantId, deletedAt: null } });
    const connList = connections.map(c => ({ id: c.id, name: c.name }));
    res.json({
      reports: list.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        queryKey: r.queryKey,
        connectionId: r.connectionId,
        sqlQuery: r.sqlQuery,
        chartConfig: r.chartConfig,
      })),
      availableConnections: connList
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Invalid request' });
  }
});

// Create report (owner, delegate, platform_admin only)
router.post('/', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  if (!(await canCreateReports(req, tenantId))) {
    return res.status(403).json({ error: 'Forbidden: create report permission required' });
  }
  const { name, queryKey, connectionId, sqlQuery } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Report name is required' });
  }
  try {
    const connIdNum = connectionId ? parseInt(connectionId) : null;
    const validConn = await validateConnection(tenantId, connIdNum);
    if (!validConn) return res.status(400).json({ error: 'Invalid connectionId for this tenant' });
    const report = await prisma.report.create({
      data: {
        clientId: tenantId,
        name,
        queryKey: queryKey || null,
        connectionId: connIdNum || null,
        sqlQuery: sqlQuery || null,
      }
    });
    res.status(201).json({ id: report.id, name: report.name, status: report.status, queryKey: report.queryKey, connectionId: report.connectionId, sqlQuery: report.sqlQuery });
  } catch (e: any) {
    console.error('Create report error', e);
    res.status(500).json({ error: e?.message || 'Failed to create report' });
  }
});

// Get report metadata
router.get('/:id', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  const reportId = parseInt(req.params.id);
  const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId } });
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const connections = await prisma.databaseConnection.findMany({ where: { clientId: tenantId } });
  const connList = connections.map(c => ({ id: c.id, name: c.name }));
  res.json({ 
    id: report.id, 
    name: report.name, 
    status: report.status, 
    queryKey: report.queryKey, 
    connectionId: report.connectionId,
    sqlQuery: report.sqlQuery,
    availableConnections: connList
  });
});

// Update report (owner, delegate, platform_admin only)
router.put('/:id', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  if (!(await canEditReports(req, tenantId))) {
    return res.status(403).json({ error: 'Forbidden: edit report permission required' });
  }
  const reportId = parseInt(req.params.id);
  const { name, queryKey, connectionId, sqlQuery } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Report name is required' });
  }
  try {
    const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId } });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const connIdNum = connectionId ? parseInt(connectionId) : null;
    const validConn = await validateConnection(tenantId, connIdNum);
    if (!validConn) return res.status(400).json({ error: 'Invalid connectionId for this tenant' });
    
    const updated = await prisma.report.update({
      where: { id: reportId },
      data: { name, queryKey: queryKey || null, connectionId: connIdNum || null, sqlQuery: sqlQuery || null }
    });
    res.json({ id: updated.id, name: updated.name, status: updated.status, queryKey: updated.queryKey, connectionId: updated.connectionId, sqlQuery: updated.sqlQuery });
  } catch (e: any) {
    console.error('Update report error', e);
    res.status(500).json({ error: e?.message || 'Failed to update report' });
  }
});

// Trigger run
router.post('/:id/run', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  
  // Check if user has permission to view/run reports
  const userId = parseInt(req.user!.userId);
  const canView = await userHasPermission(userId, tenantId, 'canViewReports');
  if (!canView) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to run reports' });
  }
  
  const reportId = parseInt(req.params.id);
  const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId } });
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status === 'running') return res.status(409).json({ error: 'Report already running' });
  enqueueReport(report.id, tenantId);
  res.json({ message: 'Enqueued', reportId: report.id });
});

// Latest result
router.get('/:id/result', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  
  // Check if user has permission to view report results
  const userId = parseInt(req.user!.userId);
  const canView = await userHasPermission(userId, tenantId, 'canViewReports');
  if (!canView) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to view report results' });
  }
  
  const reportId = parseInt(req.params.id);
  
  // Get report with execution results
  const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId, deletedAt: null } });
  if (!report) return res.status(404).json({ error: 'Report not found' });
  
  if (!report.startedAt) return res.status(404).json({ error: 'No results' });
  res.json({
    id: report.id,
    reportId: report.id,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    data: report.dataJson,
    error: report.error
  });
});

// Delete report (owner, delegate, platform_admin only)
router.delete('/:id', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  if (!(await canDeleteReports(req, tenantId))) {
    return res.status(403).json({ error: 'Forbidden: delete report permission required' });
  }
  const reportId = parseInt(req.params.id);
  try {
    const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId, deletedAt: null } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    
    // Soft delete the report
    await prisma.report.update({ where: { id: reportId }, data: { deletedAt: new Date() } });
    
    res.status(204).send();
  } catch (e: any) {
    console.error('Delete report error', e);
    res.status(500).json({ error: e?.message || 'Failed to delete report' });
  }
});

// Execute SQL query and cache results
router.post('/:id/execute-query', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  
  // Check if user has permission to edit reports (execute query requires edit)
  const userId = parseInt(req.user!.userId);
  const canEdit = await userHasPermission(userId, tenantId, 'canEditReports');
  if (!canEdit) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to execute queries' });
  }
  
  const reportId = parseInt(req.params.id);
  const { sqlQuery, connectionId: requestConnectionId } = req.body;

  if (!sqlQuery) {
    return res.status(400).json({ error: 'SQL query is required' });
  }

  try {
    const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    
    // Use connectionId from request (for editing) or from saved report
    // Parse connectionId to integer if it's a string
    const connectionId = requestConnectionId 
      ? parseInt(String(requestConnectionId), 10) 
      : report.connectionId;
    
    // Ensure connectionId is a valid number
    if (!connectionId || isNaN(connectionId)) {
      return res.status(400).json({ error: 'Report must have a valid database connection selected' });
    }

    const result = await executeAndCacheQuery(tenantId, reportId, connectionId, sqlQuery);
    
    // Update the report with the SQL query
    await prisma.report.update({
      where: { id: reportId },
      data: { sqlQuery },
    });

    res.json({
      success: true,
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rowCount,
    });
  } catch (e: any) {
    console.error('Query execution error', e);
    res.status(500).json({ error: e?.message || 'Failed to execute query' });
  }
});

// Get cached query results
router.get('/:id/results', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  
  // Check if user has permission to view report results
  const userId = parseInt(req.user!.userId);
  const canView = await userHasPermission(userId, tenantId, 'canViewReports');
  if (!canView) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions to view cached results' });
  }
  
  const reportId = parseInt(req.params.id);
  try {
    const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId } });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const cached = await getCachedResults(reportId);
    if (!cached) {
      return res.json({ data: null, message: 'No cached results available' });
    }

    res.json({
      executedAt: cached.executedAt,
      data: cached.data,
      error: cached.error,
    });
  } catch (e: any) {
    console.error('Get results error', e);
    res.status(500).json({ error: e?.message || 'Failed to get results' });
  }
});

// Save chart configuration
router.put('/:id/chart-config', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Client context required; provide x-tenant-id header' });
  }
  const tenantId = parseInt(req.tenantId);
  
  // Check if user has permission to edit reports
  if (!(await canEditReports(req, tenantId))) {
    return res.status(403).json({ error: 'Forbidden: edit permission required' });
  }
  
  const reportId = parseInt(req.params.id);
  const { chartConfig } = req.body;

  try {
    const report = await prisma.report.findFirst({ where: { id: reportId, clientId: tenantId } });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: { chartConfig: chartConfig || null },
    });

    res.json({
      success: true,
      chartConfig: updated.chartConfig,
    });
  } catch (e: any) {
    console.error('Chart config save error', e);
    res.status(500).json({ error: e?.message || 'Failed to save chart configuration' });
  }
});

export default router;
