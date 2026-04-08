export type PresetType = 'grayscale' | 'sepia' | 'high-contrast' | 'cool' | 'warm';

export function generateLutPreset(type: PresetType): File {
  const size = 16;
  let content = `TITLE "${type}"\nLUT_3D_SIZE ${size}\n`;
  
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const fr = r / (size - 1);
        const fg = g / (size - 1);
        const fb = b / (size - 1);
        
        let outR = fr, outG = fg, outB = fb;
        
        if (type === 'grayscale') {
          const lum = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          outR = outG = outB = lum;
        } else if (type === 'sepia') {
          outR = Math.min(1, (fr * 0.393) + (fg * 0.769) + (fb * 0.189));
          outG = Math.min(1, (fr * 0.349) + (fg * 0.686) + (fb * 0.168));
          outB = Math.min(1, (fr * 0.272) + (fg * 0.534) + (fb * 0.131));
        } else if (type === 'high-contrast') {
           const contrast = (c: number) => c < 0.5 ? 2 * c * c : 1 - 2 * (1 - c) * (1 - c);
           // Blend 50% of the contrast to avoid it being too harsh
           outR = fr * 0.5 + contrast(fr) * 0.5;
           outG = fg * 0.5 + contrast(fg) * 0.5;
           outB = fb * 0.5 + contrast(fb) * 0.5;
        } else if (type === 'cool') {
           outR = fr * 0.9;
           outG = fg * 0.95;
           outB = fb + (1 - fb) * 0.2; // boost blue
        } else if (type === 'warm') {
           outR = fr + (1 - fr) * 0.2; // boost red
           outG = fg + (1 - fg) * 0.1; 
           outB = fb * 0.8;
        }
        
        content += `${outR.toFixed(5)} ${outG.toFixed(5)} ${outB.toFixed(5)}\n`;
      }
    }
  }
  
  return new File([content], `${type}-preset.cube`, { type: 'text/plain' });
}
