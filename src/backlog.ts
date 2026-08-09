import fs from 'fs';
import path from 'path';
import { config } from './config';
import { generateSlideshowFromImages } from './image-slideshow';
import { hasCoverSlide, injectCoverPhoto, listPostPhotoFiles, photosFromVideoPost, postCoverPath } from './photo-assets';

/** Priority numeric posts start here (already-published tests sit below). */
const DEFAULT_MIN_ID = parseInt(process.env.BACKLOG_MIN_ID || '73', 10);

const DATED_RE = /^\d{4}-\d{2}-\d{2}-/;
const NUMERIC_RE = /^\d+$/;

export type PostMeta = Record<string, unknown> & {
  published_at?: string;
  publish_id?: string;
  privacy?: string;
};

export function postsRoot(): string {
  return path.join(config.storage.videosDir, 'posts');
}

export function loadMeta(postDir: string): PostMeta {
  const metaPath = path.join(postDir, 'meta.json');
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as PostMeta;
  } catch {
    return {};
  }
}

export function saveMeta(postDir: string, meta: PostMeta): void {
  const metaPath = path.join(postDir, 'meta.json');
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

export function isPublished(postDir: string): boolean {
  const meta = loadMeta(postDir);
  return Boolean(meta.published_at || meta.publish_id);
}

export function canPublishPost(postDir: string): boolean {
  if (!fs.existsSync(postDir)) return false;
  if (isPublished(postDir)) return false;
  const caption = path.join(postDir, 'caption.txt');
  if (!fs.existsSync(caption)) return false;
  const photos = listPostPhotoFiles(postDir);
  if (photos.length >= 4) return true;
  // Can still convert from video at publish time
  return fs.existsSync(path.join(postDir, 'video.mp4'));
}

function listDirNames(): string[] {
  const root = postsRoot();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root);
}

/** Priority: numeric ids >= minId, ascending. */
export function listPriorityBacklogIds(minId = DEFAULT_MIN_ID): string[] {
  return listDirNames()
    .filter((name) => NUMERIC_RE.test(name) && parseInt(name, 10) >= minId)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .filter((id) => canPublishPost(path.join(postsRoot(), id)));
}

/** Dated daily-batch folders (2026-07-21-054030-noon), chronological. */
export function listDatedBacklogIds(): string[] {
  return listDirNames()
    .filter((name) => DATED_RE.test(name))
    .sort()
    .filter((id) => canPublishPost(path.join(postsRoot(), id)));
}

/** Legacy numeric posts below minId (1 … minId-1), ascending. */
export function listLegacyBacklogIds(minId = DEFAULT_MIN_ID): string[] {
  return listDirNames()
    .filter((name) => NUMERIC_RE.test(name) && parseInt(name, 10) < minId)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .filter((id) => canPublishPost(path.join(postsRoot(), id)));
}

/**
 * Full backlog order:
 *   1) numeric >= minId (73→122…)
 *   2) dated folders (Jul 21 → Aug 1…)
 *   3) legacy numeric < minId (1→72 unpublished)
 */
export function listBacklogPostIds(minId = DEFAULT_MIN_ID): string[] {
  return [
    ...listPriorityBacklogIds(minId),
    ...listDatedBacklogIds(),
    ...listLegacyBacklogIds(minId)
  ];
}

export function pickNextBacklogPostId(minId = DEFAULT_MIN_ID): string | null {
  const ids = listBacklogPostIds(minId);
  return ids[0] || null;
}

export function backlogBreakdown(minId = DEFAULT_MIN_ID): {
  priority: number;
  dated: number;
  legacy: number;
  total: number;
} {
  const priority = listPriorityBacklogIds(minId).length;
  const dated = listDatedBacklogIds().length;
  const legacy = listLegacyBacklogIds(minId).length;
  return { priority, dated, legacy, total: priority + dated + legacy };
}

export function markPostPublished(
  postId: string,
  detail: {
    publishId?: string;
    tiktokPostIds?: string[];
    privacy?: string;
    bgm?: string;
    format?: string;
  }
): void {
  const postDir = path.join(postsRoot(), postId);
  const meta = loadMeta(postDir);
  meta.published_at = new Date().toISOString();
  if (detail.publishId) meta.publish_id = detail.publishId;
  if (detail.tiktokPostIds?.length) meta.tiktok_post_ids = detail.tiktokPostIds;
  if (detail.privacy) meta.privacy = detail.privacy;
  if (detail.bgm) meta.bgm_used = detail.bgm;
  meta.format = detail.format || 'photo';
  meta.publish_source = 'backlog';
  meta.auto_add_music = true;
  saveMeta(postDir, meta);
}

/** Ensure posts/<id>/photos has >=4 JPEGs (convert from video if needed). */
export async function ensurePostPhotos(postId: string): Promise<string[]> {
  const postDir = path.join(postsRoot(), postId);
  let photos = listPostPhotoFiles(postDir);
  if (photos.length >= 4 && postCoverPath(postDir) && !hasCoverSlide(postDir)) {
    photos = await injectCoverPhoto(postDir);
  }
  if (photos.length >= 4) return photos;

  const videoPath = path.join(postDir, 'video.mp4');
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Post ${postId}: need photos/ (>=4) or video.mp4 to convert`);
  }

  console.log(`🖼️  Building photos/ for post ${postId} from video frames...`);
  photos = await photosFromVideoPost(postDir);
  if (photos.length < 4) {
    throw new Error(`Post ${postId}: only ${photos.length} photos after convert`);
  }

  if (postCoverPath(postDir)) {
    photos = await injectCoverPhoto(postDir);
  }
  return photos;
}

/**
 * Ensure posts/<id>/video.mp4 exists — rebuild from photos/ when missing.
 */
export async function ensurePostVideo(postId: string): Promise<string> {
  const postDir = path.join(postsRoot(), postId);
  const videoPath = path.join(postDir, 'video.mp4');
  if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 10_000) {
    return videoPath;
  }

  let photos = listPostPhotoFiles(postDir);
  if (photos.length === 0) {
    const bak = path.join(postDir, 'photos.bak');
    if (fs.existsSync(bak)) {
      photos = fs
        .readdirSync(bak)
        .filter((n) => /\.jpe?g$/i.test(n))
        .sort()
        .map((n) => path.join(bak, n));
    }
  }

  if (photos.length < 4) {
    throw new Error(`Post ${postId}: need video.mp4 or >=4 photos to build slideshow`);
  }

  console.log(`🎬 Building video.mp4 for post ${postId} from ${photos.length} photos...`);
  await generateSlideshowFromImages(photos, videoPath, 4);
  return videoPath;
}

/** CLI: print next backlog id (or empty) + remaining count */
async function main(): Promise<void> {
  const cmd = process.argv[2] || 'next';
  if (cmd === 'list') {
    const ids = listBacklogPostIds();
    console.log(ids.join('\n'));
    const b = backlogBreakdown();
    console.error(
      `# ${b.total} unpublished (priority>=${DEFAULT_MIN_ID}: ${b.priority}, dated: ${b.dated}, legacy: ${b.legacy})`
    );
    return;
  }
  if (cmd === 'count') {
    console.log(String(listBacklogPostIds().length));
    return;
  }
  if (cmd === 'breakdown') {
    console.log(JSON.stringify(backlogBreakdown(), null, 2));
    return;
  }
  const next = pickNextBacklogPostId();
  if (next) {
    process.stdout.write(next);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
