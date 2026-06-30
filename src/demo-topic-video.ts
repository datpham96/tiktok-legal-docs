import fs from 'fs';
import path from 'path';
import { config } from './config';
import { generateVideoFromScenes } from './video-from-scenes';
import { Scene } from './scene-splitter';

async function main(): Promise<void> {
  const outputPath = path.join(config.storage.videosDir, 'test.mp4');

  if (!fs.existsSync(config.storage.videosDir)) {
    fs.mkdirSync(config.storage.videosDir, { recursive: true });
  }

  const topic = '3 cách dùng AI để học nhanh hơn';
  const scenes: Scene[] = [
    { text: '3 cách dùng AI', duration: 2.5 },
    { text: 'để học nhanh hơn', duration: 2.5 },
    { text: '1. Tóm tắt bài học', duration: 2.0 },
    { text: '2. Luyện câu hỏi\n3. Lập kế hoạch học', duration: 3.0 }
  ];

  console.log('🎯 Demo topic video');
  console.log(`   Topic: ${topic}`);

  await generateVideoFromScenes(scenes, outputPath);

  const stats = fs.statSync(outputPath);
  console.log('\n✅ Demo video generated');
  console.log(`   File: ${outputPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log('   Open the file to preview the result.');
}

main().catch((error) => {
  console.error('\n❌ Demo video failed:', error.message);
  process.exit(1);
});
