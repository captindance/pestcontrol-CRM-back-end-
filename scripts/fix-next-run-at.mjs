// Migration script: fix stale nextRunAt values
// Uses compiled dist/services/scheduleService.js and @prisma/client directly

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root
const envPath = resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const { calculateNextRunTime } = await import('../dist/services/scheduleService.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

async function fixNextRunAt() {
  console.log('🔄 Fixing stale nextRunAt values (old setHours -> new setUTCHours)...\n');

  const schedules = await prisma.reportSchedule.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      frequency: true,
      timeOfDay: true,
      timezone: true,
      dayOfWeek: true,
      dayOfMonth: true,
      nextRunAt: true,
    },
  });

  console.log(`Found ${schedules.length} active schedule(s) to fix.\n`);

  const now = new Date();
  let updatedCount = 0;

  for (const schedule of schedules) {
    const newNextRunAt = calculateNextRunTime(
      schedule.frequency,
      schedule.timeOfDay,
      schedule.timezone,
      schedule.dayOfWeek,
      schedule.dayOfMonth,
      now
    );

    const oldStr = schedule.nextRunAt ? schedule.nextRunAt.toISOString() : 'null';
    const newStr = newNextRunAt.toISOString();

    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: newNextRunAt },
    });

    console.log(`  ✅ "${schedule.name}" (${schedule.frequency} @ ${schedule.timeOfDay} tz=${schedule.timezone})`);
    console.log(`     OLD nextRunAt: ${oldStr}`);
    console.log(`     NEW nextRunAt: ${newStr}`);
    updatedCount++;
  }

  console.log(`\n✅ Done! Updated ${updatedCount} schedule(s).`);
}

await fixNextRunAt();
await prisma.$disconnect();
process.exit(0);
