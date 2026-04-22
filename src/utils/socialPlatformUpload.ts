export interface SocialConnectionStatus {
  instagram?: boolean;
  tiktok?: boolean;
  youtube?: boolean;
}

export interface InstagramPublishPayload {
  videoBlob: Blob;
  title: string;
  description: string;
}

export interface TikTokPublishPayload {
  videoBlob: Blob;
  title: string;
  description: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function trimBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function fetchSocialConnectionStatus(baseUrl: string): Promise<SocialConnectionStatus> {
  const normalized = trimBaseUrl(baseUrl);
  if (!normalized) return {};

  const response = await fetch(`${normalized}/api/social/connections/status`, {
    credentials: 'include',
  });

  return parseJson<SocialConnectionStatus>(response);
}

export async function beginSocialAuth(baseUrl: string, platform: 'instagram' | 'tiktok'): Promise<void> {
  const normalized = trimBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('Add your Social Backend URL in settings first.');
  }

  const response = await fetch(`${normalized}/api/social/${platform}/auth-url`, {
    credentials: 'include',
  });
  const data = await parseJson<{ authUrl: string }>(response);

  if (!data.authUrl) {
    throw new Error(`No ${platform} auth URL returned by the backend.`);
  }

  window.open(data.authUrl, '_blank', 'popup=yes,width=640,height=760');
}

export async function publishInstagram(baseUrl: string, payload: InstagramPublishPayload): Promise<{ url?: string }> {
  const normalized = trimBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('Add your Social Backend URL in settings first.');
  }

  const response = await fetch(`${normalized}/api/social/instagram/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      videoBase64: await blobToBase64(payload.videoBlob),
    }),
    credentials: 'include',
  });

  return parseJson<{ url?: string }>(response);
}

export async function publishTikTok(baseUrl: string, payload: TikTokPublishPayload): Promise<{ url?: string }> {
  const normalized = trimBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('Add your Social Backend URL in settings first.');
  }

  const response = await fetch(`${normalized}/api/social/tiktok/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      videoBase64: await blobToBase64(payload.videoBlob),
    }),
    credentials: 'include',
  });

  return parseJson<{ url?: string }>(response);
}
