import fs from 'fs';
import path from 'path';
import { config } from './config';
import { ensurePostPhotos, ensurePostVideo } from './backlog';
import { bakeCoverIntoVideo } from './video-cover';
import { muxSilentAudio, videoHasAudio } from './video-music';

/**
 * Mac-side prep for inbox upload (VPS has no ffmpeg):
 * photos → slideshow video.mp4 → bake cover.png → silent AAC → video-ready.mp4
 */
async function prepareInboxVideo(postId: string): Promise<string> {
  const postDir = path.join(config.storage.videosDir, 'posts', postId);
  if (!fs.existsSync(postDir)) {
    throw new Error(`Post not found: ${postDir}`);
  }

  await ensurePostPhotos(postId);
  const videoPath = await ensurePostVideo(postId);
  const coverPath = path.join(postDir, 'cover.png');
  const readyPath = path.join(postDir, 'video-ready.mp4');

  let bakedPath = videoPath;
  let tempDir: string | undefined;
  if (fs.existsSync(coverPath)) {
    console.log(`🖼️  Baking cover.png into video (${postId})...`);
    const baked = await bakeCoverIntoVideo(videoPath, coverPath, 1.5);
    bakedPath = baked.videoPath;
    tempDir = baked.tempPath;
    console.log(`   Cover hold ~1.5s, thumbnail at ${baked.coverTimestampMs}ms`);
  } else {
    console.log('⚠️  No cover.png — using first video frame as thumbnail');
  }

  if (await videoHasAudio(bakedPath)) {
    fs.copyFileSync(bakedPath, readyPath);
    console.log('🎵 Video already has audio — copied to video-ready.mp4');
  } else {
    console.log('🔇 Muxing silent AAC → video-ready.mp4');
    await muxSilentAudio(bakedPath, readyPath);
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const size = fs.statSync(readyPath).size;
  if (size < 10_000) {
    throw new Error(`video-ready.mp4 too small (${size} bytes)`);
  }
  console.log(`✅ Ready: ${readyPath} (${Math.round(size / 1024)} KB)`);
  return readyPath;
}

async function main(): Promise<void> {
  const postId = process.argv[2];
  if (!postId) {
    console.error('Usage: npx ts-node src/prepare-inbox-video.ts <post-id>');
    process.exit(1);
  }
  await prepareInboxVideo(postId);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { prepareInboxVideo };
