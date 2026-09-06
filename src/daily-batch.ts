import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { photosFromOverlays, syncPhotosToPublic } from './photo-assets';
import { searchTrendingTopics } from './trend-searcher';

const SERIES_FILE = path.join(process.cwd(), 'content-series.json');
const VIDEOS_DIR = path.join(process.cwd(), 'storage', 'videos');
const POSTS_DIR = path.join(VIDEOS_DIR, 'posts');

type SeriesFile = {
  niche: string;
  topics: string[];
  last_index: number;
};

type ExistingPostRecord = {
  id: string;
  topic: string;
  normalized: string;
  tokens: Set<string>;
};

function loadSeries(): SeriesFile {
  if (!fs.existsSync(SERIES_FILE)) {
    return { niche: 'AI cho creator', topics: ['AI giúp creator làm content nhanh hơn'], last_index: -1 };
  }
  return JSON.parse(fs.readFileSync(SERIES_FILE, 'utf8')) as SeriesFile;
}

function saveSeries(series: SeriesFile): void {
  fs.writeFileSync(SERIES_FILE, `${JSON.stringify(series, null, 2)}\n`, 'utf8');
}

function normalizeTopic(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function topicTokens(text: string): Set<string> {
  const stopwords = new Set([
    'ai',
    'cho',
    'va',
    'và',
    'cua',
    'của',
    'the',
    'la',
    'là',
    'tren',
    'trên',
    'voi',
    'với',
    'khi',
    'nao',
    'nào',
    'cac',
    'các',
    'mot',
    'một',
    'nhung',
    'những',
    'bang',
    'bằng',
    'de',
    'để',
    'tu',
    'từ',
    'den',
    'đến',
    'trong',
    'cho',
    'creator',
    'tiktok',
  ]);

  return new Set(
    normalizeTopic(text)
      .split(' ')
      .filter((token) => token.length >= 3 && !stopwords.has(token))
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = overlapCount(a, b);
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : overlap / union;
}

function loadExistingPostRecords(): ExistingPostRecord[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .map((id) => {
      const metaPath = path.join(POSTS_DIR, id, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { topic?: string };
        const topic = String(meta.topic || '').trim();
        if (!topic) return null;
        return {
          id,
          topic,
          normalized: normalizeTopic(topic),
          tokens: topicTokens(topic),
        } satisfies ExistingPostRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is ExistingPostRecord => Boolean(record));
}

function findSimilarTopic(candidate: string, existing: ExistingPostRecord[]): ExistingPostRecord | null {
  const normalized = normalizeTopic(candidate);
  const tokens = topicTokens(candidate);

  for (const record of existing) {
    if (record.normalized === normalized) return record;
    if (normalized.includes(record.normalized) || record.normalized.includes(normalized)) return record;

    const overlap = overlapCount(tokens, record.tokens);
    const similarity = jaccardSimilarity(tokens, record.tokens);
    if (overlap >= 4 && similarity >= 0.6) return record;
  }

  return null;
}

function nextSeriesTopic(series: SeriesFile, existing: ExistingPostRecord[]): string {
  if (series.topics.length === 0) {
    throw new Error('No topics configured in content-series.json');
  }

  for (let attempt = 0; attempt < series.topics.length; attempt += 1) {
    const nextIndex = (series.last_index + 1 + attempt) % series.topics.length;
    const candidate = series.topics[nextIndex];
    const duplicate = findSimilarTopic(candidate, existing);
    if (duplicate) {
      console.log(`⏭️  Skip similar topic: "${candidate}" (close to post ${duplicate.id})`);
      continue;
    }

    series.last_index = nextIndex;
    saveSeries(series);
    return candidate;
  }

  throw new Error('All configured series topics are too similar to existing posts. Add more topics first.');
}

async function pickTopic(manualTopic?: string): Promise<string> {
  const existing = loadExistingPostRecords();
  if (manualTopic?.trim()) {
    const topic = manualTopic.trim();
    const duplicate = findSimilarTopic(topic, existing);
    if (duplicate) {
      throw new Error(`Manual topic too similar to post ${duplicate.id}: "${duplicate.topic}"`);
    }
    return topic;
  }

  const series = loadSeries();
  const baseTopic = nextSeriesTopic(series, existing);

  if (process.env.SERIES_ONLY === '1') {
    return baseTopic;
  }

  try {
    const trends = await searchTrendingTopics();
    const trendHint = trends.trending_topics[0];
    const hashtags = trends.trending_hashtags.slice(0, 3).join(' ');

    if (trendHint) {
      return `${baseTopic}. Góc trending: ${trendHint}. Hashtags tham khảo: ${hashtags}`;
    }
  } catch (error: any) {
    console.warn(`⚠️ Trend research failed, using series topic only: ${error.message}`);
  }

  return baseTopic;
}

function slotLabel(): string {
  const hour = new Date().getHours();
  if (hour < 10) return 'morning';
  if (hour < 14) return 'noon';
  return 'evening';
}

function resolveNpx(): string {
  if (process.env.NPX_BIN) {
    return process.env.NPX_BIN;
  }

  const home = process.env.HOME;
  if (home) {
    const nvmRoot = path.join(home, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmRoot)) {
      const versions = fs
        .readdirSync(nvmRoot)
        .map((version) => path.join(nvmRoot, version, 'bin', 'npx'))
        .filter((candidate) => fs.existsSync(candidate))
        .sort();
      if (versions.length > 0) {
        return versions[versions.length - 1];
      }
    }
  }

  return 'npx';
}

function runAutoContent(topic: string): void {
  const npx = resolveNpx();
  const args = ['ts-node', path.join('src', 'auto-content.ts'), topic];
  if (process.env.REUSE_IMAGES === '1') {
    args.push('--reuse-images');
  }

  const result = spawnSync(npx, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error('auto-content failed');
  }
}

function runCover(scenesPath: string): void {
  const overlay = path.join(process.cwd(), 'images', 'overlays', 'scene_1.png');
  const coverPath = path.join(VIDEOS_DIR, 'cover.png');

  if (!fs.existsSync(overlay)) {
    console.warn('⚠️ No overlay image found, skipping cover generation');
    return;
  }

  if (!fs.existsSync(scenesPath)) {
    console.warn('⚠️ No scenes.json found, skipping cover generation');
    return;
  }

  const pythonBin = process.env.PYTHON_BIN || '/usr/bin/python3';
  const result = spawnSync(
    pythonBin,
    ['scripts-create-cover.py', overlay, coverPath, scenesPath],
    { cwd: process.cwd(), stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.warn('⚠️ Cover generation failed');
  }
}

function archiveOutputs(topic: string): string {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '');
  const folderName = `${stamp}-${slotLabel()}`;
  const outDir = path.join(POSTS_DIR, folderName);
  fs.mkdirSync(outDir, { recursive: true });

  const files = [
    { src: path.join(VIDEOS_DIR, 'test.mp4'), dest: 'video.mp4' },
    { src: path.join(VIDEOS_DIR, 'caption.txt'), dest: 'caption.txt' },
    { src: path.join(VIDEOS_DIR, 'cover.png'), dest: 'cover.png' },
    { src: path.join(VIDEOS_DIR, 'scenes.json'), dest: 'scenes.json' },
  ];

  for (const file of files) {
    if (fs.existsSync(file.src)) {
      fs.copyFileSync(file.src, path.join(outDir, file.dest));
    }
  }

  // Photo-first assets for TikTok PHOTO Direct Post (+ auto music)
  const photosSrc = path.join(VIDEOS_DIR, 'photos');
  const photosDest = path.join(outDir, 'photos');
  let photoCount = 0;
  if (fs.existsSync(photosSrc)) {
    fs.mkdirSync(photosDest, { recursive: true });
    for (const name of fs.readdirSync(photosSrc)) {
      if (!/\.jpe?g$/i.test(name)) continue;
      fs.copyFileSync(path.join(photosSrc, name), path.join(photosDest, name));
      photoCount += 1;
    }
  }

  // Also mirror into public/media/posts for PULL_FROM_URL
  if (photoCount > 0) {
    syncPhotosToPublic(folderName, outDir);
  }

  const meta = {
    topic,
    created_at: now.toISOString(),
    slot: slotLabel(),
    format: photoCount > 0 ? 'photo' : 'video',
    video: fs.existsSync(path.join(outDir, 'video.mp4')) ? 'video.mp4' : null,
    photos: photoCount > 0 ? 'photos/' : null,
    photo_count: photoCount,
    caption: 'caption.txt',
    cover: fs.existsSync(path.join(outDir, 'cover.png')) ? 'cover.png' : null,
  };

  fs.writeFileSync(path.join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(VIDEOS_DIR, 'latest-topic.txt'), `${topic}\n`, 'utf8');
  fs.writeFileSync(path.join(VIDEOS_DIR, 'latest-post.txt'), `${folderName}\n`, 'utf8');

  return outDir;
}

async function main(): Promise<void> {
  const manualTopic = process.argv.slice(2).join(' ').trim() || undefined;
  const topic = await pickTopic(manualTopic);

  console.log('🗓️ Daily TikTok content batch\n');
  console.log('='.repeat(50));
  console.log(`📝 Topic: ${topic}`);
  console.log(`⏰ Slot: ${slotLabel()}`);
  console.log('='.repeat(50));

  runAutoContent(topic);

  const scenesPath = path.join(VIDEOS_DIR, 'scenes.json');
  runCover(scenesPath);

  // Rebuild photo set from THIS run's overlays only (match scenes.json).
  // Do NOT glob all scene_*.png — stale scene_7/8 leftovers become off-topic last slides.
  const overlaysDir = path.join(process.cwd(), 'images', 'overlays');
  const photosDir = path.join(VIDEOS_DIR, 'photos');
  let sceneCount = 6;
  if (fs.existsSync(scenesPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(scenesPath, 'utf8')) as { scenes?: unknown[] };
      if (Array.isArray(raw.scenes) && raw.scenes.length > 0) {
        sceneCount = raw.scenes.length;
      }
    } catch {
      // keep default
    }
  }

  if (fs.existsSync(overlaysDir)) {
    const overlayPaths: string[] = [];
    for (let i = 1; i <= sceneCount; i++) {
      const p = path.join(overlaysDir, `scene_${i}.png`);
      if (fs.existsSync(p)) overlayPaths.push(p);
    }
    // Remove leftover overlays from older runs (e.g. scene_7.png branding)
    for (const name of fs.readdirSync(overlaysDir)) {
      const m = name.match(/^scene_(\d+)\.png$/i);
      if (!m) continue;
      if (parseInt(m[1], 10) > sceneCount) {
        fs.unlinkSync(path.join(overlaysDir, name));
        console.log(`🧹 Removed stale overlay ${name}`);
      }
    }
    if (overlayPaths.length > 0) {
      const coverPath = path.join(VIDEOS_DIR, 'cover.png');
      await photosFromOverlays(
        overlayPaths,
        photosDir,
        fs.existsSync(coverPath) ? coverPath : undefined
      );
    }
  }

  const outDir = archiveOutputs(topic);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Daily batch complete');
  console.log(`📁 Saved to: ${outDir}`);
  console.log(`🆔 Post id: ${path.basename(outDir)}`);
  console.log('='.repeat(50) + '\n');
}

main().catch((error) => {
  console.error('\n❌ Daily batch failed:', error.message);
  process.exit(1);
});
