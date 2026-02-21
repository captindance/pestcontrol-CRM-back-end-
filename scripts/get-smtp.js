import mysql from 'mysql2/promise';

async function getSmtp() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'test',
    password: 'test',
    database: 'pest_reporting'
  });
  
  const [rows] = await conn.query(`
    SELECT config_json, secrets_enc_cipher, secrets_enc_iv, secrets_enc_tag
    FROM integration_settings 
    WHERE kind = 'email' AND provider = 'smtp'
    LIMIT 1
  `);
  
  if (rows.length > 0) {
    console.log('SMTP Config:');
    console.log(JSON.stringify(rows[0], null, 2));
  } else {
    console.log('❌ No SMTP config found');
  }
  
  await conn.end();
}

getSmtp();
