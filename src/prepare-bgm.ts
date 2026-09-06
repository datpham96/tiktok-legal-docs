import {
  archiveLegacyHelixTracks,
  customBgmDir,
  ensureBgmLibrary,
  listBgmFiles,
  pickBgm,
  bgmHistoryPath
} from './video-music';
import fs from 'fs';
import path from 'path';

/**
 * Prepare custom BGM library (SoundHelix disabled by default).
 * Usage: npx ts-node src/prepare-bgm.ts [--archive-helix]
 */
async function main(): Promise<void> {
  const archiveHelix = process.argv.includes('--archive-helix');

  console.log('🎵 BGM library\n');
  console.log('   SoundHelix (helix-*) = tắt mặc định — nghe robotic, không hợp TikTok.');
  console.log('   Thêm nhạc đẹp: ./scripts/import-bgm.sh ~/Downloads/*.mp3');
  console.log('   Nguồn gợi ý: mixkit.co/free-stock-music | pixabay.com/music\n');

  if (archiveHelix) {
    const moved = archiveLegacyHelixTracks();
    console.log(`🗄️  Archived ${moved} helix track(s) → assets/bgm/_deprecated/\n`);
  }

  fs.mkdirSync(customBgmDir(), { recursive: true });

  const files = listBgmFiles();
  if (files.length === 0) {
    console.log('❌ Chưa có nhạc trong assets/bgm/custom/');
    console.log('   1. Vào https://mixkit.co/free-stock-music/tag/lo-fi/');
    console.log('   2. Download vài track MP3');
    console.log('   3. ./scripts/import-bgm.sh ~/Downloads/*.mp3');
    process.exit(1);
  }

  console.log(`✅ ${files.length} track(s) active:\n`);
  for (const f of files) {
    const size = (fs.statSync(f).size / 1024 / 1024).toFixed(2);
    const tag = f.includes(`${path.sep}custom${path.sep}`) ? '★ custom' : 'legacy';
    console.log(`   • ${path.basename(f)} (${size} MB) ${tag}`);
  }

  console.log('\n🎲 Sample picks:');
  for (let i = 1; i <= 3; i++) {
    const picked = await pickBgm({ postId: `sample-${i}`, record: false });
    console.log(`   sample-${i} → ${picked.name}`);
  }

  // Touch ensure (validates folder)
  await ensureBgmLibrary();

  console.log(`\n📋 History: ${bgmHistoryPath()}`);
  console.log('   Volume nhạc nền: BGM_VOLUME=0.32 (default, chỉnh 0.2–0.5)');
  console.log('   Bật lại helix cũ: BGM_ALLOW_HELIX=1');
}

main().catch((error) => {
  console.error('❌', error.message);
  process.exit(1);
});
