import fs from 'fs';
import path from 'path';
import { config } from './config';
import { generateSimpleColorVideo } from './simple-color-video';

async function main(): Promise<void> {
  const outputPath = path.join(config.storage.videosDir, 'test.mp4');

  if (!fs.existsSync(config.storage.videosDir)) {
    fs.mkdirSync(config.storage.videosDir, { recursive: true });
  }

  console.log('🎬 Demo: Simple Color Video\n');
  console.log('   Topic: "3 cách dùng AI để học nhanh hơn"');
  console.log('   (Mỗi scene = màu khác nhau)\n');

  const scenes = [
    { color: '0x1e3a8a', duration: 2.5 },  // Xanh đậm
    { color: '0x7c3aed', duration: 2.5 },  // Tím
    { color: '0xdc2626', duration: 2.5 },  // Đỏ
    { color: '0x16a34a', duration: 2.5 }   // Xanh lá
  ];

  await generateSimpleColorVideo(scenes, outputPath);

  console.log('\n✅ Done!');
  console.log(`   Open: ${outputPath}`);
  console.log('   Mỗi màu tượng trưng 1 scene/ý chính\n');
}

main().catch((error) => {
  console.error('\n❌ Failed:', error.message);
  process.exit(1);
});
