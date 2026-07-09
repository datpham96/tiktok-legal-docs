import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function generateSlideshowFromImages(
  imagePaths: string[],
  outputPath: string,
  durationPerImage: number = 3
): Promise<string> {
  if (imagePaths.length === 0) {
    throw new Error('No images provided');
  }

  console.log(`🖼️  Creating slideshow from ${imagePaths.length} image(s)...`);

  const tempDir = path.join(path.dirname(outputPath), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create FFmpeg concat file
  const concatFile = path.join(tempDir, 'slideshow.txt');
  const concatContent = imagePaths.map((imgPath) => {
    const absolutePath = path.resolve(imgPath);
    return `file '${absolutePath}'\nduration ${durationPerImage}`;
  }).join('\n') + `\nfile '${path.resolve(imagePaths[imagePaths.length - 1])}'`;
  
  fs.writeFileSync(concatFile, concatContent);

  console.log(`   Duration per image: ${durationPerImage}s`);
  console.log(`   Total duration: ${imagePaths.length * durationPerImage}s`);

  // Generate video from images
  await ffmpegSlideshowVideo(concatFile, outputPath);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

  const stats = fs.statSync(outputPath);
  console.log(`\n✅ Slideshow video generated: ${outputPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Images: ${imagePaths.length}`);
  console.log(`   Resolution: 1080x1920 (vertical)`);

  return outputPath;
}

async function ffmpegSlideshowVideo(concatFile: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y',
      outputPath
    ];

    console.log(`\n🎞️  Running FFmpeg...`);

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error('❌ FFmpeg error:', stderr);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}

export function getImagesFromFolder(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath);
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  
  return files
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    })
    .map(file => path.join(folderPath, file))
    .sort();
}
