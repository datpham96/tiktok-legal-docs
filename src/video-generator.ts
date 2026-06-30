import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { splitCaptionToScenes } from './scene-splitter';
import { generateVideoFromScenes } from './video-from-scenes';

export async function generateTestVideo(): Promise<string> {
  const outputPath = path.join(config.storage.videosDir, 'test.mp4');

  // Create storage directory if not exists
  if (!fs.existsSync(config.storage.videosDir)) {
    fs.mkdirSync(config.storage.videosDir, { recursive: true });
    console.log(`📁 Created directory: ${config.storage.videosDir}`);
  }

  console.log('🎬 Generating test video...');

  // Check if ffmpeg is installed
  try {
    await checkFFmpeg();
  } catch (error) {
    console.error('❌ FFmpeg not found!');
    console.error('💡 Install FFmpeg:');
    console.error('   macOS: brew install ffmpeg');
    console.error('   Ubuntu: sudo apt install ffmpeg');
    console.error('   Windows: Download from https://ffmpeg.org/download.html');
    throw error;
  }

  // Default test caption
  const testCaption = 'AI Content Agent Test. Auto publishing to TikTok. Powered by AI 🚀';
  
  // Split caption into scenes
  const scenes = splitCaptionToScenes(testCaption, 8);
  
  // Generate video from scenes
  await generateVideoFromScenes(scenes, outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`\n✅ Video generated: ${outputPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Duration: 8 seconds`);
  console.log(`   Resolution: 1080x1920 (vertical)`);
  
  return outputPath;
}

export async function generateVideoFromCaption(caption: string): Promise<string> {
  const outputPath = path.join(config.storage.videosDir, 'test.mp4');

  if (!fs.existsSync(config.storage.videosDir)) {
    fs.mkdirSync(config.storage.videosDir, { recursive: true });
  }

  console.log('🎬 Generating video from caption...');
  console.log(`   Caption: "${caption}"`);

  const scenes = splitCaptionToScenes(caption, 8);
  await generateVideoFromScenes(scenes, outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`\n✅ Video generated: ${outputPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  return outputPath;
}

async function checkFFmpeg(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('FFmpeg not found'));
      }
    });

    ffmpeg.on('error', () => {
      reject(new Error('FFmpeg not found'));
    });
  });
}

// CLI mode: run if executed directly
if (require.main === module) {
  generateTestVideo()
    .then(() => {
      console.log('\n✅ Video generation complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Video generation failed:', error.message);
      process.exit(1);
    });
}
