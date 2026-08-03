import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
