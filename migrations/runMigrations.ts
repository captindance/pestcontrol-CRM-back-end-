import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../src/db/database.js';

async function run() {
  const dir = path.resolve(process.cwd(), 'migrations');
  const files: string[] = fs.readdirSync(dir).filter((f: string) => /\d+_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log(`Applying migration: ${file}`);
    const statements: string[] = sql
      .split(/;\s*\n/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length);
    for (const stmt of statements) {
      if (!stmt) continue;
      await pool.execute(stmt);
    }
  }
  console.log('Migrations applied.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});
