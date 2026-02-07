import { prisma } from './db/prisma.js';

// Simple in-memory job queue
interface PendingJob { reportId: number; clientId: number; }
const queue: PendingJob[] = [];
let processing = false;

export function enqueueReport(reportId: number, clientId: number) {
  queue.push({ reportId, clientId });
  void processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const job = queue.shift()!;
  const report = await prisma.report.findFirst({ where: { id: job.reportId, clientId: job.clientId } });
  if (!report) continue;
  await prisma.report.update({ where: { id: report.id }, data: { status: 'running' } });
    const startedAt = new Date();
    try {
      // Simulate long-running external fetch + transform
      await new Promise(res => setTimeout(res, 1500));
      const data = mockGenerateData(report.queryKey || 'default');
      await prisma.report.update({
        where: { id: report.id },
        data: {
          startedAt,
          finishedAt: new Date(),
          dataJson: data,
          status: 'idle'
        }
      });
    } catch (e: any) {
      await prisma.report.update({
        where: { id: report.id },
        data: {
          startedAt,
          finishedAt: new Date(),
          error: e?.message || 'Unknown error',
          status: 'idle'
        }
      });
    }
  }
  processing = false;
}

function mockGenerateData(query: string) {
  // Return chart-ready shape
  switch (query) {
    case 'monthly_service_summary':
      return {
        type: 'bar',
        series: [
          { name: 'Services', data: monthValues(12) }
        ],
        categories: months(12)
      };
    case 'tech_productivity':
      return {
        type: 'line',
        series: [
          { name: 'Stops per Day', data: randomValues(14, 30, 55) }
        ],
        categories: days(14)
      };
    case 'route_efficiency':
      return {
        type: 'pie',
        series: [
          { name: 'Efficiency', data: [60, 25, 15] }
        ],
        categories: ['Optimized', 'OK', 'Needs Review']
      };
    default:
      return { type: 'table', columns: ['colA', 'colB'], rows: [[1, 2], [3, 4]] };
  }
}

function randomValues(n: number, min: number, max: number) { return Array.from({ length: n }, () => Math.floor(Math.random() * (max - min) + min)); }
function monthValues(n: number) { return randomValues(n, 50, 200); }
function months(n: number) { const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return m.slice(0, n); }
function days(n: number) { return Array.from({ length: n }, (_, i) => `Day ${i+1}`); }
