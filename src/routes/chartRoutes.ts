import express from 'express';

const router = express.Router();

// Chart rendering endpoint for Puppeteer (no authentication needed, uses secret)
router.get('/charts/render', (req, res) => {
  const { secret } = req.query;
  const chartSecret = process.env.PUPPETEER_CHART_SECRET || 'dev-secret-change-in-prod';
  
  if (secret !== chartSecret) {
    return res.status(403).send('Forbidden');
  }
  
  // Return minimal HTML page that will render chart when data is injected
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
        .chart-container { display: inline-block; }
      </style>
    </head>
    <body>
      <div id="chart-root"></div>
      
      <script>
        // Wait for chart data to be injected
        (function() {
          const checkData = setInterval(() => {
            if (window.CHART_DATA) {
              clearInterval(checkData);
              renderChart(window.CHART_DATA);
            }
          }, 100);
          
          // Timeout after 5 seconds
          setTimeout(() => {
            clearInterval(checkData);
            if (!window.CHART_DATA) {
              document.getElementById('chart-root').innerHTML = '<div style="color: red;">Chart data not provided</div>';
            }
          }, 5000);
        })();
        
        function renderChart(data) {
          const { dataJson, chartConfig, name } = data;
          
          // Transform dataJson to chart format
          let chartData;
          
          if (dataJson.columns && dataJson.rows) {
            // Database query format: { columns: [], rows: [] }
            const labelColumn = dataJson.columns[0];
            const dataColumns = dataJson.columns.slice(1);
            const categories = dataJson.rows.map(row => row[labelColumn]);
            
            const series = dataColumns.map((colName) => {
              return {
                name: colName.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase()),
                data: dataJson.rows.map(row => parseFloat(row[colName]) || 0)
              };
            });
            
            // Determine formats (currency for income/revenue columns)
            const seriesFormats = {};
            dataColumns.forEach(col => {
              const lowerCol = col.toLowerCase();
              if (lowerCol.includes('income') || lowerCol.includes('revenue') || lowerCol.includes('total')) {
                const formattedName = col.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
                seriesFormats[formattedName] = 'currency:2';
              }
            });
            
            chartData = {
              type: chartConfig?.chartType || 'bar',
              categories,
              series,
              xLabel: labelColumn.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase()),
              yLabel: 'Value',
              seriesFormats,
              displayOptions: { showValuesOnBars: true }
            };
          } else {
            // Already in chart format
            chartData = dataJson;
          }
          
          // Render based on chart type
          const root = document.getElementById('chart-root');
          
          if (chartData.type === 'bar') {
            root.innerHTML = renderBarChart(chartData);
          } else if (chartData.type === 'table') {
            root.innerHTML = renderTable(chartData);
          } else {
            root.innerHTML = '<div>Unsupported chart type: ' + chartData.type + '</div>';
          }
        }
        
        function renderBarChart(data) {
          const { categories, series, xLabel, yLabel, seriesFormats = {}, displayOptions = {} } = data;
          
          // Calculate scaling
          const seriesMaxValues = series.map(s => {
            const nums = s.data.map(v => isFinite(v) ? v : 0);
            return nums.length ? Math.max(...nums, 1) : 1;
          });
          const sharedMax = Math.max(...seriesMaxValues, 1);
          const minSeriesMax = Math.max(Math.min(...seriesMaxValues), 1);
          const useSeparateScale = sharedMax / minSeriesMax > 20;
          
          const barWidth = series.length === 1 ? 36 : 28;
          const barGap = 8;
          
          let barsHTML = '';
          categories.forEach((cat, idx) => {
            let innerBars = '';
            series.forEach((s, si) => {
              const val = s.data[idx];
              const numVal = isFinite(val) ? val : 0;
              const denom = useSeparateScale ? seriesMaxValues[si] : sharedMax;
              const height = (numVal / denom) * 100;
              const heightPx = (height / 100) * 300;
              const formattedVal = formatValue(val, seriesFormats[s.name]);
              const color = palette(si);
              
              const labelHTML = displayOptions.showValuesOnBars && numVal > 0
                ? \`<div style="position: absolute; top: -26px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #111; background: rgba(255,255,255,0.95); border: 1px solid #ccc; border-radius: 3px; padding: 2px 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.12);">\${formattedVal}</div>\`
                : '';
              
              innerBars += \`
                <div style="width: \${barWidth}px; height: \${height}%; min-height: \${numVal > 0 ? '6px' : '0px'}; background: \${color}; border-radius: 4px 4px 0 0; position: relative;">
                  \${labelHTML}
                </div>
              \`;
            });
            
            barsHTML += \`
              <div style="display: inline-block; vertical-align: top; text-align: center; margin: 0 10px;">
                <div style="display: flex; align-items: flex-end; justify-content: center; gap: \${barGap}px; height: 300px; position: relative; padding-top: 30px;">
                  \${innerBars}
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: #555; text-align: center; max-width: 100px; word-wrap: break-word; line-height: 1.2;">\${formatCategoryLabel(cat)}</div>
              </div>
            \`;
          });
          
          // Legend
          const legendHTML = series.map((s, idx) => 
            \`<span style="display: inline-block; margin-right: 16px; margin-top: 8px;">
              <span style="display: inline-block; width: 12px; height: 12px; background: \${palette(idx)}; border-radius: 2px; vertical-align: middle; margin-right: 4px;"></span>
              <span style="font-size: 13px; color: #555; vertical-align: middle;">\${s.name}</span>
            </span>\`
          ).join('');
          
          const scaleNote = useSeparateScale 
            ? '<div style="margin-top: 12px; font-size: 12px; color: #666; text-align: center; font-style: italic;">Note: Series are scaled independently for visibility</div>'
            : '';
          
          return \`
            <div class="chart-container" data-chart-type="bar" data-chart-ready="true" style="padding: 20px; background: #f8fafc; border: 1px solid #e3e9ef; border-radius: 6px;">
              <div style="text-align: center; white-space: nowrap; overflow-x: auto;">
                \${barsHTML}
              </div>
              <div style="margin-top: 16px; text-align: center;">
                \${legendHTML}
              </div>
              \${scaleNote}
              <div style="text-align: center; color: #666; font-size: 12px; margin-top: 12px;">\${xLabel || ''}</div>
            </div>
          \`;
        }
        
        function renderTable(data) {
          const { columns, rows } = data;
          let html = '<table class="chart-container" data-chart-ready="true" data-chart-type="table" style="width: 100%; border-collapse: collapse;">';
          html += '<thead><tr>';
          columns.forEach(c => {
            html += \`<th style="border: 1px solid #ccc; padding: 8px; background: #f0f0f0;">\${c}</th>\`;
          });
          html += '</tr></thead><tbody>';
          rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
              html += \`<td style="border: 1px solid #eee; padding: 8px;">\${cell}</td>\`;
            });
            html += '</tr>';
          });
          html += '</tbody></table>';
          return html;
        }
        
        function palette(i) {
          const colors = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#219653', '#f2c94c'];
          return colors[i % colors.length];
        }
        
        function formatValue(val, fmt) {
          if (!isFinite(val)) return val;
          const [formatType, decimalsStr] = (fmt || 'number').split(':');
          const decimals = decimalsStr ? parseInt(decimalsStr, 10) : undefined;
          
          if (formatType === 'currency') {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: decimals ?? 2,
              maximumFractionDigits: decimals ?? 2
            }).format(val);
          }
          
          if (formatType === 'percentage') {
            return new Intl.NumberFormat('en-US', {
              style: 'percent',
              minimumFractionDigits: decimals ?? 1,
              maximumFractionDigits: decimals ?? 1
            }).format(val / 100);
          }
          
          return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals ?? 0,
            maximumFractionDigits: decimals ?? 0
          }).format(val);
        }
        
        function formatCategoryLabel(label) {
          const str = String(label || '');
          if (str.length > 20) return str.slice(0, 17) + '...';
          return str;
        }
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
});

export default router;
