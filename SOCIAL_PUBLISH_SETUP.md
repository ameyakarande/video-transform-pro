# Social Publishing Setup

This app now supports direct-publish UI flows for:

- YouTube
- Instagram
- TikTok

## What the frontend expects

Add your backend URL in the Publish settings panel. The frontend will call:

- `GET /api/social/connections/status`
- `GET /api/social/instagram/auth-url`
- `GET /api/social/tiktok/auth-url`
- `POST /api/social/instagram/publish`
- `POST /api/social/tiktok/publish`

All endpoints are expected to live under your backend base URL.

## Expected backend responses

### `GET /api/social/connections/status`

```json
{
  "instagram": true,
  "tiktok": false,
  "youtube": false
}
```

### `GET /api/social/{platform}/auth-url`

```json
{
  "authUrl": "https://..."
}
```

### `POST /api/social/{platform}/publish`

Multipart form data:

- `video`
- `title`
- `description`

Expected response:

```json
{
  "url": "https://..."
}
```

## Instagram requirements

- Meta app with Instagram product enabled
- Instagram professional account
- Account linked to a Facebook Page
- Permissions for Instagram content publishing
- Backend callback route for OAuth
- Backend-managed token storage
- Publicly reachable media handling on the backend before publishing

## TikTok requirements

- TikTok developer app
- Login Kit / OAuth configured
- Content Posting API enabled
- Required publish scopes approved for your app
- Backend callback route for OAuth
- Backend-managed token storage
- Backend upload and publish flow for TikTok media transfer

## Notes

- YouTube can continue using the current browser-based OAuth flow.
- Instagram and TikTok should not store app secrets in the browser.
- The frontend intentionally routes those two platforms through a backend contract.
