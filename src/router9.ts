import axios from 'axios';
import { config } from './config';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface Router9Response {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

const FALLBACK_CAPTION = 'Test auto publish video bằng AI Content Agent 🚀 #AI #TikTok #Automation';

function sanitizeCaption(raw: string): string {
  return raw
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking>[\s\S]*/gi, '')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/m, '')
    .trim();
}

export async function generateCaption(topic: string): Promise<string> {
  try {
    console.log(`🤖 Generating caption for topic: "${topic}"`);
    console.log(`   Using 9router: ${config.router9.provider}/${config.router9.model}`);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Bạn là chuyên gia viết caption TikTok bằng tiếng Việt. Ngắn gọn, có hook, có hashtag phù hợp creator mới tìm hiểu AI.'
      },
      {
        role: 'user',
        content: `Viết caption TikTok bằng TIẾNG VIỆT cho video về: "${topic}". Tối đa 150 từ, có 3-5 hashtag.`
      }
    ];

    const response = await axios.post<Router9Response>(
      `${config.router9.baseUrl}/v1/chat/completions`,
      {
        model: config.router9.model,
        provider: config.router9.provider,
        messages,
        max_tokens: 300,
        temperature: 0.8,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.router9.apiKey}`
        },
        timeout: 30000
      }
    );

    const caption = sanitizeCaption(response.data.choices[0]?.message?.content || '');

    if (!caption) {
      console.warn('⚠️  9router returned empty caption, using fallback');
      return FALLBACK_CAPTION;
    }

    console.log(`✅ Generated caption: ${caption}`);
    return caption;

  } catch (error: any) {
    console.error('❌ 9router error:', error.message);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log(`💡 Using fallback caption`);
    return FALLBACK_CAPTION;
  }
}
