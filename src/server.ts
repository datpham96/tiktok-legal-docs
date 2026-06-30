import express, { Request, Response } from 'express';
import path from 'path';
import { config, validateEnv } from './config';
import { exchangeCodeForToken, getAuthUrl } from './tiktok-auth';

validateEnv([
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'TIKTOK_REDIRECT_URI',
  'ROUTER9_API_KEY'
]);

const app = express();

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send(`
    <h1>TikTok Auto Publish MVP</h1>
    <p>OAuth server is running.</p>
    <p><a href="/auth/tiktok">Connect TikTok</a></p>
  `);
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/terms', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'terms-of-service.html'));
});

app.get('/privacy', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'privacy-policy.html'));
});

app.get('/auth/tiktok', (_req: Request, res: Response) => {
  try {
    const authUrl = getAuthUrl();
    console.log('➡️  Redirecting to TikTok OAuth...');
    console.log(`   Redirect URI: ${config.tiktok.redirectUri}`);
    console.log(`   Scopes: ${config.tiktok.scopes.join(', ')}`);
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('❌ Failed to create TikTok OAuth URL:', error.message);
    res.status(500).json({
      error: 'Failed to create TikTok OAuth URL',
      message: error.message
    });
  }
});

app.get('/callback/tiktok', async (req: Request, res: Response) => {
  const { code, error, error_description, state } = req.query;

  if (error) {
    console.error('❌ TikTok OAuth callback error:', error);
    console.error('   Description:', error_description);
    return res.status(400).send(`
      <h1>TikTok OAuth Failed</h1>
      <p><strong>Error:</strong> ${error}</p>
      <p><strong>Description:</strong> ${error_description || 'No description provided'}</p>
      <p>Check your TikTok Developer App settings, scopes, and redirect URI.</p>
    `);
  }

  if (!code || typeof code !== 'string') {
    console.error('❌ Missing authorization code in TikTok callback');
    return res.status(400).send(`
      <h1>Missing Authorization Code</h1>
      <p>TikTok did not return a valid authorization code.</p>
      <p>Please retry <a href="/auth/tiktok">TikTok OAuth</a>.</p>
    `);
  }

  try {
    await exchangeCodeForToken(code, typeof state === 'string' ? state : undefined);
    res.send(`
      <h1>TikTok Connected Successfully</h1>
      <p>Tokens were saved to <code>tokens.json</code>.</p>
      <p>You can now run:</p>
      <pre>npm run generate-video
npm run publish</pre>
    `);
  } catch (err: any) {
    console.error('❌ OAuth token exchange failed:', err.message);
    res.status(500).send(`
      <h1>Token Exchange Failed</h1>
      <p>${err.message}</p>
      <p>Check terminal logs for details.</p>
    `);
  }
});

app.listen(config.port, () => {
  console.log(`✅ OAuth server running at ${config.baseUrl}`);
  console.log(`🔗 Open ${config.baseUrl}/auth/tiktok to connect TikTok`);
});
