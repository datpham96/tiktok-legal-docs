import axios from 'axios';
import { config } from './config';

interface TrendSearchResult {
  trending_topics: string[];
  trending_hashtags: string[];
  insights: string;
  raw_results?: any;
}

/**
 * Search for trending TikTok topics using 9router web search
 */
export async function searchTrendingTopics(): Promise<TrendSearchResult> {
  try {
    console.log('🔍 Searching for trending TikTok topics via 9router...');

    // Search queries to find trending content
    const queries = [
      'TikTok trending hashtags today 2026',
      'TikTok viral content trends Vietnam',
      'AI content creation trending topics'
    ];

    const results: string[] = [];

    // Execute searches
    for (const query of queries) {
      console.log(`   Searching: "${query}"`);
      
      const result = await executeWebSearch(query);
      results.push(result);
    }

    // Parse and analyze results
    const analysis = await analyzeSearchResults(results);

    console.log('✅ Trending research completed');
    console.log(`   Found ${analysis.trending_hashtags.length} hashtags`);
    console.log(`   Found ${analysis.trending_topics.length} topics`);

    return analysis;

  } catch (error: any) {
    console.error('❌ Trending search failed:', error.message);
    throw error;
  }
}

/**
 * Execute web search via 9router web search API
 * Based on your curl example:
 * curl -X POST https://ai-router.nexta.vn/v1/search \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer API_KEY" \
 *   -d '{"model":"exa","query":"search query","search_type":"web","max_results":5}'
 */
async function executeWebSearch(query: string): Promise<string> {
  const response = await axios.post(
    `${config.router9.baseUrl}/v1/search`,
    {
      model: 'exa',
      query: query,
      search_type: 'web',
      max_results: 5
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.router9.apiKey}`
      },
      timeout: 30000
    }
  );

  // Parse response format from 9router web search
  // Assuming response has results array
  if (response.data.results && response.data.results.length > 0) {
    const results = response.data.results;
    const combined = results.map((r: any) => 
      `Title: ${r.title || ''}\nContent: ${r.content || r.snippet || ''}`
    ).join('\n\n');
    return combined;
  }

  // Fallback: stringify entire response
  return JSON.stringify(response.data);
}

/**
 * Analyze search results to extract trending topics and hashtags
 * Uses AI to parse and synthesize web search results
 */
async function analyzeSearchResults(results: string[]): Promise<TrendSearchResult> {
  const combinedResults = results.join('\n\n---\n\n');

    // Use 9router AI to analyze and extract trends
    const analysisPrompt = `Hãy phân tích kết quả web search về trending topics và hashtags trên TikTok.

Search Results:
${combinedResults}

Trích xuất và trả về dạng JSON:
{
  "trending_topics": ["topic 1", "topic 2", ...],
  "trending_hashtags": ["#hashtag1", "#hashtag2", ...],
  "insights": "tóm tắt ngắn về xu hướng đang trending"
}

Yêu cầu:
- Focus vào xu hướng AI và content creation
- Topics phù hợp creator 18-35 tuổi
- Xu hướng ở Vietnam hoặc quốc tế có thể áp dụng tại VN
- Hashtags đang viral trên TikTok hiện tại
- Sắp xếp topic theo mức độ trending
- Ưu tiên tiếng Việt, có thể kết hợp tiếng Anh

Trả về CHỈ JSON hợp lệ, không có text khác.`;

  const response = await axios.post(
    `${config.router9.baseUrl}/v1/chat/completions`,
    {
      model: config.router9.model,
      provider: config.router9.provider,
      messages: [
        { role: 'user', content: analysisPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.router9.apiKey}`
      },
      timeout: 30000
    }
  );

  const content = response.data.choices?.[0]?.message?.content || '';
  
  // Parse JSON response robustly (model may wrap JSON in markdown/text)
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonText);
    return {
      trending_topics: parsed.trending_topics || [],
      trending_hashtags: parsed.trending_hashtags || [],
      insights: parsed.insights || '',
      raw_results: results
    };
  } catch (e) {
    console.warn('⚠️ Could not parse trend analysis JSON. Raw AI response:');
    console.warn(content);

    // Fallback if JSON parsing fails
    return {
      trending_topics: ['AI automation for creators', 'Productivity with AI'],
      trending_hashtags: ['#AIAgent', '#ContentCreation', '#Automation'],
      insights: 'Fallback trends because AI analysis JSON parsing failed',
      raw_results: results
    };
  }
}

/**
 * Generate content prompt based on real-time trending research
 */
export async function generateTrendingPrompt(): Promise<string> {
  const trends = await searchTrendingTopics();

  // Pick random trending topic
  const randomTopic = trends.trending_topics[
    Math.floor(Math.random() * trends.trending_topics.length)
  ];

  // Format hashtags
  const hashtags = trends.trending_hashtags.slice(0, 4).join(' ');

  return `${randomTopic}

Context: ${trends.insights}
Hashtags: ${hashtags}

Tạo nội dung:
- Liên quan đến topic trending này
- Hấp dẫn với người mới tiếp cận AI (không phải tech expert)
- Thể hiện giá trị thực tế và truyền cảm hứng
- Phù hợp xu hướng TikTok hiện tại
- Dùng TIẾNG VIỆT`;
}
