import axios from 'axios';
import fs from 'fs';
import { loadTokens } from './tiktok-auth';

// TODO: Verify these endpoints with current TikTok Content Posting API docs
// API version and endpoints may change - check https://developers.tiktok.com/doc/content-posting-api-get-started
const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const API_VERSION = 'v2';

interface PublishOptions {
  videoPath: string;
  caption: string;
  privacy: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
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

interface PublishVideoResponse {
  data: {
    publish_id: string;
    status: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export async function publishVideo(options: PublishOptions): Promise<void> {
  console.log('\n🚀 Starting TikTok video publish flow...');
  console.log(`   Video: ${options.videoPath}`);
  console.log(`   Caption: ${options.caption}`);
  console.log(`   Privacy: ${options.privacy}`);

  // Load access token
  const tokenData = loadTokens();
  if (!tokenData) {
    throw new Error('No valid access token found. Please run OAuth flow first: npm run dev');
  }

  const accessToken = tokenData.access_token;

  try {
    // Step 1: Initialize upload (Direct Post)
    console.log('\n📤 Step 1: Initialize upload...');
    const initResponse = await initializeUpload(accessToken, options);
    
    const { publish_id, upload_url } = initResponse.data;
    console.log(`✅ Upload initialized`);
    console.log(`   Publish ID: ${publish_id}`);

    // Step 2: Upload video file
    console.log('\n📹 Step 2: Uploading video file...');
    await uploadVideoFile(upload_url, options.videoPath);
    console.log('✅ Video uploaded successfully');

    // Step 3: Publish/Complete the post
    console.log('\n✨ Step 3: Publishing video...');
    await completePublish(accessToken, publish_id);
    console.log('✅ Video published successfully!');
    console.log(`\n🎉 Done! Check your TikTok profile (private videos section)`);

  } catch (error: any) {
    console.error('\n❌ Publish failed:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      
      handlePublishError(error.response);
    }

    throw error;
  }
}

async function initializeUpload(
  accessToken: string,
  options: PublishOptions
): Promise<InitUploadResponse> {
  // Get video file size
  const stats = fs.statSync(options.videoPath);
  const fileSizeBytes = stats.size;

  const response = await axios.post<InitUploadResponse>(
    `${TIKTOK_API_BASE}/${API_VERSION}/post/publish/inbox/video/init/`,
    {
      post_info: {
        title: options.caption,
        privacy_level: options.privacy,
        disable_comment: options.disableComment || false,
        disable_duet: options.disableDuet || false,
        disable_stitch: options.disableStitch || false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSizeBytes,
        chunk_size: fileSizeBytes,
        total_chunk_count: 1
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.error) {
    throw new Error(`Init upload error: ${response.data.error.code} - ${response.data.error.message}`);
  }

  return response.data;
}

async function uploadVideoFile(uploadUrl: string, videoPath: string): Promise<void> {
  const videoBuffer = fs.readFileSync(videoPath);

  await axios.put(uploadUrl, videoBuffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': videoBuffer.length.toString()
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
}

async function completePublish(
  accessToken: string,
  publishId: string
): Promise<void> {
  const response = await axios.post<PublishVideoResponse>(
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

  if (response.data.error) {
    throw new Error(`Publish error: ${response.data.error.code} - ${response.data.error.message}`);
  }

  console.log('   Status:', response.data.data.status);
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
