import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import { publishPhotoPost, PrivacyLevel } from './tiktok-publish';

/**
 * Publish a stored post as TikTok PHOTO carousel so auto_add_music works.
 * Photos must already be hosted at:
 *   {BASE_URL}/media/posts/{postId}/01-cover.png ...
 */
async function main(): Promise<void> {
  validateEnv(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'BASE_URL']);

  const postId = process.argv[2];
  if (!postId) {
    console.error('Usage: npx ts-node src/publish-photo-post.ts <post-id> [privacy]');
    process.exit(1);
  }

  const privacy = (process.argv[3] || 'SELF_ONLY') as PrivacyLevel;
  const postDir = path.join(config.storage.videosDir, 'posts', postId);
  const captionPath = path.join(postDir, 'caption.txt');
  const caption = fs.existsSync(captionPath)
    ? fs.readFileSync(captionPath, 'utf8').trim()
    : `AutoPublisher post ${postId}`;

  const base = config.baseUrl.replace(/\/$/, '');
  // Prefer hosted public media folder listing via known filenames
  const names = [
    '01-cover.png',
    '02-scene.png',
    '03-scene.png',
    '04-scene.png',
    '05-scene.png',
    '06-scene.png'
  ];

  const photoUrls = names.map((name) => `${base}/media/posts/${postId}/${name}`);

  console.log('📦 Publishing PHOTO carousel (TikTok auto music)');
  console.log(`   Post: ${postId}`);
  console.log(`   Privacy: ${privacy}`);
  photoUrls.forEach((url, i) => console.log(`   [${i}] ${url}`));

  const result = await publishPhotoPost({
    photoUrls,
    caption,
    privacy,
    disableComment: false,
    isAigc: true,
    autoAddMusic: true,
    coverIndex: 0
  });

  console.log('\n✅ Done');
  console.log(`   publish_id: ${result.publishId}`);
  console.log(`   status: ${result.status}`);
  console.log(`   message: ${result.message}`);
}

main().catch((error) => {
  console.error('\n❌ Photo publish failed:', error.message);
  process.exit(1);
});
