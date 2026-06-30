import fs from 'fs';
import path from 'path';
import { generateCaption } from './router9';
import { publishVideo } from './tiktok-publish';
import { config, validateEnv } from './config';

async function main(): Promise<void> {
  validateEnv([
    'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'ROUTER9_API_KEY'
  ]);

  const topic = process.argv.slice(2).join(' ') || 'AI Content Agent auto publishing test video';
  const videoPath = path.join(config.storage.videosDir, 'test.mp4');

  if (!fs.existsSync(videoPath)) {
    console.error(`❌ Video not found: ${videoPath}`);
    console.error('💡 Generate it first: npm run generate-video');
    process.exit(1);
  }

  const caption = await generateCaption(topic);

  await publishVideo({
    videoPath,
    caption,
    privacy: 'SELF_ONLY',
    disableComment: false,
    disableDuet: true,
    disableStitch: true
  });
}

main().catch((error) => {
  console.error('\n❌ Publish flow failed:', error.message);
  process.exit(1);
});
