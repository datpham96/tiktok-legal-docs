import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import { generateImagesFromScenes } from './image-generator';
import { generateSlideshowFromImages } from './image-slideshow';
import { generateCaption } from './router9';
import { planVideoScenes, saveVideoScript } from './scene-planner';

function assertNonEmptyFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size < 1024) {
    throw new Error(`${label} looks invalid (<1KB): ${filePath}`);
  }
}

function stripReasoning(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking>[\s\S]*/gi, '')
    .trim();
}

function cleanCaption(raw: string): string {
  let text = stripReasoning(raw.trim());

  if (!text) {
    throw new Error('Caption is empty');
  }

  return text
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/m, '')
    .trim();
}

async function renderOverlayImages(scenesPath: string, imagePaths: string[], outputDir: string): Promise<string[]> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts-render-overlays.py');
    const args = [scriptPath, scenesPath, ...imagePaths, outputDir];
    const pythonBin = process.env.PYTHON_BIN || '/usr/bin/python3';
    const child = spawn(pythonBin, args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Overlay renderer exited with code ${code}`));
        return;
      }

      const overlayPaths = imagePaths.map((_, index) => path.join(outputDir, `scene_${index + 1}.png`));

      try {
        overlayPaths.forEach((overlayPath, index) => {
          assertNonEmptyFile(overlayPath, `Overlay image ${index + 1}`);
        });
        resolve(overlayPaths);
      } catch (error) {
        reject(error);
      }
    });

    child.on('error', reject);
  });
}

async function main(): Promise<void> {
  const topic = process.argv[2] || '3 cách dùng AI trong lập trình';
  const sceneCountArg = process.argv[3];
  const sceneCount = sceneCountArg ? parseInt(sceneCountArg, 10) : 5;

  console.log('🚀 TikTok Auto Content Generator\n');
  console.log('='.repeat(50));
  console.log(`📝 Topic: ${topic}`);
  console.log(`🎬 Scenes: ${sceneCount} (AI script with title + body content)`);
  console.log('='.repeat(50));

  validateEnv(['ROUTER9_API_KEY']);

  const imagesDir = path.join(process.cwd(), 'images');
  const overlaysDir = path.join(imagesDir, 'overlays');
  const videoPath = path.join(config.storage.videosDir, 'test.mp4');
  const captionPath = path.join(config.storage.videosDir, 'caption.txt');
  const scenesPath = path.join(config.storage.videosDir, 'scenes.json');

  console.log('\n[STEP 1] Plan video script with AI\n');
  const script = await planVideoScenes(topic, sceneCount);
  saveVideoScript(script, scenesPath);
  console.log(`✅ Planned ${script.scenes.length} scenes with detailed content`);
  script.scenes.forEach((scene, i) => {
    console.log(`   ${i + 1}. ${scene.title}`);
    console.log(`      ${scene.body.substring(0, 80)}...`);
  });

  console.log('\n[STEP 2] Generate scene background images\n');
  const imagePaths = await generateImagesFromScenes(script.scenes, imagesDir);

  if (imagePaths.length === 0) {
    throw new Error('No images generated');
  }

  imagePaths.forEach((imagePath, index) => {
    assertNonEmptyFile(imagePath, `Source image ${index + 1}`);
  });

  console.log('\n[STEP 3] Render overlays (title + body content)\n');
  const overlayPaths = await renderOverlayImages(scenesPath, imagePaths, overlaysDir);

  console.log('\n[STEP 4] Create slideshow video\n');
  await generateSlideshowFromImages(overlayPaths, videoPath, 4);
  assertNonEmptyFile(videoPath, 'Output video');

  console.log('\n[STEP 5] Generate caption\n');
  const caption = cleanCaption(await generateCaption(topic));
  console.log(`   Caption: "${caption}"`);

  fs.writeFileSync(captionPath, `${caption}\n`, 'utf8');
  if (!fs.existsSync(captionPath) || caption.trim().length === 0) {
    throw new Error('Caption file is empty');
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ COMPLETE! Ready for TikTok\n');
  console.log(`📹 Video: ${videoPath} (${script.scenes.length} scenes × 4s)`);
  console.log(`📄 Script: ${scenesPath}`);
  console.log(`📝 Caption: ${caption}`);
  console.log('='.repeat(50) + '\n');
}

main().catch((error) => {
  console.error('\n❌ Auto-generation failed:', error.message);
  process.exit(1);
});
