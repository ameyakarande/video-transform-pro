import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const uploadsDir = path.join(projectRoot, 'server', 'uploads');
const statePath = path.join(projectRoot, 'server', '.social-state.json');
const presetsDir = path.join(projectRoot, 'public', 'presets');

await ensureDirectory(uploadsDir);

const env = await loadEnv(path.join(projectRoot, '.env'));
const port = Number(env.SOCIAL_SERVER_PORT || 8787);
const allowedOrigin = env.SOCIAL_ALLOWED_ORIGIN || 'http://localhost:5173';
const publicBaseUrl = trimTrailingSlash(env.SOCIAL_PUBLIC_BASE_URL || `http://localhost:${port}`);
const instagramGraphVersion = env.INSTAGRAM_GRAPH_VERSION || 'v23.0';

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { message: 'Invalid request URL.' });
      return;
    }

    const requestUrl = new URL(req.url, `http://localhost:${port}`);
    const { pathname } = requestUrl;

    if (req.method === 'OPTIONS') {
      sendCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname.startsWith('/uploads/')) {
      await serveUpload(pathname, res);
      return;
    }

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, publicBaseUrl, allowedOrigin });
      return;
    }

    if (pathname === '/api/presets/list' && req.method === 'GET') {
      const presets = await listPresets();
      sendJson(res, 200, { presets });
      return;
    }

    if (pathname === '/api/social/connections/status' && req.method === 'GET') {
      const state = await readState();
      sendJson(res, 200, {
        instagram: Boolean(state.instagram?.accessToken),
        tiktok: Boolean(state.tiktok?.accessToken),
        youtube: false,
      });
      return;
    }

    if (pathname === '/api/social/instagram/auth-url' && req.method === 'GET') {
      ensureEnv(['INSTAGRAM_APP_ID', 'INSTAGRAM_REDIRECT_URI']);
      const state = await readState();
      const oauthState = randomUUID();
      state.instagram = { ...state.instagram, oauthState };
      await writeState(state);

      const authUrl = new URL('https://www.facebook.com/v23.0/dialog/oauth');
      authUrl.searchParams.set('client_id', env.INSTAGRAM_APP_ID);
      authUrl.searchParams.set('redirect_uri', env.INSTAGRAM_REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'instagram_basic,instagram_content_publish,pages_show_list,business_management');
      authUrl.searchParams.set('state', oauthState);

      sendJson(res, 200, { authUrl: authUrl.toString() });
      return;
    }

    if (pathname === '/api/social/tiktok/auth-url' && req.method === 'GET') {
      ensureEnv(['TIKTOK_CLIENT_KEY', 'TIKTOK_REDIRECT_URI']);
      const state = await readState();
      const oauthState = randomUUID();
      state.tiktok = { ...state.tiktok, oauthState };
      await writeState(state);

      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
      authUrl.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
      authUrl.searchParams.set('redirect_uri', env.TIKTOK_REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', env.TIKTOK_SCOPES || 'user.info.basic,video.publish');
      authUrl.searchParams.set('state', oauthState);

      sendJson(res, 200, { authUrl: authUrl.toString() });
      return;
    }

    if (pathname === '/api/social/instagram/callback' && req.method === 'GET') {
      await handleInstagramCallback(requestUrl, res);
      return;
    }

    if (pathname === '/api/social/tiktok/callback' && req.method === 'GET') {
      await handleTikTokCallback(requestUrl, res);
      return;
    }

    if (pathname === '/api/social/instagram/publish' && req.method === 'POST') {
      await handleInstagramPublish(req, res);
      return;
    }

    if (pathname === '/api/social/tiktok/publish' && req.method === 'POST') {
      await handleTikTokPublish(req, res);
      return;
    }

    sendJson(res, 404, { message: 'Route not found.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    sendJson(res, 500, { message });
  }
});

server.listen(port, () => {
  console.log(`Cinemaster social server listening on http://localhost:${port}`);
});

async function handleInstagramCallback(requestUrl, res) {
  ensureEnv(['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_REDIRECT_URI']);
  const code = requestUrl.searchParams.get('code');
  const stateValue = requestUrl.searchParams.get('state');
  const errorReason = requestUrl.searchParams.get('error_description');
  const state = await readState();

  if (errorReason) {
    sendHtml(res, 400, successPage(`Instagram connection failed: ${escapeHtml(errorReason)}`));
    return;
  }

  if (!code || stateValue !== state.instagram?.oauthState) {
    sendHtml(res, 400, successPage('Instagram callback validation failed.'));
    return;
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${instagramGraphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', env.INSTAGRAM_APP_ID);
  tokenUrl.searchParams.set('client_secret', env.INSTAGRAM_APP_SECRET);
  tokenUrl.searchParams.set('redirect_uri', env.INSTAGRAM_REDIRECT_URI);
  tokenUrl.searchParams.set('code', code);

  const tokenResponse = await fetch(tokenUrl);
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error?.message || 'Instagram token exchange failed.');
  }

  const nextState = await readState();
  const accountId = nextState.instagram?.businessAccountId || env.INSTAGRAM_BUSINESS_ACCOUNT_ID || await resolveInstagramBusinessAccountId(tokenData.access_token);
  nextState.instagram = {
    accessToken: tokenData.access_token,
    businessAccountId: accountId,
  };
  await writeState(nextState);

  sendHtml(res, 200, successPage('Instagram connected successfully. You can close this window.'));
}

async function handleTikTokCallback(requestUrl, res) {
  ensureEnv(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI']);
  const code = requestUrl.searchParams.get('code');
  const stateValue = requestUrl.searchParams.get('state');
  const errorText = requestUrl.searchParams.get('error_description');
  const state = await readState();

  if (errorText) {
    sendHtml(res, 400, successPage(`TikTok connection failed: ${escapeHtml(errorText)}`));
    return;
  }

  if (!code || stateValue !== state.tiktok?.oauthState) {
    sendHtml(res, 400, successPage('TikTok callback validation failed.'));
    return;
  }

  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.TIKTOK_REDIRECT_URI,
  });

  const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || 'TikTok token exchange failed.');
  }

  const nextState = await readState();
  nextState.tiktok = {
    accessToken: tokenData.access_token,
    openId: tokenData.open_id,
    refreshToken: tokenData.refresh_token,
  };
  await writeState(nextState);

  sendHtml(res, 200, successPage('TikTok connected successfully. You can close this window.'));
}

async function handleInstagramPublish(req, res) {
  ensureEnv(['SOCIAL_PUBLIC_BASE_URL']);
  const state = await readState();
  if (!state.instagram?.accessToken) {
    sendJson(res, 400, { message: 'Instagram is not connected yet.' });
    return;
  }

  const businessAccountId = state.instagram.businessAccountId || env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!businessAccountId) {
    sendJson(res, 400, { message: 'Instagram Business Account ID is missing.' });
    return;
  }

  const payload = await readJsonBody(req);
  validatePublishPayload(payload);

  const filename = `${Date.now()}-${randomUUID()}.mp4`;
  const publicUrl = await writeVideoAndGetPublicUrl(filename, payload.videoBase64);

  const containerResponse = await fetch(`https://graph.facebook.com/${instagramGraphVersion}/${businessAccountId}/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: publicUrl,
      caption: `${payload.title}\n\n${payload.description}`.trim(),
      share_to_feed: 'true',
      access_token: state.instagram.accessToken,
    }),
  });

  const containerData = await containerResponse.json();
  if (!containerResponse.ok || !containerData.id) {
    throw new Error(containerData.error?.message || 'Instagram media container creation failed.');
  }

  await waitForInstagramContainer(containerData.id, state.instagram.accessToken);

  const publishResponse = await fetch(`https://graph.facebook.com/${instagramGraphVersion}/${businessAccountId}/media_publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      creation_id: containerData.id,
      access_token: state.instagram.accessToken,
    }),
  });

  const publishData = await publishResponse.json();
  if (!publishResponse.ok || !publishData.id) {
    throw new Error(publishData.error?.message || 'Instagram publish failed.');
  }

  sendJson(res, 200, {
    url: `https://www.instagram.com/`,
    creationId: publishData.id,
  });
}

async function handleTikTokPublish(req, res) {
  ensureEnv(['SOCIAL_PUBLIC_BASE_URL']);
  const state = await readState();
  if (!state.tiktok?.accessToken) {
    sendJson(res, 400, { message: 'TikTok is not connected yet.' });
    return;
  }

  const payload = await readJsonBody(req);
  validatePublishPayload(payload);

  const filename = `${Date.now()}-${randomUUID()}.mp4`;
  const publicUrl = await writeVideoAndGetPublicUrl(filename, payload.videoBase64);

  const creatorInfoResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.tiktok.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({}),
  });

  const creatorInfoData = await creatorInfoResponse.json();
  if (!creatorInfoResponse.ok || creatorInfoData.error?.code !== 'ok') {
    throw new Error(creatorInfoData.error?.message || 'Unable to fetch TikTok creator info.');
  }

  const privacyLevel = creatorInfoData.data?.privacy_level_options?.[0] || 'SELF_ONLY';

  const publishResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.tiktok.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: payload.title,
        privacy_level: privacyLevel,
        disable_comment: false,
        disable_duet: Boolean(creatorInfoData.data?.duet_disabled),
        disable_stitch: Boolean(creatorInfoData.data?.stitch_disabled),
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: publicUrl,
      },
    }),
  });

  const publishData = await publishResponse.json();
  if (!publishResponse.ok || publishData.error?.code !== 'ok') {
    throw new Error(publishData.error?.message || 'TikTok publish initialization failed.');
  }

  sendJson(res, 200, {
    publishId: publishData.data?.publish_id,
  });
}

async function resolveInstagramBusinessAccountId(accessToken) {
  const response = await fetch(`https://graph.facebook.com/${instagramGraphVersion}/me/accounts?fields=instagram_business_account{id,name}&access_token=${encodeURIComponent(accessToken)}`);
  const data = await response.json();
  const match = data.data?.find((page) => page.instagram_business_account?.id);
  return match?.instagram_business_account?.id || '';
}

async function waitForInstagramContainer(creationId, accessToken) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`https://graph.facebook.com/${instagramGraphVersion}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
    const data = await response.json();

    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR' || data.status === 'ERROR') {
      throw new Error('Instagram media processing failed.');
    }

    await sleep(3000);
  }

  throw new Error('Instagram media processing timed out.');
}

async function writeVideoAndGetPublicUrl(filename, videoBase64) {
  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(videoBase64, 'base64');
  await fs.writeFile(filePath, buffer);
  return `${publicBaseUrl}/uploads/${filename}`;
}

async function serveUpload(pathname, res) {
  const filename = decodeURIComponent(pathname.replace('/uploads/', ''));
  const filePath = path.join(uploadsDir, filename);

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { message: 'Upload not found.' });
  }
}

function validatePublishPayload(payload) {
  if (!payload || typeof payload.title !== 'string' || typeof payload.description !== 'string' || typeof payload.videoBase64 !== 'string') {
    throw new Error('Invalid publish payload.');
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function readState() {
  try {
    const text = await fs.readFile(statePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function writeState(state) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function sendCors(res) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function sendJson(res, status, payload) {
  sendCors(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  sendCors(res);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(html);
}

function successPage(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cinemaster Social Setup</title><style>body{font-family:Arial,sans-serif;background:#0b0d12;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:520px;padding:32px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:#121723;box-shadow:0 24px 60px rgba(0,0,0,.35)}p{line-height:1.5;color:#c4c7d3}</style></head><body><div class="card"><h1>Cinemaster Pro</h1><p>${message}</p></div></body></html>`;
}

function ensureEnv(keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

async function loadEnv(envPath) {
  try {
    const text = await fs.readFile(envPath, 'utf8');
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listPresets() {
  await ensureDirectory(presetsDir);
  const entries = await fs.readdir(presetsDir, { withFileTypes: true });
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
  const imagesByBase = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExts.has(ext)) continue;
    imagesByBase.set(path.basename(entry.name, ext).toLowerCase(), `/presets/${entry.name}`);
  }

  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.cube')
    .map((entry) => {
      const baseName = path.basename(entry.name, '.cube');
      const normalized = baseName.toLowerCase();
      return {
        id: normalized,
        name: humanizePresetName(baseName),
        fileName: entry.name,
        cubePath: `/presets/${entry.name}`,
        imagePath: imagesByBase.get(normalized),
        fallbackHue: makeFallbackHue(normalized),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function humanizePresetName(baseName) {
  return baseName
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function makeFallbackHue(seed) {
  return Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
