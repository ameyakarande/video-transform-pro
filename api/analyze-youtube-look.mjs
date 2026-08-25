const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function validYouTubeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && YOUTUBE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const number = (description, minimum, maximum) => ({ type: 'number', description, minimum, maximum });

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'A short evocative name for the overall color grade.' },
    summary: { type: 'string', description: 'Two concise sentences describing the recurring visual grade, not the subject matter.' },
    confidence: number('Confidence that the video has one reusable, consistent overall grade, from 0 to 1.', 0, 1),
    representative_timestamps: {
      type: 'array', minItems: 3, maxItems: 6,
      items: { type: 'string', description: 'MM:SS or HH:MM:SS timestamp of a representative graded shot.' },
    },
    temperature: number('White-balance temperature: -100 strongly cool, 0 neutral, 100 strongly warm.', -100, 100),
    tint: number('White-balance tint: -100 green, 0 neutral, 100 magenta.', -100, 100),
    exposure: number('Global exposure adjustment in stops, -2 to 2.', -2, 2),
    contrast: number('Global contrast adjustment from -100 flat to 100 hard.', -100, 100),
    highlights: number('Highlight adjustment from -100 compressed/darker to 100 brighter.', -100, 100),
    shadows: number('Shadow adjustment from -100 crushed/darker to 100 lifted.', -100, 100),
    whites: number('White point adjustment from -100 to 100.', -100, 100),
    blacks: number('Black point adjustment from -100 crushed to 100 faded/lifted.', -100, 100),
    saturation: number('Overall saturation from -100 to 100.', -100, 100),
    vibrance: number('Selective saturation of less-saturated colors from -100 to 100.', -100, 100),
    fade: number('Film fade / lifted toe amount from 0 to 100.', 0, 100),
    hue_shift: number('Subtle global hue rotation in degrees from -20 to 20.', -20, 20),
    red_balance: number('Red channel balance from -50 to 50.', -50, 50),
    green_balance: number('Green channel balance from -50 to 50.', -50, 50),
    blue_balance: number('Blue channel balance from -50 to 50.', -50, 50),
    teal_orange: number('Teal shadows / warm skin separation from 0 to 100.', 0, 100),
    grain: number('Perceived film grain from 0 to 100.', 0, 100),
    halation: number('Perceived warm highlight halation from 0 to 100.', 0, 100),
    vignette: number('Perceived edge darkening from 0 to 100.', 0, 100),
  },
  required: ['name', 'summary', 'confidence', 'representative_timestamps', 'temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'saturation', 'vibrance', 'fade', 'hue_shift', 'red_balance', 'green_balance', 'blue_balance', 'teal_orange', 'grain', 'halation', 'vignette'],
};

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ message: 'Use POST.' });
  const url = typeof request.body?.url === 'string' ? request.body.url.trim() : '';
  if (!validYouTubeUrl(url)) return response.status(400).json({ message: 'Enter a valid HTTPS YouTube video or Shorts URL.' });
  if (!process.env.GEMINI_API_KEY) return response.status(503).json({ message: 'AI video analysis is not configured yet. Add GEMINI_API_KEY to the Vercel project.' });

  const prompt = `Act as a senior colorist. Watch the full public YouTube video and infer its recurring color grade. Sample varied representative shots across the timeline. Ignore thumbnails, title cards, graphics, ads, abrupt scene-specific lighting, and the colors of individual objects. Estimate one restrained, reusable correction recipe that could recreate the video's overall visual language on another normally exposed video. Do not claim pixel precision. Return the requested structured values only.`;

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        model: process.env.GEMINI_VIDEO_MODEL || 'gemini-3.7-flash',
        input: [{ type: 'text', text: prompt }, { type: 'video', uri: url }],
        response_format: { type: 'text', mime_type: 'application/json', schema },
      }),
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      const detail = result?.error?.message || 'Google could not analyze this video.';
      return response.status(upstream.status === 429 ? 429 : 502).json({ message: detail });
    }
    const text = result?.steps?.flatMap((step) => step.content || []).find((item) => item.type === 'text')?.text;
    if (!text) return response.status(502).json({ message: 'The AI analysis completed without a color recipe.' });
    return response.status(200).json({ recipe: JSON.parse(text), provider: 'Google Gemini Video Understanding', sampling: 'approximately 1 FPS' });
  } catch (error) {
    return response.status(502).json({ message: error instanceof Error ? error.message : 'AI video analysis failed.' });
  }
}
