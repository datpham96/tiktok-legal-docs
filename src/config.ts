import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface Config {
  port: number;
  baseUrl: string;
  tiktok: {
    clientKey: string;
    clientSecret: string;
    redirectUri: string;
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
  router9: {
    baseUrl: string;
    apiKey: string;
    model: string;
    provider: string;
  };
  openai: {
    apiKey: string;
  };
  storage: {
    videosDir: string;
    tokensFile: string;
  };
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/callback/tiktok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.upload']
  },
  router9: {
    baseUrl: process.env.ROUTER9_BASE_URL || 'https://api.9router.com',
    apiKey: process.env.ROUTER9_API_KEY || '',
    model: process.env.ROUTER9_MODEL || 'gpt-4o-mini',
    provider: process.env.ROUTER9_PROVIDER || 'openai'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || ''
  },
  storage: {
    videosDir: path.join(process.cwd(), 'storage', 'videos'),
    tokensFile: path.join(process.cwd(), 'tokens.json')
  }
};

export function validateEnv(requiredKeys: string[]): void {
  const missing = requiredKeys.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\n💡 Copy .env.example to .env and fill in the values');
    process.exit(1);
  }
}
