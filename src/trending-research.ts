import * as fs from 'fs';
import * as path from 'path';

interface TrendingTopic {
  id: string;
  topic: string;
  angle: string;
  hashtags: string[];
  trending_score: number;
  target_audience: string;
  notes: string;
}

interface TrendingData {
  last_updated: string;
  notes: string;
  trending_topics: TrendingTopic[];
}

/**
 * Load trending topics from JSON file
 */
export function loadTrendingTopics(): TrendingData {
  const filePath = path.join(__dirname, '..', 'trending-topics.json');
  
  if (!fs.existsSync(filePath)) {
    throw new Error('trending-topics.json not found. Please create it first.');
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Pick a trending topic weighted by trending_score
 * Higher score = higher chance of being selected
 */
export function pickTrendingTopic(minScore: number = 0): TrendingTopic {
  const data = loadTrendingTopics();
  const topics = data.trending_topics.filter(t => t.trending_score >= minScore);

  if (topics.length === 0) {
    throw new Error(`No trending topics found with score >= ${minScore}`);
  }

  // Weighted random selection based on trending_score
  const totalWeight = topics.reduce((sum, t) => sum + t.trending_score, 0);
  let random = Math.random() * totalWeight;

  for (const topic of topics) {
    random -= topic.trending_score;
    if (random <= 0) {
      return topic;
    }
  }

  // Fallback to last topic (shouldn't happen)
  return topics[topics.length - 1];
}

/**
 * Get all trending hashtags from all topics
 */
export function getAllTrendingHashtags(): string[] {
  const data = loadTrendingTopics();
  const allHashtags = new Set<string>();

  data.trending_topics.forEach(topic => {
    topic.hashtags.forEach(tag => allHashtags.add(tag));
  });

  return Array.from(allHashtags);
}

/**
 * Find topics by keyword
 */
export function findTopicsByKeyword(keyword: string): TrendingTopic[] {
  const data = loadTrendingTopics();
  const lowerKeyword = keyword.toLowerCase();

  return data.trending_topics.filter(topic =>
    topic.topic.toLowerCase().includes(lowerKeyword) ||
    topic.angle.toLowerCase().includes(lowerKeyword) ||
    topic.notes.toLowerCase().includes(lowerKeyword)
  );
}

/**
 * Generate enhanced prompt for AI based on trending topic
 */
export function generateTrendAwarePrompt(topic: TrendingTopic): string {
  return `Create engaging TikTok content about: "${topic.topic}"

Angle: ${topic.angle}
Target audience: ${topic.target_audience}

Requirements:
- Make it relatable and easy to understand (for people NEW to AI)
- Focus on inspiring curiosity, not technical details
- Keep it conversational and friendly
- Show value/benefit first
- Use simple language, avoid jargon

Content should answer: "Why should I care about this?"

Generate a specific, actionable topic that fits this trend.`;
}

/**
 * Format hashtags for caption
 */
export function formatHashtags(topic: TrendingTopic): string {
  return topic.hashtags.join(' ');
}

/**
 * Get trending summary for logging
 */
export function getTrendingSummary(): string {
  const data = loadTrendingTopics();
  const topTopics = data.trending_topics
    .sort((a, b) => b.trending_score - a.trending_score)
    .slice(0, 3);

  let summary = `🔥 Top 3 Trending Topics (updated ${data.last_updated}):\n`;
  topTopics.forEach((topic, i) => {
    summary += `   ${i + 1}. ${topic.topic} (score: ${topic.trending_score})\n`;
  });

  return summary;
}
