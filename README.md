# Cinemaster

Cinemaster is a browser-based video editor for trimming, reframing, LUT color grading, speed and audio changes, timed overlays, subtitles, MP4 export, and optional social publishing. Video editing runs locally with FFmpeg.wasm and WebGL2; direct Instagram and TikTok publishing uses the separate Node service in `server/`.

## Local development

Requirements: a current Node.js release and a browser with WebAssembly and WebGL2 support.

```bash
npm install
copy .env.example .env
npm run dev
```

For preset discovery and Instagram/TikTok publishing, run this separately:

```bash
npm run social-server
```

Then open the Vite URL, normally `http://localhost:5173`.

## Configuration

Copy `.env.example` to `.env`. `VITE_SOCIAL_BACKEND_URL` points the browser to the Node service. If social publishing is exposed beyond localhost, set the same long random value in `SOCIAL_API_KEY` and `VITE_SOCIAL_API_KEY`, restrict `SOCIAL_ALLOWED_ORIGIN`, use HTTPS, and put the service behind real user authentication. The browser API key is a deployment guard, not a substitute for user authentication.

Instagram and TikTok require their respective application credentials and exact OAuth callback URLs. See `SOCIAL_PUBLISH_SETUP.md` for platform setup.

## Verification

```bash
npm run check
```

This runs ESLint, TypeScript compilation, and a production Vite build.

## Operational notes

- FFmpeg core is downloaded from unpkg on first export, so the first export requires network access. The uploaded source and editing operations remain in the browser.
- Browser memory limits determine the maximum practical source and export size. Short-form clips are the intended workload.
- Social publishing accepts videos up to 180 MB. Temporary published files expire after 24 hours.
- OAuth tokens are stored in `server/.social-state.json` with owner-only permissions where supported. For a multi-user deployment, replace this file storage with encrypted per-user storage.
- Treat the social server as a single-user reference implementation until user sessions and durable encrypted token storage are added.
