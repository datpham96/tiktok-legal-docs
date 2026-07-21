import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

function resolveNpx(): string {
  if (process.env.NPX_BIN) return process.env.NPX_BIN;
  const home = process.env.HOME;
  if (home) {
    const nvmRoot = path.join(home, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmRoot)) {
      const versions = fs
        .readdirSync(nvmRoot)
        .map((version) => path.join(nvmRoot, version, 'bin', 'npx'))
        .filter((candidate) => fs.existsSync(candidate))
        .sort();
      if (versions.length > 0) return versions[versions.length - 1];
    }
  }
  return 'npx';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const count = parseInt(process.argv[2] || '60', 10);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error('Usage: ts-node src/bulk-batch.ts [count]');
  }

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const logPath = path.join(LOG_DIR, `bulk-batch-${stamp}.log`);
  const progressPath = path.join(LOG_DIR, 'bulk-batch-progress.json');

  const npx = resolveNpx();
  let success = 0;
  let failed = 0;

  console.log(`🚀 Bulk batch: ${count} videos (series-only, cx/gpt-5.5-image)`);
  console.log(`📋 Log: ${logPath}\n`);

  for (let i = 1; i <= count; i++) {
    const header = `\n${'='.repeat(60)}\nVIDEO ${i}/${count} — ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
    fs.appendFileSync(logPath, header);
    console.log(header);

    const result = spawnSync(npx, ['ts-node', path.join('src', 'daily-batch.ts')], {
      cwd: process.cwd(),
      env: { ...process.env, SERIES_ONLY: '1' },
      encoding: 'utf8',
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`;
    fs.appendFileSync(logPath, output);

    if (result.status === 0) {
      success += 1;
      console.log(`✅ Video ${i}/${count} done (${success} ok, ${failed} fail)`);
    } else {
      failed += 1;
      console.error(`❌ Video ${i}/${count} failed (${success} ok, ${failed} fail)`);
    }

    fs.writeFileSync(
      progressPath,
      `${JSON.stringify({ total: count, current: i, success, failed, updated_at: new Date().toISOString() }, null, 2)}\n`
    );

    if (i < count) {
      await sleep(3000);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🏁 Bulk batch finished: ${success}/${count} succeeded, ${failed} failed`);
  console.log(`📋 Log: ${logPath}`);
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('❌ Bulk batch crashed:', error.message);
  process.exit(1);
});
