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

function extractImageB64FromRaw(raw: string): string | null {
  let best: string | null = null;

  for (const event of extractJsonObjectsFromSse(raw)) {
    const b64 = extractImageB64(event);
    if (b64 && (!best || b64.length > best.length)) {
      best = b64;
    }
  }

  const matches = [...raw.matchAll(/"b64_json"\s*:\s*"([A-Za-z0-9+/=\r\n]+)"/g)];
  for (const match of matches) {
    const cleaned = match[1].replace(/\s/g, '');
    if (cleaned.length > (best?.length || 0)) {
      best = cleaned;
    }
  }

  return best;
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

function saveValidImage(outputPath: string, imageBuffer: Buffer): void {
  if (imageBuffer.length < 1024) {
    throw new Error(`Image data suspiciously small (${imageBuffer.length} bytes), likely error response`);
  }

  const signature = imageBuffer.subarray(0, 12).toString('hex');
  const isPng = signature.startsWith('89504e470d0a1a0a');
  const isJpeg = signature.startsWith('ffd8ff');
  const isWebp = imageBuffer.subarray(0, 4).toString('ascii') === 'RIFF' && imageBuffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isPng && !isJpeg && !isWebp) {
    throw new Error(`Downloaded data is not a supported image. First bytes: ${signature}`);
  }

  fs.writeFileSync(outputPath, imageBuffer);

  const stats = fs.statSync(outputPath);
  if (stats.size < 1024) {
    fs.unlinkSync(outputPath);
    throw new Error(`Saved image is invalid (<1KB), deleted: ${outputPath}`);
  }

  console.log(`✅ Image saved: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
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
        timeout: 180000
      }
    );

    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    let imageUrl: string | null = null;
    let imageB64: string | null = extractImageB64FromRaw(raw);

    // 1) Try normal JSON response first
    if (!imageB64) {
      try {
        const parsed = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        imageUrl = extractImageUrl(parsed) || imageUrl;
        imageB64 = extractImageB64(parsed) || imageB64;
      } catch {
        // not plain JSON, continue with SSE parsing
      }
    }

    // 2) Fallback to SSE event objects
    if (!imageUrl && !imageB64) {
      for (const event of extractJsonObjectsFromSse(raw)) {
        imageUrl = extractImageUrl(event) || imageUrl;
        imageB64 = extractImageB64(event) || imageB64;
      }
    }

    // 3) Final fallback: inspect raw response object directly
    if (!imageUrl && !imageB64) {
      imageUrl = extractImageUrl(response.data);
      imageB64 = extractImageB64(response.data);
    }

    if (imageB64) {
      console.log(`   Decoding base64 image...`);
      const imageBuffer = Buffer.from(imageB64, 'base64');
      saveValidImage(outputPath, imageBuffer);
      return outputPath;
    }

    if (!imageUrl) {
      throw new Error('Could not extract image URL or b64_json from response');
    }

    console.log(`   Downloading image...`);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const imageBuffer = Buffer.from(imageResponse.data);
    saveValidImage(outputPath, imageBuffer);

    return outputPath;

  } catch (error: any) {
    console.error('❌ Image generation failed:', error.message);
    if (error.response) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
    }
    throw error;
  }
}

export async function generateImagesFromScenes(
  scenes: Array<{ image_prompt: string }>,
  outputDir: string
): Promise<string[]> {
  console.log(`\n🎨 Generating ${scenes.length} scene images from AI script\n`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const imagePaths: string[] = [];
  const baseStyle = 'Cinematic TikTok background, vertical composition, vibrant modern colors, high detail, clean aesthetic, no text, no typography, no letters, no words';

  for (let i = 0; i < scenes.length; i++) {
    const prompt = `${baseStyle}. ${scenes[i].image_prompt}`;
    const outputPath = path.join(outputDir, `scene_${i + 1}.png`);

    console.log(`\n[${i + 1}/${scenes.length}]`);
    try {
      await generateImageWith9Router({ prompt, outputPath });
      imagePaths.push(outputPath);
    } catch (error) {
      console.error(`   Skipping scene ${i + 1} due to error`);
    }

    if (i < scenes.length - 1) {
      console.log('   Waiting 2s before next image...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n✅ Generated ${imagePaths.length}/${scenes.length} images`);
  return imagePaths;
}

export async function generateImagesFromTopic(
  topic: string,
  outputDir: string,
  count?: number
): Promise<string[]> {
  const prompts = generatePromptsFromTopic(topic, count);
  const plannedCount = prompts.length;

  console.log(`\n🎨 Generating ${plannedCount} images for topic: "${topic}"${count ? ' (manual)' : ' (auto)'}\n`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const imagePaths: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const outputPath = path.join(outputDir, `scene_${i + 1}.png`);

    console.log(`\n[${i + 1}/${plannedCount}]`);
    
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

  console.log(`\n✅ Generated ${imagePaths.length}/${plannedCount} images`);
  return imagePaths;
}

function estimateSceneCountFromTopic(topic: string): number {
  const normalized = topic.toLowerCase();

  const separators = topic
    .split(/[,;:+\-–—]|\b(?:và|rồi|sau đó|tiếp theo|đồng thời|vs)\b/gi)
    .map(part => part.trim())
    .filter(Boolean);

  const stepKeywords = ['bước', 'step', 'quy trình', 'workflow', 'hướng dẫn', 'chi tiết', 'phân tích', 'setup', 'tự động', 'automation'];
  const shortKeywords = ['mẹo', 'tip', 'nhanh', '3 cách', '5 cách', '7 cách'];

  let score = 0;
  score += Math.min(separators.length, 6);
  score += stepKeywords.filter(keyword => normalized.includes(keyword)).length;
  score -= shortKeywords.filter(keyword => normalized.includes(keyword)).length;

  if (normalized.length > 90) score += 1;
  if (normalized.length > 140) score += 1;

  const estimated = 4 + Math.max(0, score - 2);
  return Math.max(3, Math.min(8, estimated));
}

function generatePromptsFromTopic(topic: string, count?: number): string[] {
  const plannedCount = count ?? estimateSceneCountFromTopic(topic);
  const baseStyle = `Cinematic TikTok background image, vertical mobile composition, professional gradient, vibrant modern colors, high detail, clean aesthetic, no text, no typography, no letters, no words`;
  const normalized = topic.toLowerCase();

  const techTheme = normalized.includes('ai') || normalized.includes('automation') || normalized.includes('creator') || normalized.includes('content') || normalized.includes('tiktok');

  const techScenes = [
    'powerful hook visual, futuristic AI glow, attention-grabbing composition',
    'creator pain point visual, content overload, chaotic manual workflow, stressful social media pressure',
    'AI assistant dashboard, automation pipeline, content planning workflow on screens',
    'scene showing script generation, idea generation, and trend research happening automatically',
    'scene showing image generation, video building, and publishing workflow connected together',
    'successful creator workspace, clean metrics growth, more time freedom, confident atmosphere',
    'community engagement visual, viral reach, comments, shares, audience growth energy',
    'strong ending visual, aspirational creator future, modern success vibe, cinematic closure'
  ];

  const genericScenes = [
    'bold opening visual, emotional hook, dramatic composition',
    'clear problem visualization related to the topic',
    'process visualization showing the first key idea',
    'process visualization showing the next important idea',
    'process visualization showing the practical application',
    'benefit and transformation visualization',
    'result-focused success visual with momentum',
    'final inspiring closing visual suitable for call to action'
  ];

  const sourceScenes = techTheme ? techScenes : genericScenes;

  return sourceScenes.slice(0, plannedCount).map((scene, index) => {
    return `${baseStyle}. Topic: ${topic}. Scene ${index + 1}/${plannedCount}: ${scene}. Modern trendy aesthetic suitable for TikTok.`;
  });
}
