import { spawn } from 'child_process';
import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/** Royalty-free demo pack (SoundHelix 1–16). Drop your own .mp3 into assets/bgm/ anytime. */
const BGM_PACK: Array<{ name: string; url: string }> = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1;
  return {
    name: `${String(n).padStart(2, '0')}-helix-${n}.mp3`,
    url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`
  };
});

const DEFAULT_BGM_URL =
  process.env.BGM_URL || BGM_PACK[7].url;

type BgmHistoryEntry = {
  file: string;
  used_at: string;
  post_id?: string;
  topic?: string;
};

type BgmHistory = {
  recent: BgmHistoryEntry[];
};

export type PickedBgm = {
  path: string;
  name: string;
};

export function bgmDir(rootDir = process.cwd()): string {
  return path.join(rootDir, 'assets', 'bgm');
}

export function bgmHistoryPath(rootDir = process.cwd()): string {
  return path.join(rootDir, 'storage', 'bgm-history.json');
}

export function defaultBgmPath(): string {
  return process.env.BGM_PATH || path.join(bgmDir(), '08-helix-8.mp3');
}

function avoidRecentCount(): number {
  const n = parseInt(process.env.BGM_AVOID_RECENT || '8', 10);
  return Number.isFinite(n) && n >= 0 ? n : 8;
}

export function listBgmFiles(rootDir = process.cwd()): string[] {
  const dir = bgmDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  const all = fs
    .readdirSync(dir)
    .filter((name) => /\.mp3$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name))
    .filter((p) => fs.statSync(p).size > 10_000);

  // Prefer numbered pack tracks; skip legacy default.mp3 alias when others exist
  const withoutDefault = all.filter((p) => path.basename(p).toLowerCase() !== 'default.mp3');
  return withoutDefault.length > 0 ? withoutDefault : all;
}

function loadHistory(rootDir = process.cwd()): BgmHistory {
  const file = bgmHistoryPath(rootDir);
  if (!fs.existsSync(file)) return { recent: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as BgmHistory;
    return { recent: Array.isArray(raw.recent) ? raw.recent : [] };
  } catch {
    return { recent: [] };
  }
}

function saveHistory(history: BgmHistory, rootDir = process.cwd()): void {
  const file = bgmHistoryPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Keep last 50 uses
  history.recent = history.recent.slice(0, 50);
  fs.writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

export function recordBgmUsage(
  musicPath: string,
  options?: { postId?: string; topic?: string },
  rootDir = process.cwd()
): void {
  const history = loadHistory(rootDir);
  history.recent.unshift({
    file: path.basename(musicPath),
    used_at: new Date().toISOString(),
    post_id: options?.postId,
    topic: options?.topic
  });
  saveHistory(history, rootDir);
}

function stableIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;
  const hash = crypto.createHash('sha1').update(seed).digest();
  return hash.readUInt32BE(0) % modulo;
}

/**
 * Download starter BGM pack into assets/bgm/ (skips files that already exist).
 * Drop your own .mp3 files in the same folder — they are picked automatically.
 */
export async function ensureBgmLibrary(rootDir = process.cwd()): Promise<string[]> {
  const dir = bgmDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });

  for (const track of BGM_PACK) {
    const dest = path.join(dir, track.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) continue;
    console.log(`🎵 Downloading BGM ${track.name}...`);
    await downloadFile(track.url, dest);
  }

  // Keep legacy default.mp3 as alias of helix-8 if missing
  const legacy = path.join(dir, 'default.mp3');
  const helix8 = path.join(dir, '08-helix-8.mp3');
  if (!fs.existsSync(legacy) && fs.existsSync(helix8)) {
    fs.copyFileSync(helix8, legacy);
  }

  const files = listBgmFiles(rootDir);
  if (files.length === 0) {
    throw new Error(`No BGM files in ${dir}. Add .mp3 files or check network download.`);
  }
  return files;
}

/** @deprecated prefer pickBgm() — kept for older callers */
export async function ensureDefaultBgm(): Promise<string> {
  if (process.env.BGM_PATH && fs.existsSync(process.env.BGM_PATH)) {
    return process.env.BGM_PATH;
  }
  const picked = await pickBgm();
  return picked.path;
}

/**
 * Pick a BGM track, avoiding the N most recently used (BGM_AVOID_RECENT, default 5).
 * Optional postId/topic seed keeps the same post deterministic if re-run.
 */
export async function pickBgm(options?: {
  postId?: string;
  topic?: string;
  rootDir?: string;
  record?: boolean;
}): Promise<PickedBgm> {
  const rootDir = options?.rootDir || process.cwd();

  if (process.env.BGM_PATH && fs.existsSync(process.env.BGM_PATH)) {
    const forced = process.env.BGM_PATH;
    if (options?.record !== false) {
      recordBgmUsage(forced, options, rootDir);
    }
    return { path: forced, name: path.basename(forced) };
  }

  const files = await ensureBgmLibrary(rootDir);
  const history = loadHistory(rootDir);
  const avoid = avoidRecentCount();
  const recent = new Set(history.recent.slice(0, avoid).map((e) => e.file));

  let candidates = files.filter((f) => !recent.has(path.basename(f)));
  if (candidates.length === 0) {
    candidates = files;
  }

  const seed = options?.postId || options?.topic || `${Date.now()}`;
  const chosen = candidates[stableIndex(seed, candidates.length)];

  if (options?.record !== false) {
    recordBgmUsage(chosen, options, rootDir);
  }

  return { path: chosen, name: path.basename(chosen) };
}

export async function videoHasAudio(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        videoPath
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', () => resolve(/audio/i.test(out)));
    child.on('error', () => resolve(false));
  });
}

/**
 * Mix a looping BGM track into a (possibly silent) video.
 * TikTok video Direct Post cannot auto-select music; embedding audio is the reliable path.
 */
export async function muxBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath?: string
): Promise<string> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }
  if (!fs.existsSync(musicPath)) {
    throw new Error(`Music not found: ${musicPath}`);
  }

  const out =
    outputPath ||
    path.join(os.tmpdir(), `tiktok-bgm-${Date.now()}.mp4`);

  await runFfmpeg([
    '-y',
    '-i', videoPath,
    '-stream_loop', '-1',
    '-i', musicPath,
    '-shortest',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    out
  ]);

  return out;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {
          // ignore
        }
        downloadFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {
          // ignore
        }
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
    });
    req.on('error', (err) => {
      file.close();
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
      reject(err);
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-800)}`));
    });
    child.on('error', reject);
  });
}
