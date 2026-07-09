import axios from 'axios';
import fs from 'fs';
import { config } from './config';

export interface ScenePlan {
  title: string;
  body: string;
  image_prompt: string;
}

export interface VideoScript {
  topic: string;
  scenes: ScenePlan[];
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in scene plan response');
  return JSON.parse(match[0]);
}

export async function planVideoScenes(topic: string, sceneCount?: number): Promise<VideoScript> {
  const targetScenes = sceneCount ?? 5;

  const prompt = `Bạn là chuyên gia viết kịch bản TikTok giáo dục bằng TIẾNG VIỆT cho creator mới tìm hiểu AI.

Chủ đề: "${topic}"

Viết kịch bản slideshow ${targetScenes} scene. Mỗi scene PHẢI có nội dung cụ thể, dễ hiểu, có giá trị thực tế.

Trả về JSON:
{
  "scenes": [
    {
      "title": "Tiêu đề ngắn gọn (tối đa 8 từ)",
      "body": "2-3 câu giải thích cụ thể, nói rõ vấn đề + cách làm + lợi ích. Tối thiểu 25 từ, tối đa 55 từ. Viết tự nhiên, không hô hồng.",
      "image_prompt": "English visual description for background image, cinematic, modern, related to this scene, no text, no letters, no words"
    }
  ]
}

Yêu cầu:
- Scene 1: hook + giới thiệu vấn đề
- Scene giữa: từng ý/bước/sai lầm cụ thể, có ví dụ thực tế
- Scene cuối: tóm tắt + CTA follow
- KHÔNG viết title chung chung kiểu "BƯỚC 1" mà không giải thích
- body phải đủ thông tin để người xem hiểu ngay cả khi không nghe audio
- image_prompt phải bám sát nội dung scene đó
- CHỈ trả JSON hợp lệ`;

  const response = await axios.post(
    `${config.router9.baseUrl}/v1/chat/completions`,
    {
      model: config.router9.model,
      provider: config.router9.provider,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2500,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.router9.apiKey}`,
      },
      timeout: 60000,
    }
  );

  const content = response.data.choices?.[0]?.message?.content || '';
  const parsed = extractJson(content);

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('Invalid scene plan from AI');
  }

  const scenes: ScenePlan[] = parsed.scenes.slice(0, targetScenes).map((scene: any, index: number) => ({
    title: String(scene.title || `Scene ${index + 1}`).trim(),
    body: String(scene.body || '').trim(),
    image_prompt: String(scene.image_prompt || `modern creator workspace scene ${index + 1}, no text`).trim(),
  }));

  scenes.forEach((scene, index) => {
    if (!scene.body || scene.body.length < 20) {
      throw new Error(`Scene ${index + 1} body is too short or empty`);
    }
  });

  return { topic, scenes };
}

export function saveVideoScript(script: VideoScript, filePath: string): void {
  fs.writeFileSync(filePath, `${JSON.stringify(script, null, 2)}\n`, 'utf8');
}

export function loadVideoScript(filePath: string): VideoScript {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as VideoScript;
}
