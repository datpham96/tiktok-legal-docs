import fs from 'fs';
import path from 'path';
import { config } from './config';
import { generateCaption } from './router9';
import { generateTestVideo } from './video-generator';

async function testAll() {
  console.log('🧪 Testing TikTok Auto Publish MVP (Pre-OAuth)\n');
  console.log('='.repeat(50));
  
  // 1. Check config
  console.log('\n📋 Step 1: Config Check');
  console.log('  ✓ Port:', config.port);
  console.log('  ✓ 9router URL:', config.router9.baseUrl);
  console.log('  ✓ 9router Model:', config.router9.model);
  console.log('  ✓ Videos dir:', config.storage.videosDir);
  
  // 2. Test video generation
  console.log('\n🎬 Step 2: Generate Test Video');
  try {
    const videoPath = await generateTestVideo();
    const stats = fs.statSync(videoPath);
    console.log('  ✓ Video created:', videoPath);
    console.log('  ✓ Size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
  } catch (error: any) {
    console.error('  ✗ Video generation failed:', error.message);
  }
  
  // 3. Test caption generation
  console.log('\n🤖 Step 3: Generate Caption with 9router');
  try {
    const caption = await generateCaption('AI Content Agent test video');
    console.log('  ✓ Caption generated:', caption);
  } catch (error: any) {
    console.error('  ✗ Caption generation failed:', error.message);
  }
  
  // 4. Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ Pre-OAuth workflow test complete!\n');
  console.log('Next steps:');
  console.log('  1. Setup TikTok OAuth (when ready)');
  console.log('  2. Run: npm run publish');
  console.log('  3. Video will be published to TikTok\n');
}

testAll().catch((error) => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
