import fs from 'fs';
import path from 'path';
import { config } from './config';
import { generateSimpleColorVideo } from './simple-color-video';
import { generateCaption } from './router9';

async function main(): Promise<void> {
  const outputPath = path.join(config.storage.videosDir, 'test.mp4');
  const captionPath = path.join(config.storage.videosDir, 'caption.txt');

  if (!fs.existsSync(config.storage.videosDir)) {
    fs.mkdirSync(config.storage.videosDir, { recursive: true });
  }

  console.log('🎬 Demo: AI Agent Video\n');
  console.log('   Topic: AI Agent - tương lai của tự động hóa');
  console.log('   Duration: 10 seconds');
  console.log('   Format: Vertical TikTok (1080x1920)\n');

  // Define scenes - mỗi scene tượng trưng cho 1 khía cạnh AI Agent
  const scenes = [
    { color: '0x6366f1', duration: 2.5 },  // Indigo - AI Agent là gì
    { color: '0x8b5cf6', duration: 2.5 },  // Purple - Tự động hóa
    { color: '0xec4899', duration: 2.5 },  // Pink - Tương lai
    { color: '0x06b6d4', duration: 2.5 }   // Cyan - Lợi ích
  ];

  console.log('[STEP 1] Generating video with color scenes\n');
  await generateSimpleColorVideo(scenes, outputPath);

  console.log('\n[STEP 2] Generating AI caption\n');
  const topic = 'AI Agent: Trợ lý AI tự động hóa công việc thông minh';
  const caption = await generateCaption(topic);
  
  console.log(`   Caption: "${caption}"`);
  fs.writeFileSync(captionPath, caption);
  console.log(`   Saved to: ${captionPath}`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ DEMO COMPLETE!\n');
  console.log('📹 Video: storage/videos/test.mp4');
  console.log('📝 Caption: storage/videos/caption.txt');
  console.log('\nScene breakdown:');
  console.log('  1. Indigo (2.5s) - AI Agent là gì?');
  console.log('  2. Purple (2.5s) - Tự động hóa công việc');
  console.log('  3. Pink (2.5s) - Tương lai của AI');
  console.log('  4. Cyan (2.5s) - Lợi ích thực tế');
  console.log('='.repeat(50) + '\n');
}

main().catch((error) => {
  console.error('\n❌ Demo failed:', error.message);
  process.exit(1);
});
