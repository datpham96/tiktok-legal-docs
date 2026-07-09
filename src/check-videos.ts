import axios from 'axios';
import { loadTokens } from './tiktok-auth';

async function checkVideos() {
  try {
    const tokens = await loadTokens();
    if (!tokens) {
      console.error('❌ No access token found. Please authenticate first.');
      return;
    }

    console.log('🔍 Fetching your TikTok videos...\n');

    // Get video list
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/video/list/',
      {
        max_count: 20
      },
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );

    if (response.data.error && response.data.error.code !== 'ok') {
      console.error('❌ Error:', response.data.error.message);
      return;
    }

    const videos = response.data.data?.videos || [];
    
    console.log(`📹 Found ${videos.length} videos:\n`);
    
    videos.forEach((video: any, index: number) => {
      console.log(`${index + 1}. Video ID: ${video.id}`);
      console.log(`   Title: ${video.title || 'No title'}`);
      console.log(`   Status: ${video.video_status || 'unknown'}`);
      console.log(`   Privacy: ${video.privacy_level || 'unknown'}`);
      console.log(`   Duration: ${video.duration}s`);
      console.log();
    });

    if (videos.length === 0) {
      console.log('ℹ️  No videos found. This could mean:');
      console.log('   - Videos are still processing');
      console.log('   - Using sandbox credentials (test mode)');
      console.log('   - Wrong account authenticated');
    }

  } catch (error: any) {
    console.error('❌ Failed to fetch videos:', error.message);
    if (error.response?.data) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkVideos();
