import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getValidTokens } from './tiktok-auth';
import { bakeCoverIntoVideo } from './video-cover';
import { pickBgm, muxBackgroundMusic, muxSilentAudio, videoHasAudio } from './video-music';

// TODO: Verify these endpoints with current TikTok Content Posting API docs
// API version and endpoints may change - check https://developers.tiktok.com/doc/content-posting-api-get-started
const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const API_VERSION = 'v2';

export type PrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'FOLLOWER_OF_CREATOR'
  | 'SELF_ONLY';

interface PublishOptions {
  videoPath: string;
  caption: string;
  privacy: PrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
  isAigc?: boolean;
  /** When true, TikTok auto-picks suggested/recommended music for the post. */
  autoAddMusic?: boolean;
  /** Optional custom cover image. Baked as first video frame (API has no cover upload). */
  coverPath?: string;
  /** Frame used as cover when no custom coverPath is provided. */
  coverTimestampMs?: number;
  /**
   * Mux looping BGM into silent videos before upload.
   * Defaults to true for Direct Post. Set false when the creator will add
   * TikTok music in the app (inbox / MEDIA_UPLOAD).
   */
  muxBgm?: boolean;
  /**
   * Send to TikTok inbox instead of Direct Post so the creator can pick
   * a trending sound and tap Publish in the app.
   */
  toInbox?: boolean;
  /** Cover + silent audio already baked; skip ffmpeg on the server. */
  skipMediaPrep?: boolean;
  /** Optional path to BGM file; defaults to rotating pick from assets/bgm/. */
  musicPath?: string;
  /** Used to rotate BGM with less repetition. */
  postId?: string;
  topic?: string;
  onProgress?: (stage: 'uploading' | 'publishing' | 'processing', detail?: string) => void;
}

export interface CreatorInfo {
  creatorAvatarUrl: string;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

interface CreatorInfoResponse {
  data: {
    creator_avatar_url: string;
    creator_username: string;
    creator_nickname: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// Required by TikTok UX guidelines: query the latest creator info every time
// the "Post to TikTok" page is rendered.
export async function queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  const response = await axios.post<CreatorInfoResponse>(
    `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/creator_info/query/`,
    {},
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.error && response.data.error.code !== 'ok') {
    throw new Error(`creator_info error: ${response.data.error.code}`);
  }

  const data = response.data.data;
  if (!data) {
    throw new Error('creator_info error: empty response');
  }

  return {
    creatorAvatarUrl: data.creator_avatar_url || '',
    creatorUsername: data.creator_username || '',
    creatorNickname: data.creator_nickname || '',
    privacyLevelOptions: data.privacy_level_options || [],
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxVideoPostDurationSec: data.max_video_post_duration_sec || 0
  };
}

interface InitUploadResponse {
  data: {
    publish_id: string;
    upload_url: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface StatusFetchResponse {
  data: {
    status: string;
    fail_reason?: string;
    publicaly_available_post_id?: string[];
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface PublishStatusEvent {
  attempt: number;
  status: string;
  at: string;
}

export interface PublishResult {
  publishId: string;
  status: string;
  failReason?: string;
  /** TikTok public post IDs when status is PUBLISH_COMPLETE (confirms public visibility). */
  publicPostIds?: string[];
  statusHistory: PublishStatusEvent[];
  message: string;
}

/** Pick a privacy level allowed by creator_info (TikTok UX requirement). */
export function resolvePrivacyLevel(
  options: string[],
  preferred: PrivacyLevel = 'PUBLIC_TO_EVERYONE'
): PrivacyLevel {
  const allowed = new Set(options);
  if (allowed.has(preferred)) {
    return preferred;
  }
  const fallbacks: PrivacyLevel[] = [
    'PUBLIC_TO_EVERYONE',
    'FOLLOWER_OF_CREATOR',
    'MUTUAL_FOLLOW_FRIENDS',
    'SELF_ONLY'
  ];
  for (const level of fallbacks) {
    if (allowed.has(level)) {
      return level;
    }
  }
  throw new Error(`No allowed privacy level in creator_info: ${options.join(', ') || '(empty)'}`);
}

// Status values returned by /v2/post/publish/status/fetch/
const STATUS_PROCESSING = ['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD'];
const STATUS_INBOX = 'SEND_TO_USER_INBOX';
const STATUS_COMPLETE = 'PUBLISH_COMPLETE';
const STATUS_FAILED = 'FAILED';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // ~2 minutes

const INBOX_MESSAGE =
  'Video uploaded and sent to TikTok inbox. Open TikTok mobile app to complete/review the post.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishVideo(options: PublishOptions): Promise<PublishResult> {
  console.log('\n🚀 Starting TikTok video publish flow...');
  console.log(`   Video: ${options.videoPath}`);
  console.log(`   Caption: ${options.caption}`);
  console.log(`   Privacy: ${options.privacy}`);
  console.log(`   Mode: ${options.toInbox ? 'INBOX (add music in TikTok app)' : 'DIRECT_POST'}`);
  console.log(`   Mux BGM: ${options.muxBgm !== false && !options.toInbox ? 'on' : 'off'}`);

  const tokenData = await getValidTokens();
  if (!tokenData) {
    throw new Error('No valid access token found. Please run OAuth flow first: npm run dev');
  }

  const accessToken = tokenData.access_token;
  let uploadVideoPath = options.videoPath;
  let coverTimestampMs = options.coverTimestampMs ?? 1000;
  let tempCoverDir: string | undefined;
  let tempMusicPath: string | undefined;

  try {
    if (!options.skipMediaPrep) {
      if (options.coverPath && fs.existsSync(options.coverPath)) {
        console.log('\n🖼️  Baking cover.png (~1.5s + keyframes) for TikTok profile thumbnail...');
        const baked = await bakeCoverIntoVideo(options.videoPath, options.coverPath);
        uploadVideoPath = baked.videoPath;
        coverTimestampMs = baked.coverTimestampMs;
        tempCoverDir = baked.tempPath;
        console.log(`   Using cover.png → video_cover_timestamp_ms=${coverTimestampMs}`);
      }

      const shouldMuxBgm = options.muxBgm !== false && !options.toInbox;
      if (shouldMuxBgm) {
        const alreadyHasAudio = await videoHasAudio(uploadVideoPath);
        if (alreadyHasAudio) {
          console.log('\n🎵 Video already has audio — skipping BGM mux');
        } else {
          console.log('\n🎵 Muxing background music (slideshow has no audio track)...');
          let musicPath = options.musicPath;
          let musicName = musicPath ? path.basename(musicPath) : '';
          if (!musicPath) {
            const picked = await pickBgm({
              postId: options.postId,
              topic: options.topic || options.caption.slice(0, 80)
            });
            musicPath = picked.path;
            musicName = picked.name;
          }
          tempMusicPath = await muxBackgroundMusic(uploadVideoPath, musicPath);
          uploadVideoPath = tempMusicPath;
          console.log(`   BGM: ${musicName} (${musicPath})`);
        }
      } else if (!(await videoHasAudio(uploadVideoPath))) {
        console.log('\n🔇 No music — adding silent audio so TikTok accepts the file');
        tempMusicPath = await muxSilentAudio(uploadVideoPath);
        uploadVideoPath = tempMusicPath;
      }
    } else {
      console.log('\n📌 skipMediaPrep — using pre-baked video (cover + audio already in file)');
    }

    // Step 1: Initialize upload
    console.log('\n📤 Step 1: Initialize upload...');
    options.onProgress?.('uploading');
    const initResponse = await initializeUpload(accessToken, {
      ...options,
      videoPath: uploadVideoPath,
      coverTimestampMs,
      // auto_add_music is ignored for video Direct Post; keep false to avoid confusion
      autoAddMusic: false
    });

    const { publish_id, upload_url } = initResponse.data;
    console.log(`✅ Upload initialized`);
    console.log(`   Publish ID: ${publish_id}`);

    // Step 2: Upload video file
    console.log('\n📹 Step 2: Uploading video file...');
    options.onProgress?.('publishing', publish_id);
    await uploadVideoFile(upload_url, uploadVideoPath);
    console.log('✅ Video uploaded successfully');
    options.onProgress?.('processing', publish_id);

    // Step 3: Poll publish status until it reaches a terminal state.
    console.log('\n⏳ Step 3: Polling publish status...');
    const result = await pollPublishStatus(accessToken, publish_id);

    if (result.status === STATUS_FAILED) {
      throw new Error(
        `TikTok publish FAILED (publish_id=${result.publishId}${result.failReason ? `, reason=${result.failReason}` : ''})`
      );
    }

    console.log(`\n🎉 ${result.message}`);
    return result;

  } catch (error: any) {
    console.error('\n❌ Publish failed:', error.message);

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));

      handlePublishError(error.response);

      // Surface TikTok's error code to the caller — axios' own message is only
      // "Request failed with status code 4xx", which callers can't map to
      // anything an end user can act on.
      const apiCode = error.response.data?.error?.code;
      if (apiCode) {
        throw new Error(`TikTok API error: ${apiCode}`);
      }
    }

    throw error;
  } finally {
    if (tempCoverDir && fs.existsSync(tempCoverDir)) {
      fs.rmSync(tempCoverDir, { recursive: true, force: true });
    }
    if (tempMusicPath && fs.existsSync(tempMusicPath)) {
      fs.unlinkSync(tempMusicPath);
    }
  }
}

export interface PhotoPublishOptions {
  photoUrls: string[];
  caption: string;
  privacy: PrivacyLevel;
  disableComment?: boolean;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
  isAigc?: boolean;
  /** TikTok only supports auto suggested music on PHOTO Direct Post. */
  autoAddMusic?: boolean;
  coverIndex?: number;
  onProgress?: (stage: 'uploading' | 'publishing' | 'processing', detail?: string) => void;
}

/**
 * Photo Direct Post — the only Content Posting path where TikTok can
 * auto-select recommended music (`auto_add_music: true`).
 * Requires publicly reachable image URLs on a verified domain.
 */
export async function publishPhotoPost(options: PhotoPublishOptions): Promise<PublishResult> {
  console.log('\n🚀 Starting TikTok PHOTO publish flow (auto music supported)...');
  console.log(`   Photos: ${options.photoUrls.length}`);
  console.log(`   Privacy: ${options.privacy}`);
  console.log(`   Auto music: ${options.autoAddMusic !== false ? 'on' : 'off'}`);

  const tokenData = await getValidTokens();
  if (!tokenData) {
    throw new Error('No valid access token found. Please run OAuth flow first.');
  }

  if (!options.photoUrls.length) {
    throw new Error('At least one photo URL is required');
  }

  const accessToken = tokenData.access_token;
  const creator = await queryCreatorInfo(accessToken);
  const privacy = resolvePrivacyLevel(creator.privacyLevelOptions, options.privacy);
  if (privacy !== options.privacy) {
    console.warn(
      `⚠️ Privacy ${options.privacy} not in creator options — using ${privacy} (${creator.privacyLevelOptions.join(', ')})`
    );
  } else {
    console.log(`   Creator @${creator.creatorUsername} — privacy options: ${creator.privacyLevelOptions.join(', ')}`);
  }

  const lines = options.caption.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || 'AutoPublisher').slice(0, 90);
  const description = options.caption.trim().slice(0, 4000);

  try {
    options.onProgress?.('uploading');
    console.log('\n📤 Step 1: Initialize photo Direct Post...');
    const response = await axios.post(
      `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/content/init/`,
      {
        media_type: 'PHOTO',
        post_mode: 'DIRECT_POST',
        post_info: {
          title,
          description,
          privacy_level: privacy,
          disable_comment: options.disableComment || false,
          auto_add_music: options.autoAddMusic !== false,
          brand_content_toggle: options.brandContentToggle || false,
          brand_organic_toggle: options.brandOrganicToggle || false,
          ...(options.isAigc ? { is_aigc: true } : {})
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: options.coverIndex ?? 0,
          photo_images: options.photoUrls
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );

    if (response.data.error && response.data.error.code !== 'ok') {
      throw new Error(
        `Photo init error: ${response.data.error.code} - ${response.data.error.message}`
      );
    }

    const publishId = response.data.data?.publish_id;
    if (!publishId) {
      throw new Error(`Photo init missing publish_id: ${JSON.stringify(response.data)}`);
    }

    console.log(`✅ Photo post initialized`);
    console.log(`   Publish ID: ${publishId}`);
    options.onProgress?.('processing', publishId);

    console.log('\n⏳ Step 2: Polling publish status...');
    const result = await pollPublishStatus(accessToken, publishId);
    if (result.status === STATUS_FAILED) {
      throw new Error(
        `TikTok photo publish FAILED (publish_id=${result.publishId}${result.failReason ? `, reason=${result.failReason}` : ''})`
      );
    }

    console.log(`\n🎉 ${result.message}`);
    return result;
  } catch (error: any) {
    console.error('\n❌ Photo publish failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      handlePublishError(error.response);
      const apiCode = error.response.data?.error?.code;
      if (apiCode) {
        throw new Error(`TikTok API error: ${apiCode}`);
      }
    }
    throw error;
  }
}

async function initializeUpload(
  accessToken: string,
  options: PublishOptions
): Promise<InitUploadResponse> {
  const stats = fs.statSync(options.videoPath);
  const fileSizeBytes = stats.size;
  const sourceInfo = {
    source: 'FILE_UPLOAD',
    video_size: fileSizeBytes,
    chunk_size: fileSizeBytes,
    total_chunk_count: 1
  };

  if (options.toInbox) {
    console.log('   Endpoint: /post/publish/inbox/video/init/ (add music in TikTok app)');
    const title = options.caption.trim().slice(0, 2200);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    };
    const sourceOnly = { source_info: sourceInfo };
    const withTitle = {
      post_info: {
        title,
        video_cover_timestamp_ms: options.coverTimestampMs ?? 1000
      },
      source_info: sourceInfo
    };

    let response;
    try {
      response = await axios.post<InitUploadResponse>(
        `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/inbox/video/init/`,
        withTitle,
        { headers }
      );
      if (response.data.error && response.data.error.code !== 'ok') {
        throw new Error(response.data.error.code);
      }
    } catch (err: any) {
      console.warn(
        `   Inbox init with title failed (${err.response?.data?.error?.code || err.message}) — retrying source_info only`
      );
      response = await axios.post<InitUploadResponse>(
        `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/inbox/video/init/`,
        sourceOnly,
        { headers }
      );
    }

    if (response.data.error && response.data.error.code !== 'ok') {
      throw new Error(`Inbox init error: ${response.data.error.code} - ${response.data.error.message}`);
    }
    if (!response.data.data?.publish_id || !response.data.data?.upload_url) {
      throw new Error(`Inbox init missing publish_id/upload_url: ${JSON.stringify(response.data)}`);
    }
    return response.data;
  }

  // Direct Post (scope video.publish). The inbox endpoint accepts only
  // source_info, so the post settings the user picks in the UI — caption,
  // privacy, interaction and commercial disclosure — can only be honoured here.
  const response = await axios.post<InitUploadResponse>(
    `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/video/init/`,
    {
      post_info: {
        title: options.caption,
        privacy_level: options.privacy,
        disable_comment: options.disableComment || false,
        disable_duet: options.disableDuet || false,
        disable_stitch: options.disableStitch || false,
        brand_content_toggle: options.brandContentToggle || false,
        brand_organic_toggle: options.brandOrganicToggle || false,
        is_aigc: options.isAigc || false,
        auto_add_music: options.autoAddMusic === true,
        video_cover_timestamp_ms: options.coverTimestampMs ?? 1000
      },
      source_info: sourceInfo
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.error && response.data.error.code !== 'ok') {
    throw new Error(`Init upload error: ${response.data.error.code} - ${response.data.error.message}`);
  }

  if (!response.data.data?.publish_id || !response.data.data?.upload_url) {
    throw new Error(`Init upload response missing publish_id/upload_url: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

async function uploadVideoFile(uploadUrl: string, videoPath: string): Promise<void> {
  const videoBuffer = fs.readFileSync(videoPath);

  await axios.put(uploadUrl, videoBuffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': videoBuffer.length.toString(),
      'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
}

async function fetchPublishStatus(
  accessToken: string,
  publishId: string
): Promise<StatusFetchResponse['data']> {
  const response = await axios.post<StatusFetchResponse>(
    `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/status/fetch/`,
    {
      publish_id: publishId
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.error && response.data.error.code !== 'ok') {
    throw new Error(`Status fetch error: ${response.data.error.code} - ${response.data.error.message}`);
  }

  return response.data.data || { status: 'UNKNOWN' };
}

async function pollPublishStatus(
  accessToken: string,
  publishId: string
): Promise<PublishResult> {
  const statusHistory: PublishStatusEvent[] = [];
  let lastStatus = 'UNKNOWN';
  let failReason: string | undefined;

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    const data = await fetchPublishStatus(accessToken, publishId);
    lastStatus = data.status || 'UNKNOWN';
    failReason = data.fail_reason;

    statusHistory.push({
      attempt,
      status: lastStatus,
      at: new Date().toISOString()
    });
    console.log(`   Poll #${attempt}: publish_id=${publishId} status=${lastStatus}`);

    if (lastStatus === STATUS_COMPLETE) {
      const publicPostIds = data.publicaly_available_post_id?.filter(Boolean);
      if (publicPostIds?.length) {
        console.log(`   ✅ Public post ID(s): ${publicPostIds.join(', ')}`);
      } else {
        console.warn('   ⚠️ PUBLISH_COMPLETE but no publicaly_available_post_id — check TikTok app visibility');
      }
      return {
        publishId,
        status: lastStatus,
        publicPostIds,
        statusHistory,
        message: publicPostIds?.length
          ? `Published publicly (PUBLISH_COMPLETE). TikTok post ID: ${publicPostIds[0]}`
          : 'Published (PUBLISH_COMPLETE) — public post ID not returned yet.'
      };
    }

    if (lastStatus === STATUS_INBOX) {
      return {
        publishId,
        status: lastStatus,
        statusHistory,
        message: INBOX_MESSAGE
      };
    }

    if (lastStatus === STATUS_FAILED) {
      return {
        publishId,
        status: lastStatus,
        failReason,
        statusHistory,
        message: `Publish failed${failReason ? `: ${failReason}` : ''}`
      };
    }

    if (!STATUS_PROCESSING.includes(lastStatus)) {
      console.warn(`   ⚠️ Unrecognized status "${lastStatus}" — continuing to poll.`);
    }

    if (attempt < POLL_MAX_ATTEMPTS) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // Timed out while still processing — do NOT claim success.
  return {
    publishId,
    status: lastStatus,
    failReason,
    statusHistory,
    message: `Upload accepted but still ${lastStatus} after ${POLL_MAX_ATTEMPTS} status checks. It is NOT confirmed published — re-check status later with publish_id ${publishId}.`
  };
}

function handlePublishError(response: any): void {
  const status = response.status;
  const data = response.data;

  console.error('\n💡 Troubleshooting tips:');

  if (status === 401) {
    console.error('   ❌ Unauthorized - Access token may be invalid or expired');
    console.error('   → Run OAuth flow again: npm run dev');
  } else if (status === 403) {
    console.error('   ❌ Forbidden - Permission issue');
    console.error('   → Check if your app has required scopes: video.publish, video.upload');
    console.error('   → Verify app is approved in TikTok Developer Portal');
    console.error('   → Check if redirect URI matches exactly');
  } else if (status === 400) {
    console.error('   ❌ Bad Request - Invalid parameters');
    console.error('   → Check video format (MP4, H.264)');
    console.error('   → Check video size limits');
    console.error('   → Verify caption length');
  }

  if (data?.error?.code === 'access_denied') {
    console.error('   → Your TikTok app may need to be approved for production');
    console.error('   → Check if you are in sandbox/test mode');
  }
}
