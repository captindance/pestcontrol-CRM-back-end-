import { Cluster } from 'puppeteer-cluster';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

let cluster: Cluster | null = null;

// Initialize Puppeteer cluster with connection pooling
export async function initializeChartCluster(): Promise<void> {
  if (cluster) return;

  try {
    cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_PAGE, // Reuse browser, new page per task
      maxConcurrency: 3, // 3 parallel chart generations max
      puppeteerOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Fixes Windows memory issues
          '--disable-gpu',
          '--disable-web-security', // Allow localhost access
        ]
      },
      timeout: 30000, // 30s timeout per chart
    });

    logger.log('[ChartImage] Puppeteer cluster initialized (3 workers)');
  } catch (error) {
    logger.error('[ChartImage] Failed to initialize cluster:', error);
    throw error;
  }
}

// Generate chart image for a report
export async function generateChartImage(reportId: number): Promise<void> {
  try {
    logger.log(`[ChartImage] Generating chart for report ${reportId}...`);

    // Fetch report data
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        name: true,
        dataJson: true,
        chartConfig: true,
        clientId: true
      }
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    if (!report.dataJson) {
      throw new Error(`Report ${reportId} has no data`);
    }

    // Initialize cluster if needed
    if (!cluster) {
      await initializeChartCluster();
    }

    // Generate chart via Puppeteer
    const startTime = Date.now();
    
    const imageBuffer = await cluster!.execute({ report }, async ({ page, data }) => {
      const { report } = data;
      
      // Navigate to chart render endpoint
      const chartSecret = process.env.PUPPETEER_CHART_SECRET || 'dev-secret-change-in-prod';
      const url = `http://localhost:${process.env.PORT || 3001}/api/charts/render?secret=${encodeURIComponent(chartSecret)}`;
      
      // Set up request interception to block external requests (security)
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const reqUrl = request.url();
        if (reqUrl.startsWith('http://localhost') || reqUrl.startsWith('data:')) {
          request.continue();
        } else {
          logger.warn(`[ChartImage] Blocked external request: ${reqUrl}`);
          request.abort();
        }
      });
      
      // POST the report data to render endpoint
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
      
      // Inject report data and trigger render
      await page.evaluate((reportData) => {
        (window as any).CHART_DATA = reportData;
      }, { dataJson: report.dataJson, chartConfig: report.chartConfig, name: report.name });
      
      // Wait for chart to render
      await page.waitForSelector('[data-chart-ready="true"]', { timeout: 10000 });
      
      // Wait for fonts to load
      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 500)); // Extra time for rendering
      
      // Screenshot the chart
      const chartElement = await page.$('[data-chart-ready="true"]');
      if (!chartElement) {
        throw new Error('Chart element not found');
      }
      
      const buffer = await chartElement.screenshot({ type: 'png' });
      return buffer;
    });

    const renderTime = Date.now() - startTime;
    const sizeKB = (imageBuffer.length / 1024).toFixed(2);
    
    logger.log(`[ChartImage] Chart rendered in ${renderTime}ms, size: ${sizeKB}KB`);

    // Validate size (10MB limit for database)
    if (imageBuffer.length > 10 * 1024 * 1024) {
      throw new Error(`Chart image too large: ${sizeKB}KB (limit: 10MB)`);
    }

    // Save to database
    await prisma.report.update({
      where: { id: reportId },
      data: {
        chartImageData: imageBuffer,
        chartImageGeneratedAt: new Date(),
        chartImageError: null
      }
    });

    logger.log(`[ChartImage] ✓ Chart saved to database for report ${reportId}`);

  } catch (error: any) {
    logger.error(`[ChartImage] ✗ Failed to generate chart for report ${reportId}:`, error.message);

    // Save error to database (graceful degradation)
    await prisma.report.update({
      where: { id: reportId },
      data: {
        chartImageError: error.message,
        chartImageGeneratedAt: new Date()
      }
    });
  }
}

// Close Puppeteer cluster on shutdown
export async function closeChartCluster(): Promise<void> {
  if (cluster) {
    await cluster.close();
    cluster = null;
    logger.log('[ChartImage] Puppeteer cluster closed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await closeChartCluster();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeChartCluster();
  process.exit(0);
});
