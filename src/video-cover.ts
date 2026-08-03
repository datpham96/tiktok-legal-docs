import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * TikTok Direct Post cannot upload a custom cover.png.
 * It only picks a frame via video_cover_timestamp_ms.
 *
 * Recommended approach (default):
 * - Prepend cover.png for ~1.5s at the start (profile grid often samples ~1s in)
 * - Encode frequent keyframes in that segment (profile grid often samples keyframes)
 * - Set video_cover_timestamp_ms to the midpoint of the cover hold
 */
export async function bakeCoverIntoVideo(
  videoPath: string,
  coverPath: string,
  coverHoldSec = 1.5
): Promise<{ videoPath: string; coverTimestampMs: number; tempPath?: string }> {
  if (!fs.existsSync(coverPath)) {
    return { videoPath, coverTimestampMs: 1000 };
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-cover-'));
  const coverClip = path.join(tempDir, 'cover.mp4');
  const outPath = path.join(tempDir, 'with-cover.mp4');
  const listPath = path.join(tempDir, 'concat.txt');

  // Dense keyframes during cover so TikTok profile thumbnail samplers land on cover.png
  await runFfmpeg([
    '-loop', '1',
    '-i', coverPath,
    '-t', String(coverHoldSec),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-g', '15',
    '-keyint_min', '1',
    '-sc_threshold', '0',
    '-an',
    '-y',
    coverClip
  ]);

  // Re-encode original to match so concat is safe (slideshows are already silent H.264).
  const normalized = path.join(tempDir, 'body.mp4');
  await runFfmpeg([
    '-i', videoPath,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    normalized
  ]);

  fs.writeFileSync(
    listPath,
    `file '${coverClip.replace(/'/g, "'\\''")}'\nfile '${normalized.replace(/'/g, "'\\''")}'\n`
  );

  await runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-y',
    outPath
  ]);

  // Midpoint of the cover still — ask TikTok player/cover API to use this frame.
  const coverTimestampMs = Math.max(100, Math.floor((coverHoldSec * 1000) / 2));

  return {
    videoPath: outPath,
    coverTimestampMs,
    tempPath: tempDir
  };
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
