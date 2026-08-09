import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
  created_at: number;
}

interface PkceState {
  state: string;
  createdAt: number;
}

const pkceStateFile = path.join(process.cwd(), 'pkce-state.json');

export function getAuthUrl(): string {
  const state = randomBase64Url(32);

  savePkceState({
    state,
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey,
    scope: config.tiktok.scopes.join(','),
    response_type: 'code',
    redirect_uri: config.tiktok.redirectUri,
    state
  });

  console.log('🔐 Generated TikTok OAuth state');
  return `${config.tiktok.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, state?: string): Promise<TokenData> {
  console.log('🔐 Exchanging authorization code for access token...');

  try {
    const pkceState = loadPkceState(state);
    const params = new URLSearchParams({
      client_key: config.tiktok.clientKey,
      client_secret: config.tiktok.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.tiktok.redirectUri
    });

    const response = await axios.post(
      config.tiktok.tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.data.error) {
      throw new Error(`TikTok OAuth error: ${response.data.error} - ${response.data.error_description}`);
    }

    const tokenData: TokenData = {
      ...response.data,
      created_at: Date.now()
    };

    saveTokens(tokenData);
    clearPkceState();

    console.log('✅ Access token obtained successfully');
    console.log(`   Scope: ${tokenData.scope}`);
    console.log(`   Expires in: ${tokenData.expires_in} seconds (~${Math.floor(tokenData.expires_in / 3600)} hours)`);

    return tokenData;

  } catch (error: any) {
    console.error('❌ Token exchange failed:', error.message);

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 400) {
        console.error('\n💡 Troubleshooting tips:');
        console.error('   - Check TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET');
        console.error('   - Verify TIKTOK_REDIRECT_URI matches exactly in TikTok Developer Portal');
        console.error('   - Authorization code may have expired or already been used');
        console.error('   - Retry from /auth/tiktok so a fresh PKCE code_challenge is generated');
      }
    }

    throw error;
  }
}

export function saveTokens(tokenData: TokenData): void {
  try {
    fs.writeFileSync(
      config.storage.tokensFile,
      JSON.stringify(tokenData, null, 2),
      'utf-8'
    );
    console.log(`💾 Tokens saved to: ${config.storage.tokensFile}`);
  } catch (error: any) {
    console.error('❌ Failed to save tokens:', error.message);
    throw error;
  }
}

/** Read tokens.json without expiry check. */
function readTokenFile(): TokenData | null {
  try {
    if (!fs.existsSync(config.storage.tokensFile)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(config.storage.tokensFile, 'utf-8')) as TokenData;
  } catch {
    return null;
  }
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh ~5 min before access token expires

export function loadTokens(): TokenData | null {
  try {
    const tokenData = readTokenFile();
    if (!tokenData) {
      console.warn('⚠️  No tokens file found');
      return null;
    }

    const expiresAt = tokenData.created_at + tokenData.expires_in * 1000;

    if (Date.now() >= expiresAt) {
      console.warn('⚠️  Access token has expired (use getValidTokens() to auto-refresh)');
      return null;
    }

    const remainingSeconds = Math.floor((expiresAt - Date.now()) / 1000);
    console.log(`✅ Loaded valid access token (expires in ${remainingSeconds}s)`);

    return tokenData;
  } catch (error: any) {
    console.error('❌ Failed to load tokens:', error.message);
    return null;
  }
}

/**
 * Return a valid access token, refreshing automatically when expired or near expiry.
 * Only falls back to manual OAuth when refresh_token is missing or refresh fails.
 */
export async function getValidTokens(): Promise<TokenData | null> {
  const tokenData = readTokenFile();
  if (!tokenData) {
    console.warn('⚠️  No tokens file found');
    return null;
  }

  const expiresAt = tokenData.created_at + tokenData.expires_in * 1000;
  if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
    const remainingSeconds = Math.floor((expiresAt - Date.now()) / 1000);
    console.log(`✅ Loaded valid access token (expires in ${remainingSeconds}s)`);
    return tokenData;
  }

  if (!tokenData.refresh_token) {
    console.warn('⚠️  Access token expired and no refresh_token — reconnect at /auth/tiktok');
    return null;
  }

  console.log('🔄 Access token expired or near expiry — refreshing...');
  try {
    return await refreshAccessToken(tokenData.refresh_token);
  } catch {
    console.warn('⚠️  Token refresh failed — reconnect at /auth/tiktok');
    return null;
  }
}

export function clearTokens(): void {
  if (fs.existsSync(config.storage.tokensFile)) {
    fs.unlinkSync(config.storage.tokensFile);
  }

  clearPkceState();
  console.log('✅ TikTok tokens cleared');
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  console.log('🔄 Refreshing access token...');

  try {
    const params = new URLSearchParams({
      client_key: config.tiktok.clientKey,
      client_secret: config.tiktok.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await axios.post(
      config.tiktok.tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.data.error || !response.data.access_token) {
      throw new Error(
        `TikTok refresh error: ${response.data.error || 'missing_access_token'} - ${response.data.error_description || 'no token returned'}`
      );
    }

    const tokenData: TokenData = {
      ...response.data,
      created_at: Date.now()
    };

    saveTokens(tokenData);
    console.log('✅ Access token refreshed successfully');
    console.log(`   Scope: ${tokenData.scope}`);

    return tokenData;

  } catch (error: any) {
    console.error('❌ Token refresh failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

function randomBase64Url(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function createCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

function savePkceState(pkceState: PkceState): void {
  fs.writeFileSync(pkceStateFile, JSON.stringify(pkceState, null, 2), 'utf-8');
}

function loadPkceState(callbackState?: string): PkceState {
  if (!fs.existsSync(pkceStateFile)) {
    throw new Error('Missing PKCE state. Restart OAuth at /auth/tiktok.');
  }

  const pkceState: PkceState = JSON.parse(fs.readFileSync(pkceStateFile, 'utf-8'));
  const maxAgeMs = 10 * 60 * 1000;

  if (Date.now() - pkceState.createdAt > maxAgeMs) {
    clearPkceState();
    throw new Error('PKCE state expired. Restart OAuth at /auth/tiktok.');
  }

  if (callbackState && callbackState !== pkceState.state) {
    throw new Error('OAuth state mismatch. Restart OAuth at /auth/tiktok.');
  }

  return pkceState;
}

function clearPkceState(): void {
  if (fs.existsSync(pkceStateFile)) {
    fs.unlinkSync(pkceStateFile);
  }
}
