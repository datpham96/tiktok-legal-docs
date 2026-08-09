import { ensureBgmLibrary, listBgmFiles, pickBgm, bgmHistoryPath } from './video-music';
import fs from 'fs';

/**
 * Download starter BGM pack + show rotation status.
 * Usage: npx ts-node src/prepare-bgm.ts
 */
async function main(): Promise<void> {
  console.log('🎵 Preparing BGM library...\n');
  const files = await ensureBgmLibrary();
  console.log(`\n✅ ${files.length} track(s) ready:\n`);
  for (const f of files) {
    const size = (fs.statSync(f).size / 1024 / 1024).toFixed(2);
    console.log(`   • ${f.split('/').pop()} (${size} MB)`);
  }

  console.log('\n🎲 Sample picks (avoid last 5):');
  for (let i = 1; i <= 6; i++) {
    const picked = await pickBgm({ postId: `demo-${i}`, record: true });
    console.log(`   post demo-${i} → ${picked.name}`);
  }

  console.log(`\n📋 History: ${bgmHistoryPath()}`);
  console.log('💡 Drop more .mp3 into assets/bgm/ — auto-included next publish.');
  console.log('   Override one track: BGM_PATH=/path/to/song.mp3');
  console.log('   Avoid window: BGM_AVOID_RECENT=5 (default)');
}

main().catch((error) => {
  console.error('❌', error.message);
  process.exit(1);
});
