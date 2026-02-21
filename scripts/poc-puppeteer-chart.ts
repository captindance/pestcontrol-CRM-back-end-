/**
 * PHASE 0 POC: Puppeteer Chart Rendering Test
 * 
 * Tests chart rendering with:
 * - Memory leak detection (50+ renders)
 * - Zombie process monitoring
 * - Performance metrics
 * - Error handling
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface POCMetrics {
  renderIndex: number;
  memoryUsedMB: number;
  renderTimeMs: number;
  imageSizeKB: number;
  success: boolean;
  error?: string;
}

class ChartRenderingPOC {
  private browser: Browser | null = null;
  private metrics: POCMetrics[] = [];
  private readonly outputDir: string;
  private readonly reportId: number;
  private readonly frontendUrl: string;

  constructor(reportId: number = 1) {
    this.reportId = reportId;
    this.outputDir = path.join(__dirname, 'poc-output');
    this.frontendUrl = `http://localhost:3000`;
    
    // Create output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize Puppeteer browser
   */
  async initBrowser(): Promise<void> {
    console.log('🚀 Launching Puppeteer browser...');
    
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });

    console.log('✅ Browser launched');
  }

  /**
   * Test single chart render
   */
  async renderChart(renderIndex: number): Promise<POCMetrics> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const startTime = Date.now();
    const page = await this.browser.newPage();

    try {
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to reports page
      console.log(`  📄 Loading report page (render ${renderIndex})...`);
      await page.goto(`${this.frontendUrl}/reports`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Wait for report list to load
      await page.waitForSelector('.report-item, .reports-container', {
        timeout: 10000
      });

      // Click on report to view it
      const reportSelector = `[data-report-id="${this.reportId}"]`;
      const reportExists = await page.$(reportSelector);
      
      if (!reportExists) {
        // Try alternate approach: click first report
        await page.click('.report-item:first-child, .view-report-btn:first-child');
      } else {
        await page.click(reportSelector);
      }

      // Wait for chart to render
      console.log(`  📊 Waiting for chart...`);
      await page.waitForSelector('.chart-container, canvas, svg', {
        timeout: 30000
      });

      // Give extra time for animations to complete
      await page.waitForTimeout(2000);

      // Find and screenshot chart
      const chartElement = await page.$('.chart-container');
      if (!chartElement) {
        throw new Error('Chart element not found');
      }

      const screenshotPath = path.join(
        this.outputDir,
        `chart-render-${renderIndex}.png`
      );

      await chartElement.screenshot({
        path: screenshotPath,
        type: 'png'
      });

      const renderTime = Date.now() - startTime;

      // Get memory metrics
      const metrics = await page.metrics();
      const memoryUsedMB = metrics.JSHeapUsedSize / 1024 / 1024;

      // Get image size
      const stats = fs.statSync(screenshotPath);
      const imageSizeKB = stats.size / 1024;

      console.log(
        `  ✅ Render ${renderIndex}: ${renderTime}ms, ` +
        `${memoryUsedMB.toFixed(2)}MB, ` +
        `${imageSizeKB.toFixed(2)}KB`
      );

      return {
        renderIndex,
        memoryUsedMB,
        renderTimeMs: renderTime,
        imageSizeKB,
        success: true
      };

    } catch (error: any) {
      console.error(`  ❌ Render ${renderIndex} failed:`, error.message);
      
      return {
        renderIndex,
        memoryUsedMB: 0,
        renderTimeMs: Date.now() - startTime,
        imageSizeKB: 0,
        success: false,
        error: error.message
      };

    } finally {
      await page.close();
    }
  }

  /**
   * Check for zombie Chrome processes
   */
  checkZombieProcesses(): number {
    try {
      const result = execSync('tasklist | findstr chrome', { encoding: 'utf-8' });
      const lines = result.split('\n').filter(line => line.trim());
      return lines.length;
    } catch (error) {
      // No chrome processes found (good!)
      return 0;
    }
  }

  /**
   * Run memory leak test (50 consecutive renders)
   */
  async runMemoryLeakTest(): Promise<void> {
    console.log('\n🧪 Running Memory Leak Test (50 renders)...\n');

    const initialProcessCount = this.checkZombieProcesses();
    console.log(`Initial Chrome processes: ${initialProcessCount}`);

    for (let i = 1; i <= 50; i++) {
      const metric = await this.renderChart(i);
      this.metrics.push(metric);

      // Check for memory leak (>200MB sustained)
      if (metric.memoryUsedMB > 200) {
        console.warn(`⚠️ HIGH MEMORY: ${metric.memoryUsedMB.toFixed(2)}MB`);
      }

      // Small delay between renders
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const finalProcessCount = this.checkZombieProcesses();
    console.log(`\nFinal Chrome processes: ${finalProcessCount}`);

    if (finalProcessCount > initialProcessCount + 2) {
      console.warn(`⚠️ ZOMBIE PROCESSES DETECTED: ${finalProcessCount - initialProcessCount} extra processes`);
    }
  }

  /**
   * Analyze results and generate report
   */
  analyzeResults(): void {
    console.log('\n📊 POC RESULTS ANALYSIS\n');
    console.log('='.repeat(60));

    const successfulRenders = this.metrics.filter(m => m.success);
    const failedRenders = this.metrics.filter(m => !m.success);

    console.log(`\nTotal Renders: ${this.metrics.length}`);
    console.log(`Successful: ${successfulRenders.length} (${(successfulRenders.length / this.metrics.length * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failedRenders.length}`);

    if (successfulRenders.length === 0) {
      console.error('\n❌ POC FAILED: No successful renders');
      return;
    }

    // Memory analysis
    const memories = successfulRenders.map(m => m.memoryUsedMB);
    const avgMemory = memories.reduce((a, b) => a + b, 0) / memories.length;
    const maxMemory = Math.max(...memories);
    const minMemory = Math.min(...memories);

    console.log(`\n💾 Memory Usage:`);
    console.log(`  Average: ${avgMemory.toFixed(2)}MB`);
    console.log(`  Min: ${minMemory.toFixed(2)}MB`);
    console.log(`  Max: ${maxMemory.toFixed(2)}MB`);

    // Check for memory leak (increasing trend)
    const firstFiveAvg = memories.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const lastFiveAvg = memories.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const memoryGrowth = ((lastFiveAvg - firstFiveAvg) / firstFiveAvg) * 100;

    if (memoryGrowth > 20) {
      console.warn(`  ⚠️ MEMORY LEAK DETECTED: ${memoryGrowth.toFixed(1)}% growth from first 5 to last 5`);
    } else {
      console.log(`  ✅ No memory leak detected (${memoryGrowth.toFixed(1)}% growth)`);
    }

    // Render time analysis
    const renderTimes = successfulRenders.map(m => m.renderTimeMs);
    const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    const maxRenderTime = Math.max(...renderTimes);

    console.log(`\n⏱️  Render Time:`);
    console.log(`  Average: ${(avgRenderTime / 1000).toFixed(2)}s`);
    console.log(`  Max: ${(maxRenderTime / 1000).toFixed(2)}s`);

    // Image size analysis
    const imageSizes = successfulRenders.map(m => m.imageSizeKB);
    const avgImageSize = imageSizes.reduce((a, b) => a + b, 0) / imageSizes.length;
    const maxImageSize = Math.max(...imageSizes);

    console.log(`\n📏 Image Size:`);
    console.log(`  Average: ${avgImageSize.toFixed(2)}KB (${(avgImageSize / 1024).toFixed(2)}MB)`);
    console.log(`  Max: ${maxImageSize.toFixed(2)}KB (${(maxImageSize / 1024).toFixed(2)}MB)`);

    // Success criteria check
    console.log(`\n✅ SUCCESS CRITERIA:`);
    console.log(`  ✓ Chart renders: ${successfulRenders.length > 0 ? 'YES' : 'NO'}`);
    console.log(`  ✓ Memory < 200MB: ${maxMemory < 200 ? 'YES' : 'NO'} (${maxMemory.toFixed(2)}MB)`);
    console.log(`  ✓ Render time < 60s: ${maxRenderTime < 60000 ? 'YES' : 'NO'} (${(maxRenderTime / 1000).toFixed(2)}s)`);
    console.log(`  ✓ Image size < 2MB: ${maxImageSize < 2048 ? 'YES' : 'NO'} (${(maxImageSize / 1024).toFixed(2)}MB)`);
    console.log(`  ✓ No memory leak: ${memoryGrowth < 20 ? 'YES' : 'NO'} (${memoryGrowth.toFixed(1)}% growth)`);

    const allPassed =
      successfulRenders.length > 0 &&
      maxMemory < 200 &&
      maxRenderTime < 60000 &&
      maxImageSize < 2048 &&
      memoryGrowth < 20;

    console.log(`\n${'='.repeat(60)}`);
    if (allPassed) {
      console.log('🎉 POC PASSED - Ready for Phase 1 Implementation!');
    } else {
      console.log('❌ POC FAILED - Consider alternative approaches');
    }
    console.log('='.repeat(60));

    // Save results to file
    this.saveResults();
  }

  /**
   * Save detailed results to JSON file
   */
  saveResults(): void {
    const resultsPath = path.join(this.outputDir, 'poc-results.json');
    
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          reportId: this.reportId,
          metrics: this.metrics,
          summary: {
            totalRenders: this.metrics.length,
            successful: this.metrics.filter(m => m.success).length,
            failed: this.metrics.filter(m => !m.success).length
          }
        },
        null,
        2
      )
    );

    console.log(`\n📄 Detailed results saved to: ${resultsPath}`);
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      console.log('\n🧹 Closing browser...');
      await this.browser.close();
      console.log('✅ Cleanup complete');
    }
  }

  /**
   * Main execution flow
   */
  async run(): Promise<void> {
    console.log('🧪 PUPPETEER CHART RENDERING POC');
    console.log('=' + '='.repeat(60));
    console.log('\nPrerequisites:');
    console.log('  ✓ Frontend running on http://localhost:3000');
    console.log('  ✓ Backend running on http://localhost:3001');
    console.log('  ✓ At least one report with chart exists\n');

    try {
      await this.initBrowser();
      await this.runMemoryLeakTest();
      this.analyzeResults();
    } catch (error: any) {
      console.error('\n❌ POC FAILED WITH ERROR:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Execute POC
const poc = new ChartRenderingPOC(1); // Use report ID 1 (adjust as needed)
poc.run().catch(console.error);
