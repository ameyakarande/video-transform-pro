export interface AiLookRecipe {
  name: string; summary: string; confidence: number; representative_timestamps: string[];
  temperature: number; tint: number; exposure: number; contrast: number; highlights: number;
  shadows: number; whites: number; blacks: number; saturation: number; vibrance: number;
  fade: number; hue_shift: number; red_balance: number; green_balance: number; blue_balance: number;
  teal_orange: number; grain: number; halation: number; vignette: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

function rgbToHsl(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  let hue = 0; const lightness = (max + min) / 2; const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [hue, saturation, lightness] as const;
}

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs(section % 2 - 1));
  const values = section < 1 ? [chroma, x, 0] : section < 2 ? [x, chroma, 0] : section < 3 ? [0, chroma, x] : section < 4 ? [0, x, chroma] : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = lightness - chroma / 2;
  return values.map((value) => value + m);
}

function transform(input: number[], recipe: AiLookRecipe) {
  let [red, green, blue] = input;
  const exposure = 2 ** recipe.exposure;
  red *= exposure * (1 + recipe.red_balance / 250 + recipe.temperature / 420 + recipe.tint / 650);
  green *= exposure * (1 + recipe.green_balance / 250 - recipe.tint / 500);
  blue *= exposure * (1 + recipe.blue_balance / 250 - recipe.temperature / 420 + recipe.tint / 650);

  const luminance = clamp(red * .2126 + green * .7152 + blue * .0722);
  const shadowWeight = 1 - smoothstep(.08, .55, luminance);
  const highlightWeight = smoothstep(.45, .95, luminance);
  const shadowOffset = recipe.shadows / 500 * shadowWeight + recipe.blacks / 650 * (1 - smoothstep(0, .28, luminance));
  const highlightOffset = recipe.highlights / 500 * highlightWeight + recipe.whites / 650 * smoothstep(.72, 1, luminance);
  red += shadowOffset + highlightOffset; green += shadowOffset + highlightOffset; blue += shadowOffset + highlightOffset;

  const contrast = 1 + recipe.contrast / 125;
  red = (red - .5) * contrast + .5; green = (green - .5) * contrast + .5; blue = (blue - .5) * contrast + .5;
  const fade = recipe.fade / 100;
  red = red * (1 - fade * .14) + fade * .065; green = green * (1 - fade * .14) + fade * .065; blue = blue * (1 - fade * .14) + fade * .065;

  const tealOrange = recipe.teal_orange / 100;
  red += highlightWeight * tealOrange * .045; blue -= highlightWeight * tealOrange * .025;
  red -= shadowWeight * tealOrange * .035; green += shadowWeight * tealOrange * .025; blue += shadowWeight * tealOrange * .045;

  const hsl = rgbToHsl(clamp(red), clamp(green), clamp(blue));
  let hue = hsl[0], saturation = hsl[1];
  const lightness = hsl[2];
  hue += recipe.hue_shift;
  const saturationFactor = 1 + recipe.saturation / 100 + (recipe.vibrance / 120) * (1 - saturation);
  saturation = clamp(saturation * Math.max(0, saturationFactor));
  [red, green, blue] = hslToRgb(hue, saturation, lightness);
  return [clamp(red), clamp(green), clamp(blue)];
}

export function generateAiLookLut(recipe: AiLookRecipe, strength: number, preserveLuminance: boolean) {
  const size = 33;
  const amount = clamp(strength);
  const safeName = recipe.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'ai-video-look';
  const lines = [`TITLE "Cinemaster AI Video Look - ${recipe.name.replace(/"/g, '')}"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let blue = 0; blue < size; blue += 1) for (let green = 0; green < size; green += 1) for (let red = 0; red < size; red += 1) {
    const input = [red, green, blue].map((value) => value / (size - 1));
    const output = transform(input, recipe);
    if (preserveLuminance) {
      const before = input[0] * .2126 + input[1] * .7152 + input[2] * .0722;
      const after = output[0] * .2126 + output[1] * .7152 + output[2] * .0722;
      output[0] = clamp(output[0] + before - after); output[1] = clamp(output[1] + before - after); output[2] = clamp(output[2] + before - after);
    }
    lines.push(output.map((value, channel) => mix(input[channel], value, amount).toFixed(6)).join(' '));
  }
  return new File([`${lines.join('\n')}\n`], `${safeName}-${Date.now()}.cube`, { type: 'text/plain' });
}
