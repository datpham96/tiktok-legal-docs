import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { getValidTokens } from './tiktok-auth';
import {
  publishVideo,
  queryCreatorInfo,
  CreatorInfo,
  PublishResult,
  PrivacyLevel
} from './tiktok-publish';

const LAST_PUBLISH_FILE = path.join(process.cwd(), 'storage', 'demo-last-publish.txt');
const LAST_PUBLISH_STATUS_FILE = path.join(process.cwd(), 'storage', 'demo-last-publish-status.txt');

export const CAPTION_MAX_LENGTH = 2200;

const PRIVACY_VALUES: PrivacyLevel[] = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY'
];

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
  videoFileName: string | null;
  videoSizeBytes: number | null;
  user: DemoUser | null;
  lastPublish: string | null;
  lastPublishStatus: string | null;
  /** false → TikTok restricts Direct Post to SELF_ONLY until the app is approved. */
  appAudited: boolean;
}

export interface DemoPublishInput {
  caption?: string;
  privacy?: string;
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  commercialContent?: boolean;
  yourBrand?: boolean;
  brandedContent?: boolean;
  isAigc?: boolean;
}

export interface DemoPublishResult {
  log: string;
  status: string;
  publishId: string;
  message: string;
  publishedAt: string;
  privacy: string;
  caption: string;
}

export interface PublishProgress {
  active: boolean;
  stage: 'idle' | 'uploading' | 'publishing' | 'processing' | 'done' | 'failed';
  publishId: string | null;
  status: string | null;
  startedAt: string | null;
}

// In-memory progress of the current publish attempt so the UI can show
// Uploading… / Publishing… / Processing… while the publish request is running.
const publishProgress: PublishProgress = {
  active: false,
  stage: 'idle',
  publishId: null,
  status: null,
  startedAt: null
};

export function getPublishProgress(): PublishProgress {
  return { ...publishProgress };
}

// Map TikTok API error codes to messages an end user can act on.
// Raw codes/JSON must never reach the UI.
export function friendlyPublishError(rawMessage: string): string {
  const msg = rawMessage || '';

  if (msg.includes('spam_risk_too_many_posts')) {
    return 'You have reached the daily posting limit for this TikTok account. Please try again tomorrow.';
  }
  if (msg.includes('spam_risk_user_banned_from_posting')) {
    return 'This TikTok account is currently not allowed to post. Please check your account status in the TikTok app.';
  }
  if (msg.includes('reached_active_user_cap')) {
    return 'The posting quota for this app has been reached. Please try again later.';
  }
  if (msg.includes('unaudited_client_can_only_post_to_private_accounts')) {
    return (
      'While this app is pending TikTok review, TikTok only accepts posts to a private ' +
      'TikTok account. Open the TikTok app → Settings and privacy → Privacy → turn on ' +
      '"Private account", then try publishing again.'
    );
  }
  if (msg.includes('url_ownership_unverified') || msg.includes('privacy_level_option_mismatch')) {
    return 'TikTok rejected the selected posting options. Please reload the page and try again.';
  }
  if (msg.includes('access_token') || msg.includes('401') || msg.includes('token')) {
    return 'Your TikTok session has expired. Please reconnect your TikTok account and try again.';
  }
  if (msg.includes('FAILED')) {
    return 'TikTok could not process this video. Please check the video file and try again.';
  }
  return 'Something went wrong while sending your video to TikTok. Please try again.';
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

function readLastPublishStatus(): string | null {
  if (!fs.existsSync(LAST_PUBLISH_STATUS_FILE)) return null;
  return fs.readFileSync(LAST_PUBLISH_STATUS_FILE, 'utf-8').trim() || null;
}

function writeLastPublish(message: string, status: string): void {
  const dir = path.dirname(LAST_PUBLISH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LAST_PUBLISH_FILE, message, 'utf-8');
  fs.writeFileSync(LAST_PUBLISH_STATUS_FILE, status, 'utf-8');
}

export function getDemoVideoPath(): string {
  return path.join(config.storage.videosDir, 'test.mp4');
}

// Replace the pending video with a file uploaded by the user from the studio UI.
export function saveDemoVideo(buffer: Buffer): void {
  if (!buffer || buffer.length < 1024) {
    throw new Error('The selected file is empty or too small to be a video.');
  }

  const videoPath = getDemoVideoPath();
  const dir = path.dirname(videoPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(videoPath, buffer);
}

// Required by TikTok UX guidelines: fetched fresh every time the publish page renders.
export async function getDemoCreatorInfo(): Promise<CreatorInfo> {
  const tokenData = await getValidTokens();
  if (!tokenData) {
    throw new Error('Connect a TikTok account first.');
  }
  return queryCreatorInfo(tokenData.access_token);
}

export async function getDemoStatus(): Promise<DemoStatus> {
  const tokenData = await getValidTokens();
  const videoPath = getDemoVideoPath();
  const videoReady = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1024;
  const videoSizeBytes = videoReady ? fs.statSync(videoPath).size : null;
  const videoFileName = videoReady ? path.basename(videoPath) : null;

  if (!tokenData) {
    return {
      connected: false,
      scopes: config.tiktok.scopes,
      expiresIn: 0,
      videoReady,
      videoUrl: videoReady ? '/media/demo.mp4' : null,
      videoFileName,
      videoSizeBytes,
      user: null,
      lastPublish: readLastPublish(),
      lastPublishStatus: readLastPublishStatus(),
      appAudited: config.tiktok.audited
    };
  }

  const expiresAt = tokenData.created_at + tokenData.expires_in * 1000;
  const expiresIn = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const user = await fetchBasicUserInfo(tokenData.access_token);
  const scopes = tokenData.scope
    ? tokenData.scope.split(',').map((s) => s.trim()).filter(Boolean)
    : config.tiktok.scopes;

  return {
    connected: true,
    scopes,
    expiresIn,
    videoReady,
    videoUrl: videoReady ? '/media/demo.mp4' : null,
    videoFileName,
    videoSizeBytes,
    user,
    lastPublish: readLastPublish(),
    lastPublishStatus: readLastPublishStatus(),
    appAudited: config.tiktok.audited
  };
}

function validatePublishInput(input: DemoPublishInput): {
  caption: string;
  privacy: PrivacyLevel;
} {
  const caption = input.caption?.trim() || '';
  if (!caption) {
    throw new Error('Please enter a caption before publishing.');
  }
  if (caption.length > CAPTION_MAX_LENGTH) {
    throw new Error(`Caption is too long. TikTok allows up to ${CAPTION_MAX_LENGTH} characters.`);
  }

  // TikTok UX requirement: the user must pick privacy manually — no default.
  const privacy = input.privacy as PrivacyLevel | undefined;
  if (!privacy || !PRIVACY_VALUES.includes(privacy)) {
    throw new Error('Please choose who can view this video before publishing.');
  }

  // TikTok UX requirement: with commercial content enabled, at least one of
  // "Your brand" / "Branded content" must be selected.
  if (input.commercialContent && !input.yourBrand && !input.brandedContent) {
    throw new Error(
      'You need to indicate if your content promotes yourself, a third party, or both.'
    );
  }

  // TikTok UX requirement: branded content cannot be private.
  if (input.commercialContent && input.brandedContent && privacy === 'SELF_ONLY') {
    throw new Error("Visibility for branded content can't be set to private.");
  }

  // Until the app passes TikTok review, Direct Post only accepts SELF_ONLY.
  if (!config.tiktok.audited && privacy !== 'SELF_ONLY') {
    throw new Error(
      'While this app is pending TikTok review, videos can only be posted with "Only me" visibility.'
    );
  }

  return { caption, privacy };
}

export async function publishDemoVideo(input: DemoPublishInput = {}): Promise<DemoPublishResult> {
  const tokenData = await getValidTokens();
  if (!tokenData) {
    throw new Error('Connect a TikTok account first.');
  }

  const videoPath = getDemoVideoPath();
  if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1024) {
    throw new Error('No video is ready to publish. Please add a video first.');
  }

  const { caption, privacy } = validatePublishInput(input);
  const startedAt = new Date().toISOString();
  const commercial = Boolean(input.commercialContent);
  const brandOrganicToggle = commercial && Boolean(input.yourBrand);
  const brandContentToggle = commercial && Boolean(input.brandedContent);

  publishProgress.active = true;
  publishProgress.stage = 'uploading';
  publishProgress.publishId = null;
  publishProgress.status = null;
  publishProgress.startedAt = startedAt;

  let result: PublishResult;
  try {
    result = await publishVideo({
      videoPath,
      caption,
      privacy,
      disableComment: !input.allowComment,
      disableDuet: !input.allowDuet,
      disableStitch: !input.allowStitch,
      brandContentToggle,
      brandOrganicToggle,
      isAigc: Boolean(input.isAigc),
      muxBgm: true,
      onProgress: (stage, detail) => {
        publishProgress.stage = stage;
        if (detail) publishProgress.publishId = detail;
      }
    });
  } catch (error: any) {
    publishProgress.active = false;
    publishProgress.stage = 'failed';
    throw new Error(friendlyPublishError(error.message));
  }

  publishProgress.active = false;
  publishProgress.stage = 'done';
  publishProgress.status = result.status;
  publishProgress.publishId = result.publishId;

  // End-user friendly activity trail — no API URLs, no raw payloads.
  const pollLines = result.statusHistory.map(
    (event) => `Status check #${event.attempt}: ${friendlyStatusLabel(event.status)}`
  );

  const log = [
    `[${startedAt}] Publish started`,
    `Publish ID: ${result.publishId}`,
    'Video uploaded to TikTok',
    ...pollLines,
    `Final status: ${friendlyStatusLabel(result.status)}`,
    `Caption: ${caption}`,
    `Privacy: ${friendlyPrivacyLabel(privacy)}`,
    'Auto-added suggested music: on',
    ...(input.isAigc ? ['Labeled as AI-generated content'] : []),
    result.message
  ].join('\n');

  writeLastPublish(log, result.status);

  return {
    log,
    status: result.status,
    publishId: result.publishId,
    message: result.message,
    publishedAt: new Date().toISOString(),
    privacy: friendlyPrivacyLabel(privacy),
    caption
  };
}

export function friendlyStatusLabel(status: string): string {
  switch (status) {
    case 'PROCESSING_UPLOAD':
    case 'PROCESSING_DOWNLOAD':
      return 'Processing…';
    case 'SEND_TO_USER_INBOX':
      return 'Sent to TikTok inbox';
    case 'PUBLISH_COMPLETE':
      return 'Published';
    case 'FAILED':
      return 'Failed';
    default:
      return 'In progress';
  }
}

export function friendlyPrivacyLabel(privacy: string): string {
  switch (privacy) {
    case 'PUBLIC_TO_EVERYONE':
      return 'Everyone';
    case 'MUTUAL_FOLLOW_FRIENDS':
      return 'Friends';
    case 'FOLLOWER_OF_CREATOR':
      return 'Followers';
    case 'SELF_ONLY':
      return 'Only me';
    default:
      return privacy;
  }
}
