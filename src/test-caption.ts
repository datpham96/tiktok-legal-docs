import { generateCaption } from './router9';
import { validateEnv } from './config';

validateEnv(['ROUTER9_API_KEY']);

async function testCaption() {
  console.log('🧪 Testing caption generation with 9router...\n');
  
  const topics = [
    'AI Content Agent auto publishing test',
    'TikTok automation with Node.js',
    'Building viral content with AI'
  ];

  for (const topic of topics) {
    console.log(`📝 Topic: "${topic}"`);
    try {
      const caption = await generateCaption(topic);
      console.log(`✅ Caption: ${caption}\n`);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}\n`);
    }
  }
}

testCaption().catch(console.error);
