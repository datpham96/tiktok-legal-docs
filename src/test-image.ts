import axios from 'axios';
import fs from 'fs';
import { config, validateEnv } from './config';

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

async function testImageGeneration() {
  validateEnv(['ROUTER9_API_KEY']);

  console.log('🧪 Testing 9router Image Generation\n');
  console.log('   Endpoint:', `${config.router9.baseUrl}/v1/images/generations`);
  console.log('   Model: cx/gpt-5.5-image');
  console.log('   Prompt: "A cute cat wearing a hat"\n');

  try {
    const response = await axios.post(
      `${config.router9.baseUrl}/v1/images/generations`,
      {
        model: 'cx/gpt-5.5-image',
        prompt: 'A cute cat wearing a hat',
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

    console.log('✅ Raw response received');
    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    console.log(raw.slice(0, 1000));

    const events = extractJsonObjectsFromSse(raw);
    console.log(`\n📦 Parsed ${events.length} event(s)`);

    let imageUrl: string | null = null;
    for (const event of events) {
      imageUrl = extractImageUrl(event) || imageUrl;
    }

    if (!imageUrl) {
      const direct = extractImageUrl(response.data);
      imageUrl = direct || null;
    }

    if (!imageUrl) {
      console.error('\n❌ Could not extract image URL from response');
      process.exit(1);
    }

    console.log('\n📥 Downloading image from:', imageUrl);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 60000
    });

    const outputPath = 'test-image.png';
    fs.writeFileSync(outputPath, imageResponse.data);
    console.log('✅ Image saved:', outputPath);
  } catch (error: any) {
    console.error('❌ Failed:', error.message);
    if (error.response) {
      console.error('\nStatus:', error.response.status);
      console.error('Response:', typeof error.response.data === 'string' ? error.response.data.slice(0, 2000) : JSON.stringify(error.response.data, null, 2));
    }
  }
}

testImageGeneration();
