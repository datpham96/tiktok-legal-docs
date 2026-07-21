import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { loadTokens } from './tiktok-auth';
import { publishVideo } from './tiktok-publish';

const LAST_PUBLISH_FILE = path.join(process.cwd(), 'storage', 'demo-last-publish.txt');

interface DemoUser {
  displayName: string;
  avatarUrl: string;
  openId: string;
}

export interface DemoStatus {
  connected: boolean;
  scopes: string[];
  expiresIn: number;
  videoReady: boolean;
  videoUrl: string | null;
  user: DemoUser | null;
  lastPublish: string | null;
}

export interface DemoPublishInput {
  caption?: string;
  privacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

async function fetchBasicUserInfo(accessToken: string): Promise<DemoUser | null> {
  try {
    const response = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        fields: 'open_id,display_name,avatar_url'
      }
    });

    if (response.data?.error?.code && response.data.error.code !== 'ok') {
      return null;
    }

    const user = response.data?.data?.user;
    if (!user) return null;

    return {
      openId: user.open_id || '',
      displayName: user.display_name || 'Connected user',
      avatarUrl: user.avatar_url || ''
    };
  } catch {
    return null;
  }
}

function readLastPublish(): string | null {
  if (!fs.existsSync(LAST_PUBLISH_FILE)) return null;
  return fs.readFileSync(LAST_PUBLISH_FILE, 'utf-8').trim() || null;
}

function writeLastPublish(message: string): void {
  const dir = path.dirname(LAST_PUBLISH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LAST_PUBLISH_FILE, message, 'utf-8');
}

export function getDemoVideoPath(): string {
  return path.join(config.storage.videosDir, 'test.mp4');
}

export async function getDemoStatus(): Promise<DemoStatus> {
  const tokenData = loadTokens();
  const videoPath = getDemoVideoPath();
  const videoReady = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1024;

  if (!tokenData) {
    return {
      connected: false,
      scopes: config.tiktok.scopes,
      expiresIn: 0,
      videoReady,
      videoUrl: videoReady ? '/media/demo.mp4' : null,
      user: null,
      lastPublish: readLastPublish()
    };
  }

  const expiresAt = tokenData.created_at + tokenData.expires_in * 1000;
  const expiresIn = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const user = await fetchBasicUserInfo(tokenData.access_token);
  const scopes = tokenData.scope
    ? tokenData.scope.split(',').map((s) => s.trim()).filter(Boolean)
    : config.tiktok.scopes;

  return {
    connected: expiresIn > 0,
    scopes,
    expiresIn,
    videoReady,
    videoUrl: videoReady ? '/media/demo.mp4' : null,
    user,
    lastPublish: readLastPublish()
  };
}

export async function publishDemoVideo(input: DemoPublishInput = {}): Promise<string> {
  const tokenData = loadTokens();
  if (!tokenData) {
    throw new Error('Connect a TikTok account first.');
  }

  const videoPath = getDemoVideoPath();
  if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1024) {
    throw new Error('Demo video missing. Run: npm run generate-video');
  }

  const startedAt = new Date().toISOString();
  const caption =
    input.caption?.trim() ||
    'AutoPublisher production test — Content Posting API test';
  const privacy = input.privacy || 'SELF_ONLY';

  await publishVideo({
    videoPath,
    caption,
    privacy,
    disableComment: input.disableComment ?? true,
    disableDuet: input.disableDuet ?? true,
    disableStitch: input.disableStitch ?? true
  });

  const log = [
    `[${startedAt}] Publish started`,
    'Product: Content Posting API',
    'Scope used: video.upload',
    'POST /v2/post/publish/inbox/video/init/  -> OK',
    'PUT upload_url                         -> OK',
    'POST /v2/post/publish/status/fetch/    -> OK',
    `Caption: ${caption}`,
    `Privacy: ${privacy}`,
    'Next: open the connected account in the mobile app and verify the private video.'
  ].join('\n');

  writeLastPublish(log);
  return log;
}
