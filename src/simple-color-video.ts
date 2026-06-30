import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config';

interface ColorScene {
  color: string;
  duration: number;
}

export async function generateSimpleColorVideo(
  scenes: ColorScene[],
  outputPath: string
): Promise<string> {
  console.log(`🎨 Generating ${scenes.length} color scene(s)...`);

  const tempDir = path.join(config.storage.videosDir, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generate each scene as a separate video
  const scenePaths: string[] = [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const scenePath = path.join(tempDir, `scene_${i}.mp4`);
    
    console.log(`   Scene ${i + 1}: ${scene.color} (${scene.duration}s)`);
    
    await generateColorScene(scene.color, scene.duration, scenePath);
    scenePaths.push(scenePath);
  }

  // Concat all scenes
  console.log(`\n🎞️  Combining scenes...`);
  await concatVideos(scenePaths, outputPath);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

  const stats = fs.statSync(outputPath);
  console.log(`\n✅ Video generated: ${outputPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Resolution: 1080x1920`);

  return outputPath;
}

async function generateColorScene(color: string, duration: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'lavfi',
      '-i', `color=c=${color}:s=1080x1920:d=${duration}`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
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
        reject(new Error(`FFmpeg scene generation failed: ${stderr}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

async function concatVideos(videoPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempDir = path.dirname(videoPaths[0]);
    const concatFile = path.join(tempDir, 'concat_list.txt');
    
    const concatContent = videoPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
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
        reject(new Error(`FFmpeg concat failed: ${stderr}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}
