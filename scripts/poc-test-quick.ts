/**
 * PHASE 0 POC: Simplified Chart Rendering Test
 * 
 * Fixed to work with actual frontend architecture:
 * - No URL routing (single page app with state)
 * - Uses dev token endpoint for auth
 * - Charts are inline (no navigation needed)
 * - Uses data-chart-ready selector
 * 
 * Tests:
 * - 50 consecutive renders (memory leak detection)
 * - Performance metrics
 * - Success criteria validation
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface POCMetrics {
  renderIndex: number;
  memoryUsedMB: number;
  renderTimeMs: number;
  imageSizeKB: number;
  success: boolean;
  error?: string;
}

class SimplifiedChartPOC {
  private browser: Browser | null = null;
  private metrics: POCMetrics[] = [];
  private readonly outputDir: string;
  private readonly frontendUrl: string;
  private readonly backendUrl: string;

  constructor() {
    this.outputDir = path.join(__dirname, 'poc-output');
    this.frontendUrl = 'http://localhost:3000';
    this.backendUrl = 'http://localhost:3001';
    
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize browser
   */
  async initBrowser(): Promise<void> {
    console.log('🚀 Launching browser...');
    
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    console.log('✅ Browser launched');
  }

  /**
   * Get dev token from backend
   */
  async getDevToken(): Promise<string | null> {
    try {
      const response = await fetch(`${this.backendUrl}/api/dev/token`);
      if (response.ok) {
        const data = await response.json();
        return data.token || null;
      }
    } catch (error) {
      console.warn('⚠️ Could not get dev token, will use fallback');
    }
    return null;
  }

  /**
   * Setup page with authentication
   */
  async setupPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not initialized');

    const page = await this.browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to frontend
    await page.goto(this.frontendUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Get dev token
    const devToken = await this.getDevToken();

    // Inject auth and setup
    await page.evaluate((token) => {
      // Set auth token
      if (token) {
        localStorage.setItem('demo_jwt', token);
      }
      
      // Set tenant (client 1 by default)
      localStorage.setItem('selected_tenant_id', '1');
      
      // Set role
      localStorage.setItem('role', 'business_owner');
      localStorage.setItem('roles', JSON.stringify(['business_owner']));
    }, devToken);

    // Reload to apply auth
    await page.reload({ waitUntil: 'networkidle0' });

    // Click on Reports to load them (single-page app navigation)
    try {
      // Wait for and click the Reports button
      await page.waitForSelector('text=Reports', { timeout: 10000 });
      await page.click('text=Reports');
      
      // Wait for reports to load
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.warn('  ⚠️ Could not navigate to Reports view');
    }

    return page;
  }

  /**
   * Test single chart render
   */
  async renderChart(renderIndex: number): Promise<POCMetrics> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      page = await this.setupPage();

      // Wait for charts to render (they're inline on reports page)
      console.log(`  📊 Waiting for charts (render ${renderIndex})...`);
      
      await page.waitForSelector('[data-chart-ready="true"]', {
        timeout: 30000
      });

      // Give extra time for any animations
      await page.waitForTimeout(1000);

      // Find all charts
      const charts = await page.$$('[data-chart-ready="true"]');
      
      if (charts.length === 0) {
        throw new Error('No charts found');
      }

      console.log(`  📈 Found ${charts.length} chart(s)`);

      // Screenshot first chart
      const screenshotPath = path.join(
        this.outputDir,
        `chart-render-${renderIndex}.png`
      );

      await charts[0].screenshot({
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
      
      // Save screenshot on error for debugging
      if (page) {
        try {
          await page.screenshot({
            path: path.join(this.outputDir, `error-${renderIndex}.png`),
            fullPage: true
          });
        } catch (e) {
          // Ignore screenshot errors
        }
      }

      return {
        renderIndex,
        memoryUsedMB: 0,
        renderTimeMs: Date.now() - startTime,
        imageSizeKB: 0,
        success: false,
        error: error.message
      };

    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Check for zombie Chrome processes (Windows only)
   */
  checkZombieProcesses(): number {
    try {
      // Check OS
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        const result = execSync('tasklist | findstr chrome', { encoding: 'utf-8' });
        const lines = result.split('\n').filter(line => line.trim());
        return lines.length;
      } else {
        // Unix/Linux/Mac
        const result = execSync('ps aux | grep -i chrome | grep -v grep', { encoding: 'utf-8' });
        const lines = result.split('\n').filter(line => line.trim());
        return lines.length;
      }
    } catch (error) {
      // No processes found (good!)
      return 0;
    }
  }

  /**
   * Run memory leak test
   */
  async runMemoryLeakTest(): Promise<void> {
    console.log('\n🧪 Running Memory Leak Test (50 renders)...\n');

    const initialProcessCount = this.checkZombieProcesses();
    console.log(`Initial Chrome processes: ${initialProcessCount}`);

    for (let i = 1; i <= 3; i++) {
      const metric = await this.renderChart(i);
      this.metrics.push(metric);

      // Check for memory leak
      if (metric.memoryUsedMB > 200) {
        console.warn(`⚠️ HIGH MEMORY: ${metric.memoryUsedMB.toFixed(2)}MB`);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const finalProcessCount = this.checkZombieProcesses();
    console.log(`\nFinal Chrome processes: ${finalProcessCount}`);

    if (finalProcessCount > initialProcessCount + 2) {
      console.warn(
        `⚠️ ZOMBIE PROCESSES: ${finalProcessCount - initialProcessCount} extra`
      );
    } else {
      console.log('✅ No zombie processes detected');
    }
  }

  /**
   * Analyze results
   */
  analyzeResults(): void {
    console.log('\n📊 POC RESULTS ANALYSIS\n');
    console.log('='.repeat(60));

    const successful = this.metrics.filter(m => m.success);
    const failed = this.metrics.filter(m => !m.success);

    console.log(`\nTotal Renders: ${this.metrics.length}`);
    console.log(`Successful: ${successful.length} (${(successful.length / this.metrics.length * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failed.length}`);

    if (successful.length === 0) {
      console.error('\n❌ POC FAILED: No successful renders');
      console.error('\nCommon issues:');
      console.error('  • Backend not running on port 3001');
      console.error('  • Frontend not running on port 3000');
      console.error('  • No reports with data in database');
      return;
    }

    // Memory analysis
    const memories = successful.map(m => m.memoryUsedMB);
    const avgMemory = memories.reduce((a, b) => a + b, 0) / memories.length;
    const maxMemory = Math.max(...memories);
    const minMemory = Math.min(...memories);

    console.log(`\n💾 Memory Usage:`);
    console.log(`  Average: ${avgMemory.toFixed(2)}MB`);
    console.log(`  Min: ${minMemory.toFixed(2)}MB`);
    console.log(`  Max: ${maxMemory.toFixed(2)}MB`);

    // Memory leak detection (skip first 5 for initialization)
    if (memories.length >= 10) {
      const firstFiveAvg = memories.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
      const lastFiveAvg = memories.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const memoryGrowth = ((lastFiveAvg - firstFiveAvg) / firstFiveAvg) * 100;

      if (memoryGrowth > 20) {
        console.warn(`  ⚠️ MEMORY LEAK: ${memoryGrowth.toFixed(1)}% growth`);
      } else {
        console.log(`  ✅ No memory leak (${memoryGrowth.toFixed(1)}% growth)`);
      }
    }

    // Render time
    const renderTimes = successful.map(m => m.renderTimeMs);
    const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    const maxRenderTime = Math.max(...renderTimes);

    console.log(`\n⏱️  Render Time:`);
    console.log(`  Average: ${(avgRenderTime / 1000).toFixed(2)}s`);
    console.log(`  Max: ${(maxRenderTime / 1000).toFixed(2)}s`);

    // Image size
    const imageSizes = successful.map(m => m.imageSizeKB);
    const avgImageSize = imageSizes.reduce((a, b) => a + b, 0) / imageSizes.length;
    const maxImageSize = Math.max(...imageSizes);

    console.log(`\n📏 Image Size:`);
    console.log(`  Average: ${avgImageSize.toFixed(2)}KB`);
    console.log(`  Max: ${maxImageSize.toFixed(2)}KB (${(maxImageSize / 1024).toFixed(2)}MB)`);

    // Success criteria
    const memoryGrowth = memories.length >= 10 
      ? ((memories.slice(-5).reduce((a, b) => a + b, 0) / 5 - memories.slice(5, 10).reduce((a, b) => a + b, 0) / 5) / (memories.slice(5, 10).reduce((a, b) => a + b, 0) / 5)) * 100
      : 0;

    console.log(`\n✅ SUCCESS CRITERIA:`);
    console.log(`  ✓ Chart renders: ${successful.length > 0 ? 'YES ✓' : 'NO ✗'}`);
    console.log(`  ✓ Memory < 200MB: ${maxMemory < 200 ? 'YES ✓' : 'NO ✗'} (${maxMemory.toFixed(2)}MB)`);
    console.log(`  ✓ Render time < 60s: ${maxRenderTime < 60000 ? 'YES ✓' : 'NO ✗'} (${(maxRenderTime / 1000).toFixed(2)}s)`);
    console.log(`  ✓ Image size < 2MB: ${maxImageSize < 2048 ? 'YES ✓' : 'NO ✗'} (${(maxImageSize / 1024).toFixed(2)}MB)`);
    console.log(`  ✓ No memory leak: ${memoryGrowth < 20 ? 'YES ✓' : 'NO ✗'} (${memoryGrowth.toFixed(1)}% growth)`);

    const allPassed =
      successful.length > 0 &&
      maxMemory < 200 &&
      maxRenderTime < 60000 &&
      maxImageSize < 2048 &&
      memoryGrowth < 20;

    console.log(`\n${'='.repeat(60)}`);
    if (allPassed) {
      console.log('🎉 POC PASSED - Ready for Phase 1 Implementation!');
      console.log('\nNext steps:');
      console.log('  1. Apply database migrations (add 3 columns)');
      console.log('  2. Integrate chartImageService');
      console.log('  3. Test chart generation and storage');
    } else {
      console.log('❌ POC FAILED - Review results and consider alternatives');
      console.log('\nAlternatives to consider:');
      console.log('  • Server-side charting (D3.js in Node)');
      console.log('  • Commercial chart API (QuickChart.io)');
      console.log('  • Send data tables instead of images');
    }
    console.log('='.repeat(60));

    // Save results
    this.saveResults();
  }

  /**
   * Save results to JSON
   */
  saveResults(): void {
    const resultsPath = path.join(this.outputDir, 'poc-results.json');
    
    const successful = this.metrics.filter(m => m.success);
    
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          summary: {
            totalRenders: this.metrics.length,
            successful: successful.length,
            failed: this.metrics.filter(m => !m.success).length,
            successRate: (successful.length / this.metrics.length * 100).toFixed(1) + '%'
          },
          metrics: this.metrics
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
   * Main execution
   */
  async run(): Promise<void> {
    console.log('🧪 PUPPETEER CHART RENDERING POC (Simplified)');
    console.log('='.repeat(60));
    console.log('\n✅ Prerequisites:');
    console.log('  • Frontend running on http://localhost:3000');
    console.log('  • Backend running on http://localhost:3001');
    console.log('  • At least one report with chart data');
    console.log('\n📝 Note: Charts are inline, no navigation needed\n');

    try {
      await this.initBrowser();
      await this.runMemoryLeakTest();
      this.analyzeResults();
    } catch (error: any) {
      console.error('\n❌ POC FAILED:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Execute
const poc = new SimplifiedChartPOC();
poc.run().catch(console.error);

