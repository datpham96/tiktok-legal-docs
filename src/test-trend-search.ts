import { searchTrendingTopics, generateTrendingPrompt } from './trend-searcher';

async function main() {
  try {
    console.log('🚀 Testing 9router web search for TikTok trends...\n');

    const trends = await searchTrendingTopics();

    console.log('\n📊 Trending Analysis:');
    console.log('Topics:', trends.trending_topics);
    console.log('Hashtags:', trends.trending_hashtags);
    console.log('Insights:', trends.insights);

    console.log('\n📝 Generated prompt:');
    const prompt = await generateTrendingPrompt();
    console.log(prompt);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n💡 This likely means we need to adjust the 9router web search endpoint.');
    console.error('Please provide the correct 9router web search API format or curl example.');
    process.exit(1);
  }
}

main();
