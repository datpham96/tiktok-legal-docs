import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import { publishVideo, PrivacyLevel } from './tiktok-publish';
import { ensurePostVideo } from './backlog';
import { ensureTikTokTipsHashtag } from './router9';

function usage(): never {
  console.error('Usage: npx ts-node src/publish-post.ts <post-id> [privacy] [--inbox] [--no-bgm]');
  console.error('Example: npx ts-node src/publish-post.ts 92 PUBLIC_TO_EVERYONE --inbox --no-bgm');
  process.exit(1);
}

async function main(): Promise<void> {
  validateEnv(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']);

  const args = process.argv.slice(2);
  const toInbox = args.includes('--inbox');
  const noBgm = args.includes('--no-bgm') || toInbox;
  const coverBaked = args.includes('--cover-baked');
  const positional = args.filter((a) => !a.startsWith('--'));
  const postId = positional[0];
  if (!postId) usage();

  const privacy = (positional[1] || process.env.TIKTOK_PRIVACY || 'PUBLIC_TO_EVERYONE') as PrivacyLevel;
  const postDir = path.join(config.storage.videosDir, 'posts', postId);
  if (!fs.existsSync(postDir)) {
    throw new Error(`Post not found: ${postDir}`);
  }

  const videoPath = await ensurePostVideo(postId);
  const captionPath = path.join(postDir, 'caption.txt');
  const metaPath = path.join(postDir, 'meta.json');

  let caption = fs.existsSync(captionPath)
    ? fs.readFileSync(captionPath, 'utf8').trim()
    : `AutoPublisher post ${postId}`;
  caption = ensureTikTokTipsHashtag(caption);

  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    : null;

  const coverPath = path.join(postDir, 'cover.png');
  const useCover = !coverBaked && fs.existsSync(coverPath);
  const title = caption.split(/\n+/)[0].slice(0, 90);

  console.log('📦 Publishing stored post as VIDEO');
  console.log(`   Post: ${postId}`);
  console.log(`   Mode: ${toInbox ? 'INBOX (add music in TikTok app, then publish)' : 'DIRECT_POST'}`);
  console.log(`   Title: ${title}`);
  console.log(`   Privacy: ${toInbox ? '(set in TikTok app)' : privacy}`);
  console.log(`   Cover: ${coverBaked ? 'pre-baked into video' : useCover ? coverPath : '(none — using video frame)'}`);
  console.log(`   BGM: ${noBgm ? 'off (silent — add sound in TikTok)' : 'mux before upload'}`);

  const result = await publishVideo({
    videoPath,
    caption,
    privacy,
    disableComment: false,
    disableDuet: false,
    disableStitch: false,
    isAigc: true,
    autoAddMusic: false,
    muxBgm: !noBgm,
    toInbox,
    skipMediaPrep: coverBaked,
    postId,
    topic: meta?.topic,
    coverPath: useCover ? coverPath : undefined,
    coverTimestampMs: coverBaked ? 750 : undefined
  });

  console.log('\n✅ Done');
  console.log(`   publish_id: ${result.publishId}`);
  console.log(`   status: ${result.status}`);
  console.log(`   message: ${result.message}`);
  if (result.status === 'SEND_TO_USER_INBOX') {
    console.log('\n👉 Open TikTok app → Inbox notification → add music → Publish');
  }
}

main().catch((error) => {
  console.error('\n❌ Publish post failed:', error.message);
  process.exit(1);
});
