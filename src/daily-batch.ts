import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { searchTrendingTopics } from './trend-searcher';

const SERIES_FILE = path.join(process.cwd(), 'content-series.json');
const VIDEOS_DIR = path.join(process.cwd(), 'storage', 'videos');
const POSTS_DIR = path.join(VIDEOS_DIR, 'posts');

type SeriesFile = {
  niche: string;
  topics: string[];
  last_index: number;
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

function nextSeriesTopic(series: SeriesFile): string {
  const nextIndex = (series.last_index + 1) % series.topics.length;
  series.last_index = nextIndex;
  saveSeries(series);
  return series.topics[nextIndex];
}

async function pickTopic(manualTopic?: string): Promise<string> {
  if (manualTopic?.trim()) {
    return manualTopic.trim();
  }

  const series = loadSeries();
  const baseTopic = nextSeriesTopic(series);

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

  const meta = {
    topic,
    created_at: now.toISOString(),
    slot: slotLabel(),
    video: 'video.mp4',
    caption: 'caption.txt',
    cover: fs.existsSync(path.join(outDir, 'cover.png')) ? 'cover.png' : null,
  };

  fs.writeFileSync(path.join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(VIDEOS_DIR, 'latest-topic.txt'), `${topic}\n`, 'utf8');

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

  const outDir = archiveOutputs(topic);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Daily batch complete');
  console.log(`📁 Saved to: ${outDir}`);
  console.log('📌 Publish manually on TikTok while developer review is pending');
  console.log('='.repeat(50) + '\n');
}

main().catch((error) => {
  console.error('\n❌ Daily batch failed:', error.message);
  process.exit(1);
});
