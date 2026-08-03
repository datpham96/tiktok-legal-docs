import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config, validateEnv } from './config';
import {
  getDemoCreatorInfo,
  getDemoStatus,
  getDemoVideoPath,
  getPublishProgress,
  publishDemoVideo,
  saveDemoVideo
} from './demo-api';
import { clearTokens, exchangeCodeForToken, getAuthUrl } from './tiktok-auth';

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
// Public photo URLs for TikTok PULL_FROM_URL (domain must be verified in Developer Portal)
app.use('/media/posts', express.static(path.join(publicDir, 'media', 'posts')));

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

// Latest creator info — required by TikTok UX guidelines each time the
// publish page is rendered.
app.get('/api/demo/creator-info', async (_req: Request, res: Response) => {
  try {
    const info = await getDemoCreatorInfo();
    res.json(info);
  } catch (error: any) {
    res.status(400).json({
      message:
        "We couldn't load your TikTok account details. Please try again later or reconnect your account."
    });
  }
});

app.get('/api/demo/publish/progress', (_req: Request, res: Response) => {
  res.json(getPublishProgress());
});

// Replace the pending video with a user-selected file.
app.post(
  '/api/demo/video',
  express.raw({ type: ['video/mp4', 'video/quicktime', 'application/octet-stream'], limit: '250mb' }),
  (req: Request, res: Response) => {
    try {
      saveDemoVideo(req.body as Buffer);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

app.post('/api/demo/publish', async (req: Request, res: Response) => {
  try {
    const result = await publishDemoVideo({
      caption: typeof req.body?.caption === 'string' ? req.body.caption : undefined,
      privacy: req.body?.privacy,
      allowComment: Boolean(req.body?.allowComment),
      allowDuet: Boolean(req.body?.allowDuet),
      allowStitch: Boolean(req.body?.allowStitch),
      commercialContent: Boolean(req.body?.commercialContent),
      yourBrand: Boolean(req.body?.yourBrand),
      brandedContent: Boolean(req.body?.brandedContent),
      isAigc: Boolean(req.body?.isAigc)
    });
    res.json({
      ok: true,
      log: result.log,
      status: result.status,
      publishId: result.publishId,
      message: result.message,
      publishedAt: result.publishedAt,
      privacy: result.privacy,
      caption: result.caption
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/demo/logout', (_req: Request, res: Response) => {
  try {
    clearTokens();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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

// Branded status page for OAuth outcomes — end-user wording only, no API details.
function statusPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — AutoPublisher</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icon-32.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/site.css?v=20260727b">
</head>
<body>
  <header class="site-header">
    <a href="/" class="brand">
      <img src="/assets/icon-192.png" alt="AutoPublisher" width="40" height="40">
      <span>AutoPublisher</span>
    </a>
    <nav class="site-nav">
      <a href="/">Home</a>
      <a href="/privacy-policy">Privacy</a>
      <a class="nav-cta" href="/studio">Open Studio</a>
    </nav>
  </header>

  <main class="page-main narrow">
    <section class="cta-band" style="margin-top:40px">
      <h2>${title}</h2>
      <p>${message}</p>
      <a class="btn btn-primary" href="/studio">Back to Studio</a>
    </section>
  </main>

  <footer class="site-footer">
    <p>&copy; 2026 AutoPublisher. All rights reserved.</p>
    <p style="margin-top: 12px;">
      <a href="/terms-of-service">Terms of Service</a>
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="mailto:contact@autopublisher.click">contact@autopublisher.click</a>
    </p>
  </footer>
</body>
</html>`;
}

app.get('/callback/tiktok', async (req: Request, res: Response) => {
  const { code, error, state } = req.query;

  if (error) {
    return res
      .status(400)
      .send(
        statusPage(
          'Connection cancelled',
          'Your TikTok account was not connected. You can try connecting again from Studio.'
        )
      );
  }

  if (!code || typeof code !== 'string') {
    return res
      .status(400)
      .send(
        statusPage(
          "We couldn't complete the connection",
          'The sign-in link was incomplete. Please start the connection again from Studio.'
        )
      );
  }

  try {
    await exchangeCodeForToken(code, typeof state === 'string' ? state : undefined);
    res.redirect('/studio?connected=1');
  } catch (err: any) {
    res
      .status(500)
      .send(
        statusPage(
          "We couldn't connect your account",
          'Something went wrong while finishing the connection. Please try again from Studio.'
        )
      );
  }
});

app.listen(config.port, () => {
  console.log(`✅ AutoPublisher running at ${config.baseUrl}`);
  console.log(`🏠 Website: ${config.baseUrl}/`);
  console.log(`🎬 Studio:  ${config.baseUrl}/studio`);
  console.log(`🔗 OAuth:   ${config.baseUrl}/auth/tiktok`);
});
