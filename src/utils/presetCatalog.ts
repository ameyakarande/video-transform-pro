interface PresetCatalogItem {
  id: string;
  name: string;
  fileName: string;
  cubePath: string;
  imagePath?: string;
  fallbackHue: number;
}

function humanizePresetName(baseName: string) {
  return baseName
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function makeFallbackHue(seed: string) {
  return Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

function naturalPresetSort(left: PresetCatalogItem, right: PresetCatalogItem) {
  return left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: 'base' });
}

export function getPresetCatalog(): PresetCatalogItem[] {
  return Array.from({ length: 26 }, (_, index) => {
      const baseName = `lut${index + 1}`;

      return {
        id: baseName,
        name: humanizePresetName(baseName),
        fileName: `${baseName}.cube`,
        cubePath: `/presets/${baseName}.cube`,
        imagePath: baseName === 'lut6' ? '/presets/lut6.jpg' : undefined,
        fallbackHue: makeFallbackHue(baseName),
      };
    })
    .sort(naturalPresetSort);
}

export async function fetchPresetCatalog(baseUrl: string): Promise<PresetCatalogItem[]> {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    return getPresetCatalog();
  }

  try {
    const response = await fetch(`${normalized}/api/presets/list`);
    if (!response.ok) {
      throw new Error('Preset API unavailable');
    }
    const data = await response.json() as { presets?: PresetCatalogItem[] };
    if (!Array.isArray(data.presets)) {
      throw new Error('Invalid preset payload');
    }
    return data.presets;
  } catch {
    return getPresetCatalog();
  }
}

export type { PresetCatalogItem };
