import mysql from 'mysql2/promise';

async function checkData() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'test',
    password: 'test',
    database: 'pest_reporting'
  });
  
  const [reports] = await conn.query('SELECT id, name, data_json FROM reports WHERE id = 1');
  const report = reports[0];
  
  console.log('Report:', report.name);
  console.log('\nData structure:');
  console.log(JSON.stringify(report.data_json, null, 2));
  
  await conn.end();
}

checkData();
