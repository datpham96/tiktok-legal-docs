import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import { getDemoStatus, getDemoVideoPath, publishDemoVideo } from './demo-api';
import { exchangeCodeForToken, getAuthUrl } from './tiktok-auth';

validateEnv([
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'TIKTOK_REDIRECT_URI'
]);

const app = express();
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const assetsDir = path.join(rootDir, 'assets');

app.use(express.json());
app.use('/assets', express.static(assetsDir));

// Studio app assets (demo.css / demo.js) live under /public
app.use('/studio', express.static(publicDir));
app.get('/studio', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.get('/studio/', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Marketing website at domain root (GitHub Pages pages moved into Node)
app.get('/privacy-policy', (_req: Request, res: Response) => {
  res.sendFile(path.join(rootDir, 'privacy-policy', 'index.html'));
});
app.get('/privacy-policy/', (_req: Request, res: Response) => {
  res.sendFile(path.join(rootDir, 'privacy-policy', 'index.html'));
});
app.get('/terms-of-service', (_req: Request, res: Response) => {
  res.sendFile(path.join(rootDir, 'terms-of-service', 'index.html'));
});
app.get('/terms-of-service/', (_req: Request, res: Response) => {
  res.sendFile(path.join(rootDir, 'terms-of-service', 'index.html'));
});
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, app: 'AutoPublisher' });
});

app.get('/media/demo.mp4', (_req: Request, res: Response) => {
  const videoPath = getDemoVideoPath();
  if (!fs.existsSync(videoPath)) {
    return res.status(404).send('Demo video not found. Run npm run generate-video');
  }

  res.sendFile(videoPath);
});

app.get('/api/demo/status', async (_req: Request, res: Response) => {
  try {
    const status = await getDemoStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/demo/publish', async (req: Request, res: Response) => {
  try {
    const log = await publishDemoVideo({
      caption: typeof req.body?.caption === 'string' ? req.body.caption : undefined,
      privacy: req.body?.privacy,
      disableComment: Boolean(req.body?.disableComment),
      disableDuet: Boolean(req.body?.disableDuet),
      disableStitch: Boolean(req.body?.disableStitch)
    });
    res.json({ ok: true, log });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/auth/tiktok', (_req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const authUrl = getAuthUrl();
    console.log('➡️  Redirecting to TikTok OAuth...');
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/callback/tiktok', async (req: Request, res: Response) => {
  const { code, error, error_description, state } = req.query;

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>AutoPublisher</title>
        <link rel="icon" href="/assets/icon-32.png">
      </head>
      <body style="font-family:sans-serif;max-width:560px;margin:60px auto;padding:0 20px;">
        <h1>Connection failed</h1>
        <p>${error}: ${error_description || ''}</p>
        <p><a href="/studio">Back to AutoPublisher Studio</a></p>
      </body>
      </html>
    `);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en"><head><meta charset="UTF-8"><title>AutoPublisher</title></head>
      <body style="font-family:sans-serif;max-width:560px;margin:60px auto;">
        <h1>Missing authorization code</h1>
        <p><a href="/studio">Back to AutoPublisher Studio</a></p>
      </body></html>
    `);
  }

  try {
    await exchangeCodeForToken(code, typeof state === 'string' ? state : undefined);
    res.redirect('/studio?connected=1');
  } catch (err: any) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en"><head><meta charset="UTF-8"><title>AutoPublisher</title></head>
      <body style="font-family:sans-serif;max-width:560px;margin:60px auto;">
        <h1>Token exchange failed</h1>
        <p>${err.message}</p>
        <p><a href="/studio">Back to AutoPublisher Studio</a></p>
      </body></html>
    `);
  }
});

app.listen(config.port, () => {
  console.log(`✅ AutoPublisher running at ${config.baseUrl}`);
  console.log(`🏠 Website: ${config.baseUrl}/`);
  console.log(`🎬 Studio:  ${config.baseUrl}/studio`);
  console.log(`🔗 OAuth:   ${config.baseUrl}/auth/tiktok`);
});
