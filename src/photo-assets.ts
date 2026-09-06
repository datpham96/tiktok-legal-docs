import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export const PHOTO_WIDTH = 1080;
export const PHOTO_HEIGHT = 1920;
export const DEFAULT_SCENE_SECONDS = 4;
/** TikTok photo carousels feel best with 4 / 6 / 8 slides — never 2. */
export const PREFERRED_PHOTO_COUNTS = [4, 6, 8] as const;
export const DEFAULT_PHOTO_COUNT = 6;

export function snapPhotoCount(n: number): number {
  const raw = Math.round(n);
  if ((PREFERRED_PHOTO_COUNTS as readonly number[]).includes(raw)) return raw;
  if (!Number.isFinite(raw) || raw < 4) return 4;
  if (raw === 5) return 6;
  // cover + 6 scenes = 7 → prefer 8 (pad last) over dropping a real tip slide
  if (raw === 7) return 8;
  if (raw > 8) return 8;
  return DEFAULT_PHOTO_COUNT;
}

export function publicMediaPostsDir(rootDir = process.cwd()): string {
  return path.join(rootDir, 'public', 'media', 'posts');
}

export function postPhotosDir(postDir: string): string {
  return path.join(postDir, 'photos');
}

/** List prepared photo JPEGs in a post folder (sorted). */
export function listPostPhotoFiles(postDir: string): string[] {
  const dir = postPhotosDir(postDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

export function postCoverPath(postDir: string): string | null {
  const cover = path.join(postDir, 'cover.png');
  return fs.existsSync(cover) ? cover : null;
}

export function hasCoverSlide(postDir: string): boolean {
  const dir = postPhotosDir(postDir);
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((name) => /cover\.jpe?g$/i.test(name));
}

/**
 * Prepend cover.png as 01-cover.jpg (TikTok photo_cover_index → profile thumbnail).
 * Trims scene slides so total stays 4/6/8 (e.g. cover + 5 scenes = 6).
 */
export async function injectCoverPhoto(postDir: string): Promise<string[]> {
  const coverSrc = postCoverPath(postDir);
  const outDir = postPhotosDir(postDir);
  if (!coverSrc) return listPostPhotoFiles(postDir);

  const scenes = listPostPhotoFiles(postDir).filter(
    (p) => !/cover\.jpe?g$/i.test(path.basename(p))
  );
  const target = snapPhotoCount(Math.max(scenes.length + 1, DEFAULT_PHOTO_COUNT));
  const sceneSlots = target - 1;
  const current = listPostPhotoFiles(postDir);

  if (hasCoverSlide(postDir) && scenes.length === sceneSlots && current.length === target) {
    return current;
  }

  if (scenes.length === 0) {
    throw new Error(`Post ${path.basename(postDir)}: cover.png exists but no scene photos to pair with`);
  }
  const trimmed = scenes.slice(0, sceneSlots);
  const sceneBytes = trimmed.map((src) => fs.readFileSync(src));

  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(outDir)) {
    if (/\.jpe?g$/i.test(name)) fs.unlinkSync(path.join(outDir, name));
  }

  const outputs: string[] = [];
  const coverDest = path.join(outDir, '01-cover.jpg');
  await toPhotoJpeg(coverSrc, coverDest);
  outputs.push(coverDest);

  for (let i = 0; i < sceneBytes.length; i++) {
    const dest = path.join(outDir, `${String(i + 2).padStart(2, '0')}-scene.jpg`);
    fs.writeFileSync(dest, sceneBytes[i]);
    outputs.push(dest);
  }

  console.log(`🖼️  Cover injected: ${path.basename(postDir)} → 01-cover.jpg + ${trimmed.length} scene(s)`);
  return outputs;
}

/** Index of cover slide in sorted public URLs (defaults to 0). */
export function resolvePhotoCoverIndex(postDir: string, photoUrls: string[]): number {
  const dir = postPhotosDir(postDir);
  if (!fs.existsSync(dir)) return 0;
  const coverName = fs.readdirSync(dir).find((name) => /cover\.jpe?g$/i.test(name));
  if (!coverName) return 0;
  const idx = photoUrls.findIndex((url) => url.endsWith(`/${coverName}`));
  return idx >= 0 ? idx : 0;
}

export function sceneCountFromPost(postDir: string): number {
  const scenesPath = path.join(postDir, 'scenes.json');
  if (fs.existsSync(scenesPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
      if (Array.isArray(raw.scenes) && raw.scenes.length > 0) {
        return raw.scenes.length;
      }
    } catch {
      // fall through
    }
  }
  return 6;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-600)}`));
    });
    child.on('error', reject);
  });
}

async function probeDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      const n = parseFloat(out.trim());
      if (code === 0 && Number.isFinite(n) && n > 0) resolve(n);
      else reject(new Error(`ffprobe duration failed for ${videoPath}`));
    });
    child.on('error', reject);
  });
}

/**
 * Convert a PNG/JPEG source into TikTok-friendly baseline JPEG 1080x1920.
 */
export async function toPhotoJpeg(sourcePath: string, destPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await run('ffmpeg', [
    '-y',
    '-i', sourcePath,
    '-vf',
    `scale=${PHOTO_WIDTH}:${PHOTO_HEIGHT}:force_original_aspect_ratio=increase,crop=${PHOTO_WIDTH}:${PHOTO_HEIGHT},setsar=1`,
    '-frames:v', '1',
    '-update', '1',
    '-q:v', '3',
    destPath
  ]);
  return destPath;
}

/**
 * Build photo JPEGs from overlay PNGs (new content pipeline).
 * If coverPath is provided, it becomes slide 01 and remaining slots are scenes
 * so total stays at 4/6/8 (e.g. cover + 5 scenes = 6).
 */
export async function photosFromOverlays(
  overlayPaths: string[],
  outDir: string,
  coverPath?: string
): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(outDir)) {
    for (const name of fs.readdirSync(outDir)) {
      if (/\.jpe?g$/i.test(name)) fs.unlinkSync(path.join(outDir, name));
    }
  }

  const useCover = Boolean(coverPath && fs.existsSync(coverPath));
  const target = snapPhotoCount(useCover ? overlayPaths.length + 1 : overlayPaths.length);
  const sceneSlots = useCover ? target - 1 : target;

  const scenes =
    overlayPaths.length >= sceneSlots
      ? overlayPaths.slice(0, sceneSlots)
      : [...overlayPaths];
  while (scenes.length < sceneSlots && scenes.length > 0) {
    scenes.push(scenes[scenes.length - 1]);
  }

  const outputs: string[] = [];
  let index = 1;
  if (useCover && coverPath) {
    const dest = path.join(outDir, '01-cover.jpg');
    await toPhotoJpeg(coverPath, dest);
    outputs.push(dest);
    index = 2;
  }

  for (let i = 0; i < scenes.length; i++) {
    const dest = path.join(outDir, `${String(index).padStart(2, '0')}-scene.jpg`);
    await toPhotoJpeg(scenes[i], dest);
    outputs.push(dest);
    index += 1;
  }

  return outputs;
}

/**
 * Extract evenly spaced frames from an existing slideshow video.
 * Targets 4 / 6 / 8 photos (default 6). Cover is not added as an extra slide.
 */
export async function photosFromVideoPost(
  postDir: string,
  options?: { sceneSeconds?: number; includeCover?: boolean; photoCount?: number }
): Promise<string[]> {
  const videoPath = path.join(postDir, 'video.mp4');
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Missing video: ${videoPath}`);
  }

  const outDir = postPhotosDir(postDir);
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(outDir)) {
    if (/\.jpe?g$/i.test(name)) fs.unlinkSync(path.join(outDir, name));
  }

  const duration = await probeDuration(videoPath);
  const coverPath = path.join(postDir, 'cover.png');
  const useCover = options?.includeCover !== false && fs.existsSync(coverPath);
  const target = snapPhotoCount(options?.photoCount ?? DEFAULT_PHOTO_COUNT);
  const frameCount = useCover ? target - 1 : target;

  const outputs: string[] = [];
  if (useCover) {
    const coverDest = path.join(outDir, '01-cover.jpg');
    await toPhotoJpeg(coverPath, coverDest);
    outputs.push(coverDest);
  }

  for (let i = 0; i < frameCount; i++) {
    const slideIndex = useCover ? i + 2 : i + 1;
    const t = duration <= 0.1 ? 0 : ((i + 0.5) / frameCount) * duration;
    const dest = path.join(outDir, `${String(slideIndex).padStart(2, '0')}-scene.jpg`);
    await run('ffmpeg', [
      '-y',
      '-ss', String(Math.max(0, Math.min(duration - 0.05, t))),
      '-i', videoPath,
      '-frames:v', '1',
      '-update', '1',
      '-vf',
      `scale=${PHOTO_WIDTH}:${PHOTO_HEIGHT}:force_original_aspect_ratio=increase,crop=${PHOTO_WIDTH}:${PHOTO_HEIGHT},setsar=1`,
      '-q:v', '3',
      dest
    ]);
    outputs.push(dest);
  }

  return outputs;
}

/** Mirror post photos into public/media/posts/{postId}/ for TikTok PULL_FROM_URL. */
export function syncPhotosToPublic(postId: string, postDir: string, rootDir = process.cwd()): string[] {
  const srcFiles = listPostPhotoFiles(postDir);
  if (srcFiles.length === 0) {
    throw new Error(`No photos in ${postPhotosDir(postDir)}`);
  }

  const destDir = path.join(publicMediaPostsDir(rootDir), postId);
  fs.mkdirSync(destDir, { recursive: true });

  // Remove old jpg/png media (keep caption if any)
  for (const name of fs.readdirSync(destDir)) {
    if (/\.(jpe?g|png|webp)$/i.test(name)) {
      fs.unlinkSync(path.join(destDir, name));
    }
  }

  const copied: string[] = [];
  for (const src of srcFiles) {
    const dest = path.join(destDir, path.basename(src));
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }

  const captionSrc = path.join(postDir, 'caption.txt');
  if (fs.existsSync(captionSrc)) {
    fs.copyFileSync(captionSrc, path.join(destDir, 'caption.txt'));
  }

  return copied;
}

/**
 * Remove hosted photo binaries after TikTok has finished pulling
 * (call only when status is PUBLISH_COMPLETE). Keeps caption.txt if present.
 */
export function cleanupPublicPhotos(
  postId: string,
  rootDir = process.cwd(),
  options?: { removeDir?: boolean }
): number {
  const destDir = path.join(publicMediaPostsDir(rootDir), postId);
  if (!fs.existsSync(destDir)) return 0;

  let removed = 0;
  for (const name of fs.readdirSync(destDir)) {
    if (/\.(jpe?g|png|webp)$/i.test(name)) {
      fs.unlinkSync(path.join(destDir, name));
      removed += 1;
    }
  }

  if (options?.removeDir) {
    // Remove leftover caption/empty dir
    try {
      fs.rmSync(destDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  return removed;
}

/** Delete local posts/<id>/photos/*.jpg after successful publish (optional archive wipe). */
export function cleanupLocalPostPhotos(postDir: string): number {
  const dir = postPhotosDir(postDir);
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (/\.(jpe?g|png|webp)$/i.test(name)) {
      fs.unlinkSync(path.join(dir, name));
      removed += 1;
    }
  }
  return removed;
}

export function photoPublicUrls(postId: string, baseUrl: string, rootDir = process.cwd()): string[] {
  const destDir = path.join(publicMediaPostsDir(rootDir), postId);
  if (!fs.existsSync(destDir)) return [];
  const base = baseUrl.replace(/\/$/, '');
  return fs
    .readdirSync(destDir)
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort()
    .map((name) => `${base}/media/posts/${postId}/${name}`);
}
