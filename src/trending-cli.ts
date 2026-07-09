import { pickTrendingTopic, getTrendingSummary, generateTrendAwarePrompt, formatHashtags } from './trending-research';

async function main() {
  try {
    console.log(getTrendingSummary());

    const topic = pickTrendingTopic(6);
    console.log('\n🎯 Selected trending topic:');
    console.log(`   Topic: ${topic.topic}`);
    console.log(`   Angle: ${topic.angle}`);
    console.log(`   Score: ${topic.trending_score}`);
    console.log(`   Audience: ${topic.target_audience}`);
    console.log(`   Hashtags: ${formatHashtags(topic)}`);

    console.log('\n📝 Trend-aware prompt:');
    console.log(generateTrendAwarePrompt(topic));

  } catch (error: any) {
    console.error('❌ Trending research failed:', error.message);
    process.exit(1);
  }
}

main();
