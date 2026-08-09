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

const REQUIRED_HASHTAG = '#TikTokTips';
const FALLBACK_CAPTION = `Test auto publish photo bằng AI Content Agent 🚀 #AI #TikTok #Automation ${REQUIRED_HASHTAG}`;

function sanitizeCaption(raw: string): string {
  return raw
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking>[\s\S]*/gi, '')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/m, '')
    .trim();
}

/** Always keep exact #TikTokTips in caption (normalize case / append if missing). */
export function ensureTikTokTipsHashtag(caption: string): string {
  let text = caption.trim();
  if (!text) return `${REQUIRED_HASHTAG}`;

  // Normalize any #tiktoktips / #TiktokTips variants to exact casing
  text = text.replace(/#tiktoktips\b/gi, REQUIRED_HASHTAG);

  if (new RegExp(`${REQUIRED_HASHTAG}\\b`).test(text)) {
    return text;
  }

  // Prefer inserting into an existing trailing hashtag line
  const lines = text.split('\n');
  let lastHashIdx = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/#\w/.test(lines[i])) {
      lastHashIdx = i;
      break;
    }
  }

  if (lastHashIdx >= 0) {
    lines[lastHashIdx] = `${REQUIRED_HASHTAG} ${lines[lastHashIdx].trim()}`.replace(/\s+/g, ' ');
    return lines.join('\n').trim();
  }

  return `${text}\n\n${REQUIRED_HASHTAG}`.trim();
}

export async function generateCaption(topic: string): Promise<string> {
  try {
    console.log(`🤖 Generating caption for topic: "${topic}"`);
    console.log(`   Using 9router: ${config.router9.provider}/${config.router9.model}`);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'Bạn là chuyên gia viết caption TikTok bằng tiếng Việt. Ngắn gọn, có hook, có hashtag phù hợp creator mới tìm hiểu AI. BẮT BUỘC luôn có hashtag #TikTokTips.'
      },
      {
        role: 'user',
        content: `Viết caption TikTok bằng TIẾNG VIỆT cho photo/video về: "${topic}". Tối đa 150 từ, có 3-5 hashtag, trong đó BẮT BUỘC có #TikTokTips.`
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

    const caption = ensureTikTokTipsHashtag(
      sanitizeCaption(response.data.choices[0]?.message?.content || '')
    );

    if (!caption || caption === REQUIRED_HASHTAG) {
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
