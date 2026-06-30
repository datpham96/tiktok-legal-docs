import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from './config';

interface ImageGenerationOptions {
  prompt: string;
  outputPath: string;
  model?: string;
  width?: number;
  height?: number;
}

function extractJsonObjectsFromSse(raw: string): any[] {
  const lines = raw.split('\n');
  const jsonObjects: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;

    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;

    try {
      jsonObjects.push(JSON.parse(payload));
    } catch {
      // ignore non-json chunks
    }
  }

  return jsonObjects;
}

function extractImageUrl(data: any): string | null {
  if (!data) return null;

  if (typeof data === 'string' && data.startsWith('http')) {
    return data;
  }

  if (data.url && typeof data.url === 'string') {
    return data.url;
  }

  if (Array.isArray(data.data) && data.data[0]?.url) {
    return data.data[0].url;
  }

  if (data.result?.url) {
    return data.result.url;
  }

  return null;
}

function extractImageB64(data: any): string | null {
  if (!data) return null;

  if (data.b64_json && typeof data.b64_json === 'string') {
    return data.b64_json;
  }

  if (Array.isArray(data.data) && data.data[0]?.b64_json) {
    return data.data[0].b64_json;
  }

  if (data.result?.b64_json) {
    return data.result.b64_json;
  }

  return null;
}

export async function generateImageWith9Router(
  options: ImageGenerationOptions
): Promise<string> {
  const {
    prompt,
    outputPath,
    model = 'cx/gpt-5.5-image',
    width = 1024,
    height = 1792
  } = options;

  console.log(`🎨 Generating image: "${prompt.substring(0, 50)}..."`);

  try {
    const response = await axios.post(
      `${config.router9.baseUrl}/v1/images/generations`,
      {
        model,
        prompt,
        n: 1,
        size: 'auto',
        quality: 'auto',
        background: 'auto',
        image_detail: 'high',
        output_format: 'png'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.router9.apiKey}`,
          'Accept': 'text/event-stream'
        },
        responseType: 'text',
        timeout: 120000
      }
    );

    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const events = extractJsonObjectsFromSse(raw);

    let imageUrl: string | null = null;
    let imageB64: string | null = null;

    for (const event of events) {
      imageUrl = extractImageUrl(event) || imageUrl;
      imageB64 = extractImageB64(event) || imageB64;
    }

    if (!imageUrl && !imageB64) {
      imageUrl = extractImageUrl(response.data);
      imageB64 = extractImageB64(response.data);
    }

    if (imageB64) {
      // Decode base64 and save directly
      console.log(`   Decoding base64 image...`);
      const imageBuffer = Buffer.from(imageB64, 'base64');
      fs.writeFileSync(outputPath, imageBuffer);
      console.log(`✅ Image saved: ${outputPath}`);
      return outputPath;
    }

    if (!imageUrl) {
      throw new Error('Could not extract image URL or b64_json from response');
    }

    // Download image
    console.log(`   Downloading image...`);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    // Save to file
    fs.writeFileSync(outputPath, imageResponse.data);
    console.log(`✅ Image saved: ${outputPath}`);

    return outputPath;

  } catch (error: any) {
    console.error('❌ Image generation failed:', error.message);
    if (error.response) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
    }
    throw error;
  }
}

export async function generateImagesFromTopic(
  topic: string,
  outputDir: string,
  count: number = 3
): Promise<string[]> {
  console.log(`\n🎨 Generating ${count} images for topic: "${topic}"\n`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate prompts for each image
  const prompts = generatePromptsFromTopic(topic, count);
  const imagePaths: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const outputPath = path.join(outputDir, `scene_${i + 1}.png`);

    console.log(`\n[${i + 1}/${count}]`);
    
    try {
      await generateImageWith9Router({ prompt, outputPath });
      imagePaths.push(outputPath);
    } catch (error) {
      console.error(`   Skipping scene ${i + 1} due to error`);
    }

    // Rate limiting: wait 2s between requests
    if (i < prompts.length - 1) {
      console.log(`   Waiting 2s before next image...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n✅ Generated ${imagePaths.length}/${count} images`);
  return imagePaths;
}

function generatePromptsFromTopic(topic: string, count: number): string[] {
  // Base style prompt for TikTok vertical images
  const baseStyle = `Modern TikTok style vertical image (9:16 ratio), bold text overlay, trendy gradient background, minimalist design, vibrant colors, professional typography`;

  // Generate scene-specific prompts
  const prompts: string[] = [];

  if (topic.includes('AI') || topic.includes('lập trình') || topic.includes('programming')) {
    prompts.push(
      `${baseStyle}. Title text: "AI TRONG LẬP TRÌNH". Show futuristic coding interface with AI assistant, holographic code displays, neural network visualization`,
      `${baseStyle}. Title text: "AI AGENT TỰ ĐỘNG HÓA". Show AI robot assistant helping with tasks, automated workflow visualization, modern tech aesthetic`,
      `${baseStyle}. Title text: "HỌC LẬP TRÌNH VỚI AI". Show person learning with AI tutor hologram, code snippets floating, educational tech vibe`
    );
  } else {
    // Generic scene generation
    for (let i = 0; i < count; i++) {
      prompts.push(
        `${baseStyle}. About: ${topic}. Scene ${i + 1} of ${count}. Creative and engaging visual representation`
      );
    }
  }

  return prompts.slice(0, count);
}
