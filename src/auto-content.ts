import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import { generateImagesFromTopic } from './image-generator';
import { generateSlideshowFromImages } from './image-slideshow';
import { generateCaption } from './router9';

async function main(): Promise<void> {
  const topic = process.argv[2] || '3 cách dùng AI trong lập trình';
  const imageCount = parseInt(process.argv[3] || '3');

  console.log('🚀 TikTok Auto Content Generator\n');
  console.log('='.repeat(50));
  console.log(`📝 Topic: ${topic}`);
  console.log(`🖼️  Images to generate: ${imageCount}`);
  console.log('='.repeat(50));

  // Validate required env vars
  validateEnv(['ROUTER9_API_KEY']);

  const imagesDir = path.join(process.cwd(), 'images');
  const videoPath = path.join(config.storage.videosDir, 'test.mp4');

  // Step 1: Generate images with 9router
  console.log('\n[STEP 1] Generate images with 9router\n');
  const imagePaths = await generateImagesFromTopic(
    topic,
    imagesDir,
    imageCount
  );

  if (imagePaths.length === 0) {
    console.error('\n❌ No images generated. Exiting.');
    process.exit(1);
  }

  // Step 2: Create slideshow video
  console.log('\n[STEP 2] Create slideshow video\n');
  await generateSlideshowFromImages(imagePaths, videoPath, 3);

  // Step 3: Generate caption with AI
  console.log('\n[STEP 3] Generate caption with 9router\n');
  const caption = await generateCaption(topic);
  console.log(`   Caption: "${caption}"`);

  // Save caption to file
  const captionPath = path.join(config.storage.videosDir, 'caption.txt');
  fs.writeFileSync(captionPath, caption);
  console.log(`   Saved to: ${captionPath}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ COMPLETE! Ready for TikTok\n');
  console.log(`📹 Video: ${videoPath}`);
  console.log(`📝 Caption: ${caption}`);
  console.log(`\nNext step: npm run publish (when OAuth is ready)`);
  console.log('='.repeat(50) + '\n');
}

main().catch((error) => {
  console.error('\n❌ Auto-generation failed:', error.message);
  process.exit(1);
});
