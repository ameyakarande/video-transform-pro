const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export default async function handler(request, response) {
  const videoId = typeof request.query?.videoId === 'string' ? request.query.videoId : '';
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    response.status(400).json({ message: 'Invalid YouTube video ID.' });
    return;
  }

  let upstream = await fetch(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`);
  if (!upstream.ok) upstream = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  if (!upstream.ok) {
    response.status(404).json({ message: 'Reference thumbnail not found.' });
    return;
  }

  const data = Buffer.from(await upstream.arrayBuffer());
  response.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.status(200).send(data);
}
