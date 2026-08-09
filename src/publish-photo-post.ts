import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import {
  cleanupLocalPostPhotos,
  cleanupPublicPhotos,
  hasCoverSlide,
  injectCoverPhoto,
  listPostPhotoFiles,
  photoPublicUrls,
  photosFromVideoPost,
  postCoverPath,
  resolvePhotoCoverIndex,
  syncPhotosToPublic
} from './photo-assets';
import { publishPhotoPost, PrivacyLevel } from './tiktok-publish';
import { ensureTikTokTipsHashtag } from './router9';

/**
 * Publish a stored post as TikTok PHOTO carousel (auto_add_music).
 * Flow: sync public URLs → publish → on success delete hosted (+ optional local) photos.
 *
 * Flags:
 *   --convert     rebuild photos from video if needed
 *   --keep-public skip deleting public/media/posts/<id> after success
 *   --keep-local  keep storage/videos/posts/<id>/photos after success (default: delete)
 */
async function main(): Promise<void> {
  validateEnv(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'BASE_URL']);

  const postId = process.argv[2];
  if (!postId) {
    console.error(
      'Usage: npx ts-node src/publish-photo-post.ts <post-id> [privacy] [--convert] [--keep-public] [--keep-local]'
    );
    process.exit(1);
  }

  const privacy = (process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : process.env.TIKTOK_PRIVACY || 'PUBLIC_TO_EVERYONE') as PrivacyLevel;
  const forceConvert = process.argv.includes('--convert');
  const keepPublic = process.argv.includes('--keep-public');
  const keepLocal = process.argv.includes('--keep-local');

  const postDir = path.join(config.storage.videosDir, 'posts', postId);
  if (!fs.existsSync(postDir)) {
    throw new Error(`Post not found: ${postDir}`);
  }

  const captionPath = path.join(postDir, 'caption.txt');
  let caption = fs.existsSync(captionPath)
    ? fs.readFileSync(captionPath, 'utf8').trim()
    : `AutoPublisher post ${postId}`;
  caption = ensureTikTokTipsHashtag(caption);
  // Persist normalized caption so backlog stays consistent
  if (fs.existsSync(captionPath)) {
    const current = fs.readFileSync(captionPath, 'utf8').trim();
    if (current !== caption) {
      fs.writeFileSync(captionPath, `${caption}\n`, 'utf8');
    }
  }

  let photos = listPostPhotoFiles(postDir);
  if (photos.length === 0 || forceConvert) {
    const videoPath = path.join(postDir, 'video.mp4');
    if (!fs.existsSync(videoPath)) {
      throw new Error(`No photos/ and no video.mp4 in ${postDir}`);
    }
    console.log('🎬 Converting video frames → photo JPEGs...');
    photos = await photosFromVideoPost(postDir);
  }

  if (postCoverPath(postDir) && !hasCoverSlide(postDir)) {
    photos = await injectCoverPhoto(postDir);
  }

  console.log(`📤 Syncing ${photos.length} photos to public media...`);
  syncPhotosToPublic(postId, postDir);

  const photoUrls = photoPublicUrls(postId, config.baseUrl);
  if (photoUrls.length < 4) {
    throw new Error(
      `Need at least 4 photos for carousel (got ${photoUrls.length}). Prefer 4, 6, or 8. Re-run: npm run convert-posts-to-photos -- ${postId}`
    );
  }
  if (![4, 6, 8].includes(photoUrls.length)) {
    console.warn(`⚠️ Photo count ${photoUrls.length} is outside preferred 4/6/8 — publishing anyway`);
  }

  console.log('📦 Publishing PHOTO carousel (TikTok auto music)');
  console.log(`   Post: ${postId}`);
  console.log(`   Privacy: ${privacy}`);
  photoUrls.forEach((url, i) => console.log(`   [${i}] ${url}`));

  const coverIndex = resolvePhotoCoverIndex(postDir, photoUrls);
  console.log(`   Cover slide index: ${coverIndex} (${photoUrls[coverIndex]?.split('/').pop() || '?'})`);

  const markAigc = process.env.TIKTOK_IS_AIGC !== 'false';
  const result = await publishPhotoPost({
    photoUrls,
    caption,
    privacy,
    disableComment: false,
    isAigc: markAigc,
    autoAddMusic: true,
    coverIndex
  });

  console.log('\n✅ Done');
  console.log(`   publish_id: ${result.publishId}`);
  console.log(`   status: ${result.status}`);
  console.log(`   message: ${result.message}`);
  if (result.publicPostIds?.length) {
    console.log(`   tiktok_post_id: ${result.publicPostIds.join(', ')}`);
  }

  // Only wipe after TikTok finished successfully — keep files on failure for retry
  if (result.status === 'PUBLISH_COMPLETE') {
    if (!keepPublic) {
      const n = cleanupPublicPhotos(postId, process.cwd(), { removeDir: true });
      console.log(`🗑️  Removed ${n} hosted photo(s) from public/media/posts/${postId}/`);
    } else {
      console.log('📌 --keep-public: left public media in place');
    }

    if (!keepLocal) {
      const n = cleanupLocalPostPhotos(postDir);
      console.log(`🗑️  Removed ${n} local photo(s) from posts/${postId}/photos/`);
    } else {
      console.log('📌 --keep-local: left storage photos in place');
    }

    // Mark meta
    const metaPath = path.join(postDir, 'meta.json');
    let meta: Record<string, unknown> = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        meta = {};
      }
    }
    meta.published_at = new Date().toISOString();
    meta.publish_id = result.publishId;
    meta.tiktok_post_ids = result.publicPostIds || [];
    meta.privacy = privacy;
    meta.is_aigc = markAigc;
    meta.photos_cleaned = !keepPublic || !keepLocal;
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  }
}

main().catch((error) => {
  console.error('\n❌ Photo publish failed:', error.message);
  console.error('   Photos kept on server for retry.');
  process.exit(1);
});
