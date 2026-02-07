import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

// List assigned clients for the authenticated manager
router.get('/me/assignments', async (req: Request, res: Response) => {
  if (!req.user || !req.user.roles?.includes('manager')) {
    return res.status(403).json({ error: 'Forbidden: manager role required' });
  }
  try {
    const userId = parseInt(req.user.userId);
    const assignments = await prisma.userRole.findMany({
      where: { userId, role: 'manager' },
      include: { client: true }
    });
    const result = assignments
      .filter(a => a.client !== null)
      .map(a => ({ clientId: a.clientId, clientName: a.client!.name, createdAt: a.createdAt }));
    res.json(result);
  } catch (e: any) {
    console.error('Manager assignments error', e);
    res.status(500).json({ error: e?.message || 'Failed to fetch assignments' });
  }
});

export default router;
