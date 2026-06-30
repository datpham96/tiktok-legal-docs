import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { Scene } from './scene-splitter';

export async function generateVideoFromScenes(
  scenes: Scene[],
  outputPath: string
): Promise<string> {
  const tempDir = path.join(config.storage.videosDir, 'temp');
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log(`🎬 Generating ${scenes.length} scene(s)...`);

  // Generate PNG for each scene
  const framePaths: string[] = [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const framePath = path.join(tempDir, `scene_${i}.png`);
    
    console.log(`   Scene ${i + 1}: "${scene.text}"`);
    
    await renderSceneToPng(scene.text, framePath);
    framePaths.push(framePath);
  }

  // Create FFmpeg concat file
  const concatFile = path.join(tempDir, 'concat.txt');
  const concatContent = scenes.map((scene, i) => {
    return `file 'scene_${i}.png'\nduration ${scene.duration}`;
  }).join('\n') + `\nfile 'scene_${scenes.length - 1}.png'`; // FFmpeg needs last frame repeated
  
  fs.writeFileSync(concatFile, concatContent);

  // Generate video from scenes
  console.log(`\n🎞️  Combining scenes into video...`);
  
  await ffmpegConcatScenes(concatFile, outputPath);

  // Cleanup temp files
  console.log(`🧹 Cleaning up temporary files...`);
  fs.rmSync(tempDir, { recursive: true, force: true });

  return outputPath;
}

async function renderSceneToPng(text: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const renderScript = path.join(process.cwd(), 'render-text.js');
    const node = spawn('node', [renderScript, text, outputPath]);

    node.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Render failed with code ${code}`));
      }
    });

    node.on('error', reject);
  });
}

async function ffmpegConcatScenes(concatFile: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error('FFmpeg error:', stderr);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}
