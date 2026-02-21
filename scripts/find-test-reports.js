import mysql from 'mysql2/promise';

async function findReports() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'test',
    password: 'test',
    database: 'pest_reporting'
  });
  
  console.log('📋 All Reports in Database:\n');
  
  const [reports] = await conn.query(`
    SELECT 
      id,
      name,
      client_id,
      sql_query,
      chart_config,
      data_json
    FROM reports
    WHERE deleted_at IS NULL
    ORDER BY id
  `);
  
  if (reports.length === 0) {
    console.log('❌ No reports found');
  } else {
    for (const r of reports) {
      const chartConfig = typeof r.chart_config === 'string' ? JSON.parse(r.chart_config) : r.chart_config;
      const dataJson = typeof r.data_json === 'string' ? JSON.parse(r.data_json) : r.data_json;
      
      console.log(`\nReport ID: ${r.id}`);
      console.log(`Name: ${r.name}`);
      console.log(`Client ID: ${r.client_id}`);
      console.log(`Chart Type: ${chartConfig?.chartType || 'none'}`);
      console.log(`Has Data: ${dataJson ? 'Yes' : 'No'}`);
      if (r.sql_query) {
        console.log(`Query: ${r.sql_query.substring(0, 120)}...`);
      }
      console.log('-'.repeat(80));
    }
    
    console.log(`\n✅ Found ${reports.length} reports total`);
  }
  
  await conn.end();
}

findReports().catch(console.error);
