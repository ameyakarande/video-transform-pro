/**
 * YouTube Upload Utility
 * Uses Google Identity Services (GIS) for OAuth 2.0
 * and YouTube Data API v3 for resumable video uploads.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => any;
        };
      };
    };
  }
}

const YT_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const YT_API_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

export interface YouTubeUploadOptions {
  videoBlob: Blob;
  title: string;
  description: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  onProgress?: (percent: number) => void;
}

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

/**
 * Initiates Google OAuth 2.0 token request.
 * Returns an access token with youtube.upload scope.
 */
export function requestYouTubeAuth(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK not loaded. Please refresh the page.'));
      return;
    }

    // If we have a cached token that hasn't expired, reuse it
    if (cachedAccessToken && Date.now() < tokenExpiry) {
      resolve(cachedAccessToken);
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: YT_UPLOAD_SCOPE,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(`OAuth error: ${response.error}`));
          return;
        }
        cachedAccessToken = response.access_token;
        tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000; // 1 min buffer
        resolve(response.access_token);
      },
      error_callback: (err: any) => {
        reject(new Error(`OAuth failed: ${err.type || err.message || 'Unknown error'}`));
      }
    });

    client.requestAccessToken();
  });
}

/**
 * Uploads a video to YouTube using the Data API v3 resumable upload protocol.
 */
export async function uploadToYouTube(
  accessToken: string,
  options: YouTubeUploadOptions
): Promise<{ videoId: string; url: string }> {
  const { videoBlob, title, description, privacyStatus, onProgress } = options;

  // Step 1: Initiate resumable upload session
  const metadata = {
    snippet: {
      title,
      description,
      categoryId: '22' // People & Blogs
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false
    }
  };

  const initResponse = await fetch(
    `${YT_API_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': videoBlob.size.toString(),
        'X-Upload-Content-Type': videoBlob.type || 'video/mp4'
      },
      body: JSON.stringify(metadata)
    }
  );

  if (!initResponse.ok) {
    const errorBody = await initResponse.text();
    throw new Error(`YouTube API error (${initResponse.status}): ${errorBody}`);
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Failed to get resumable upload URL from YouTube.');
  }

  // Step 2: Upload the video in chunks
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  let offset = 0;

  while (offset < videoBlob.size) {
    const end = Math.min(offset + CHUNK_SIZE, videoBlob.size);
    const chunk = videoBlob.slice(offset, end);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end - 1}/${videoBlob.size}`,
        'Content-Type': videoBlob.type || 'video/mp4'
      },
      body: chunk
    });

    if (uploadResponse.status === 200 || uploadResponse.status === 201) {
      // Upload complete
      const result = await uploadResponse.json();
      return {
        videoId: result.id,
        url: `https://www.youtube.com/watch?v=${result.id}`
      };
    } else if (uploadResponse.status === 308) {
      // Chunk accepted, continue
      const range = uploadResponse.headers.get('Range');
      if (range) {
        offset = parseInt(range.split('-')[1], 10) + 1;
      } else {
        offset = end;
      }
    } else {
      const errorBody = await uploadResponse.text();
      throw new Error(`Upload failed at offset ${offset}: ${errorBody}`);
    }

    if (onProgress) {
      onProgress(Math.min(offset / videoBlob.size, 1));
    }
  }

  throw new Error('Upload ended unexpectedly without completion.');
}

/**
 * Revokes the cached YouTube access token.
 */
export function revokeYouTubeAuth(): void {
  if (cachedAccessToken) {
    // Best-effort revocation
    fetch(`https://oauth2.googleapis.com/revoke?token=${cachedAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => {});
    cachedAccessToken = null;
    tokenExpiry = 0;
  }
}
