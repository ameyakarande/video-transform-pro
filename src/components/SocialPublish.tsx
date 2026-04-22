import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Settings, Upload, X } from 'lucide-react';
import { requestYouTubeAuth, revokeYouTubeAuth, uploadToYouTube } from '../utils/youtubeUpload';
import {
  beginSocialAuth,
  fetchSocialConnectionStatus,
  publishInstagram,
  publishTikTok,
} from '../utils/socialPlatformUpload';

interface SocialPublishProps {
  videoBlob: Blob | null;
  videoFileName: string;
}

interface UploadMeta {
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
}

type PublishPlatform = 'yt' | 'ig' | 'tk';

const STORAGE_KEY_YT_CLIENT = 'cinemaster_yt_client_id';
const STORAGE_KEY_YT_CONNECTED = 'cinemaster_yt_connected';
const STORAGE_KEY_SOCIAL_BACKEND_URL = 'cinemaster_social_backend_url';
const DEFAULT_SOCIAL_BACKEND_URL = (import.meta.env.VITE_SOCIAL_BACKEND_URL as string | undefined) || 'http://localhost:8787';

const SocialPublish: React.FC<SocialPublishProps> = ({ videoBlob, videoFileName }) => {
  const [ytClientId, setYtClientId] = useState(() => localStorage.getItem(STORAGE_KEY_YT_CLIENT) || '');
  const [ytConnected, setYtConnected] = useState(() => localStorage.getItem(STORAGE_KEY_YT_CONNECTED) === 'true');
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem(STORAGE_KEY_SOCIAL_BACKEND_URL) || DEFAULT_SOCIAL_BACKEND_URL);
  const [igConnected, setIgConnected] = useState(false);
  const [tkConnected, setTkConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState<PublishPlatform | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{ url?: string; platform: PublishPlatform } | null>(null);
  const [meta, setMeta] = useState<UploadMeta>({
    title: videoFileName || 'My Video',
    description: 'Edited with Cinemaster Pro',
    privacy: 'unlisted',
  });

  useEffect(() => {
    setMeta((prev) => ({ ...prev, title: videoFileName || 'My Video' }));
  }, [videoFileName]);

  useEffect(() => {
    if (ytClientId) {
      localStorage.setItem(STORAGE_KEY_YT_CLIENT, ytClientId);
    } else {
      localStorage.removeItem(STORAGE_KEY_YT_CLIENT);
    }
  }, [ytClientId]);

  useEffect(() => {
    if (backendUrl) {
      localStorage.setItem(STORAGE_KEY_SOCIAL_BACKEND_URL, backendUrl);
    } else {
      localStorage.removeItem(STORAGE_KEY_SOCIAL_BACKEND_URL);
    }
  }, [backendUrl]);

  useEffect(() => {
    let cancelled = false;

    if (!backendUrl.trim()) {
      setIgConnected(false);
      setTkConnected(false);
      return;
    }

    fetchSocialConnectionStatus(backendUrl)
      .then((status) => {
        if (cancelled) return;
        setIgConnected(Boolean(status.instagram));
        setTkConnected(Boolean(status.tiktok));
      })
      .catch(() => {
        if (cancelled) return;
        setIgConnected(false);
        setTkConnected(false);
      });

    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  const resetUploadState = useCallback(() => {
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);
  }, []);

  const handleYouTubeConnect = useCallback(async () => {
    if (!ytClientId) {
      setShowSettings(true);
      setUploadError('Add your YouTube Client ID in settings first.');
      return;
    }

    try {
      resetUploadState();
      await requestYouTubeAuth(ytClientId);
      setYtConnected(true);
      localStorage.setItem(STORAGE_KEY_YT_CONNECTED, 'true');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'YouTube connection failed.';
      setUploadError(message);
    }
  }, [resetUploadState, ytClientId]);

  const handlePlatformClick = useCallback(async (platform: PublishPlatform) => {
    resetUploadState();

    if (platform === 'yt') {
      if (!ytConnected) {
        await handleYouTubeConnect();
        return;
      }
      setShowUploadModal('yt');
      return;
    }

    if (!backendUrl.trim()) {
      setShowSettings(true);
      setUploadError('Add your Social Backend URL in settings first.');
      return;
    }

    if (platform === 'ig' && !igConnected) {
      try {
        await beginSocialAuth(backendUrl, 'instagram');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Instagram connection failed.';
        setUploadError(message);
      }
      return;
    }

    if (platform === 'tk' && !tkConnected) {
      try {
        await beginSocialAuth(backendUrl, 'tiktok');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'TikTok connection failed.';
        setUploadError(message);
      }
      return;
    }

    if (!videoBlob) {
      setUploadError('Export your video first to enable direct publishing.');
      return;
    }

    setShowUploadModal(platform);
  }, [backendUrl, handleYouTubeConnect, igConnected, resetUploadState, tkConnected, videoBlob, ytConnected]);

  const platformTitle = useMemo(() => {
    switch (showUploadModal) {
      case 'ig':
        return 'Publish to Instagram';
      case 'tk':
        return 'Publish to TikTok';
      default:
        return 'Upload to YouTube';
    }
  }, [showUploadModal]);

  const handleYouTubeDisconnect = useCallback(() => {
    revokeYouTubeAuth();
    setYtConnected(false);
    localStorage.removeItem(STORAGE_KEY_YT_CONNECTED);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!videoBlob || !showUploadModal) {
      setUploadError('Export your video first to enable direct publishing.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);

    try {
      if (showUploadModal === 'yt') {
        const token = await requestYouTubeAuth(ytClientId);
        const result = await uploadToYouTube(token, {
          videoBlob,
          title: meta.title,
          description: meta.description,
          privacyStatus: meta.privacy,
          onProgress: setUploadProgress,
        });
        setUploadSuccess({ url: result.url, platform: 'yt' });
      } else if (showUploadModal === 'ig') {
        setUploadProgress(0.35);
        const result = await publishInstagram(backendUrl, {
          videoBlob,
          title: meta.title,
          description: meta.description,
        });
        setUploadProgress(1);
        setUploadSuccess({ url: result.url, platform: 'ig' });
      } else if (showUploadModal === 'tk') {
        setUploadProgress(0.35);
        const result = await publishTikTok(backendUrl, {
          videoBlob,
          title: meta.title,
          description: meta.description,
        });
        setUploadProgress(1);
        setUploadSuccess({ url: result.url, platform: 'tk' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publishing failed.';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }, [backendUrl, meta.description, meta.privacy, meta.title, showUploadModal, videoBlob, ytClientId]);

  return (
    <div className="social-publish">
      <div className="ctrl-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Publish</span>
        <button
          className="social-settings-btn"
          onClick={() => setShowSettings((prev) => !prev)}
          title="Publishing Settings"
          aria-label="Publishing Settings"
        >
          <Settings style={{ width: 12, height: 12 }} />
        </button>
      </div>

      {showSettings && (
        <div className="social-settings-panel fade-up">
          <div className="social-settings-header">
            <span>Direct Publishing Setup</span>
            <button onClick={() => setShowSettings(false)} aria-label="Close settings">
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>

          <div className="social-settings-group">
            <span className="social-settings-subtitle">YouTube</span>
            <input
              type="text"
              className="social-input"
              placeholder="Google OAuth Client ID"
              value={ytClientId}
              onChange={(event) => setYtClientId(event.target.value)}
            />
          </div>

          <div className="social-settings-group">
            <span className="social-settings-subtitle">Instagram + TikTok backend</span>
            <input
              type="text"
              className="social-input"
              placeholder="https://your-domain.com"
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
            />
            <p className="social-settings-help">
              Instagram and TikTok direct publishing require a backend for OAuth callbacks, token storage, and media upload.
            </p>
          </div>

          <div className="social-doc-links">
            <a href="https://developers.facebook.com/docs/instagram-platform/content-publishing" target="_blank" rel="noreferrer">
              Instagram publishing docs <ExternalLink style={{ width: 12, height: 12 }} />
            </a>
            <a href="https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide" target="_blank" rel="noreferrer">
              TikTok content posting docs <ExternalLink style={{ width: 12, height: 12 }} />
            </a>
          </div>
        </div>
      )}

      <div className="social-icon-row">
        <div className="social-platform">
              <button
            className={`social-icon-btn social-icon-yt ${ytConnected ? 'is-connected' : ''}`}
            onClick={() => void handlePlatformClick('yt')}
            title={ytConnected ? 'Upload to YouTube' : 'Connect YouTube'}
            aria-label={ytConnected ? 'Upload to YouTube' : 'Connect YouTube'}
            disabled={uploading}
          >
            <span className="social-sprite social-sprite-yt" aria-hidden="true" />
            {ytConnected && <CheckCircle2 className="social-icon-check" />}
          </button>
        </div>

        <div className="social-platform">
          <button
            className={`social-icon-btn social-icon-ig ${igConnected ? 'is-connected' : ''}`}
            onClick={() => void handlePlatformClick('ig')}
            title={igConnected ? 'Publish to Instagram' : 'Connect Instagram'}
            aria-label={igConnected ? 'Publish to Instagram' : 'Connect Instagram'}
            disabled={uploading || (!igConnected && !backendUrl.trim())}
          >
            <span className="social-sprite social-sprite-ig" aria-hidden="true" />
            {igConnected && <CheckCircle2 className="social-icon-check" />}
          </button>
        </div>

        <div className="social-platform">
          <button
            className={`social-icon-btn social-icon-tk ${tkConnected ? 'is-connected' : ''}`}
            onClick={() => void handlePlatformClick('tk')}
            title={tkConnected ? 'Publish to TikTok' : 'Connect TikTok'}
            aria-label={tkConnected ? 'Publish to TikTok' : 'Connect TikTok'}
            disabled={uploading || (!tkConnected && !backendUrl.trim())}
          >
            <span className="social-sprite social-sprite-tk" aria-hidden="true" />
            {tkConnected && <CheckCircle2 className="social-icon-check" />}
          </button>
        </div>
      </div>

      {uploadError && <p className="social-hint social-error-text">{uploadError}</p>}
      {!videoBlob && !uploadError && <p className="social-hint">Export your video first to enable direct publishing.</p>}
      {!backendUrl.trim() && !uploadError && <p className="social-hint">Add your Social Backend URL to enable Instagram and TikTok.</p>}

      {ytConnected && (
        <button className="social-inline-link" onClick={handleYouTubeDisconnect}>
          Disconnect YouTube
        </button>
      )}

      {showUploadModal && (
        <div className="upload-modal-overlay" onClick={() => !uploading && setShowUploadModal(null)}>
          <div className="upload-modal" onClick={(event) => event.stopPropagation()}>
            <div className="upload-modal-header">
              <span
                className={`social-sprite ${
                  showUploadModal === 'yt'
                    ? 'social-sprite-yt'
                    : showUploadModal === 'ig'
                      ? 'social-sprite-ig'
                      : 'social-sprite-tk'
                }`}
                aria-hidden="true"
              />
              <h3>{platformTitle}</h3>
              {!uploading && (
                <button className="close-btn" onClick={() => setShowUploadModal(null)} aria-label="Close modal">
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            {uploadSuccess ? (
              <div className="upload-success">
                <CheckCircle2 style={{ width: 40, height: 40, color: 'var(--success)' }} />
                <p>Publishing completed successfully.</p>
                {uploadSuccess.url && (
                  <a href={uploadSuccess.url} target="_blank" rel="noopener noreferrer" className="upload-link">
                    Open published post <ExternalLink style={{ width: 12, height: 12 }} />
                  </a>
                )}
                <button className="social-save-btn" onClick={() => { setShowUploadModal(null); setUploadSuccess(null); }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="upload-field">
                  <label>Title</label>
                  <input
                    type="text"
                    className="social-input"
                    value={meta.title}
                    onChange={(event) => setMeta((prev) => ({ ...prev, title: event.target.value }))}
                    disabled={uploading}
                  />
                </div>

                <div className="upload-field">
                  <label>Description</label>
                  <textarea
                    className="social-input social-textarea"
                    value={meta.description}
                    onChange={(event) => setMeta((prev) => ({ ...prev, description: event.target.value }))}
                    disabled={uploading}
                    rows={4}
                  />
                </div>

                {showUploadModal === 'yt' && (
                  <div className="upload-field">
                    <label>Privacy</label>
                    <div className="privacy-pills">
                      {(['private', 'unlisted', 'public'] as const).map((privacy) => (
                        <button
                          key={privacy}
                          className={`privacy-pill ${meta.privacy === privacy ? 'active' : ''}`}
                          onClick={() => setMeta((prev) => ({ ...prev, privacy }))}
                          disabled={uploading}
                        >
                          {privacy}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {uploading && (
                  <div className="upload-progress-section">
                    <div className="progress-bar" style={{ marginBottom: 8 }}>
                      <div className="progress-fill" style={{ width: `${uploadProgress * 100}%` }} />
                    </div>
                    <p className="progress-text">Uploading... {(uploadProgress * 100).toFixed(0)}%</p>
                  </div>
                )}

                <button
                  className="btn-export upload-btn"
                  onClick={() => void handleUpload()}
                  disabled={uploading || !videoBlob || !meta.title.trim()}
                >
                  <Upload style={{ width: 16, height: 16 }} />
                  {uploading ? 'Uploading...' : 'Publish Now'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialPublish;
