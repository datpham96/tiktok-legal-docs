import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import { publishVideo, PrivacyLevel } from './tiktok-publish';

function usage(): never {
  console.error('Usage: npx ts-node src/publish-post.ts <post-id> [privacy]');
  console.error('Example: npx ts-node src/publish-post.ts 70 SELF_ONLY');
  process.exit(1);
}

async function main(): Promise<void> {
  validateEnv(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']);

  const postId = process.argv[2];
  if (!postId) usage();

  const privacy = (process.argv[3] || 'SELF_ONLY') as PrivacyLevel;
  const postDir = path.join(config.storage.videosDir, 'posts', postId);
  const videoPath = path.join(postDir, 'video.mp4');
  const captionPath = path.join(postDir, 'caption.txt');
  const metaPath = path.join(postDir, 'meta.json');

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const caption = fs.existsSync(captionPath)
    ? fs.readFileSync(captionPath, 'utf8').trim()
    : `AutoPublisher post ${postId}`;

  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    : null;

  const coverPath = path.join(postDir, 'cover.png');

  console.log('📦 Publishing stored post');
  console.log(`   Post: ${postId}`);
  console.log(`   Dir: ${postDir}`);
  console.log(`   Topic: ${meta?.topic || '(none)'}`);
  console.log(`   Privacy: ${privacy}`);
  console.log(`   Cover: ${fs.existsSync(coverPath) ? coverPath : '(none — using video frame)'}`);
  console.log(`   Auto music: on (TikTok picks suggested track)`);
  console.log(`   Caption preview: ${caption.slice(0, 120).replace(/\n/g, ' ')}...`);

  const result = await publishVideo({
    videoPath,
    caption,
    privacy,
    disableComment: false,
    disableDuet: true,
    disableStitch: true,
    isAigc: true,
    autoAddMusic: true,
    coverPath: fs.existsSync(coverPath) ? coverPath : undefined
  });

  console.log('\n✅ Done');
  console.log(`   publish_id: ${result.publishId}`);
  console.log(`   status: ${result.status}`);
  console.log(`   message: ${result.message}`);
}

main().catch((error) => {
  console.error('\n❌ Publish post failed:', error.message);
  process.exit(1);
});
