import { config } from './config';
import { getImagesFromFolder, generateSlideshowFromImages } from './image-slideshow';
import path from 'path';

async function main() {
  const imageFolder = process.argv[2] || path.join(process.cwd(), 'images');
  const outputPath = path.join(config.storage.videosDir, 'test.mp4');
  const durationPerImage = parseFloat(process.argv[3] || '3');

  console.log('🎬 Generating slideshow video from images...\n');
  console.log(`   Image folder: ${imageFolder}`);
  console.log(`   Output: ${outputPath}`);

  const images = getImagesFromFolder(imageFolder);

  if (images.length === 0) {
    console.error(`\n❌ No images found in: ${imageFolder}`);
    console.error('💡 Put your images (.png, .jpg, .jpeg, .webp, .gif) in the folder first.\n');
    process.exit(1);
  }

  console.log(`\n📷 Found ${images.length} image(s):`);
  images.forEach((img, i) => {
    console.log(`   ${i + 1}. ${path.basename(img)}`);
  });

  await generateSlideshowFromImages(images, outputPath, durationPerImage);
  
  console.log(`\n✅ Done! Open: ${outputPath}\n`);
}

main().catch((error) => {
  console.error('\n❌ Failed:', error.message);
  process.exit(1);
});
