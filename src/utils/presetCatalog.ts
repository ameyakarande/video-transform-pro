interface PresetCatalogItem {
  id: string;
  name: string;
  fileName: string;
  cubePath: string;
  imagePath?: string;
  fallbackHue: number;
}

const cubeModules = import.meta.glob('/public/presets/*.cube', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const imageModules = {
  ...import.meta.glob('/public/presets/*.{jpg,jpeg,png,webp,avif}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
} as Record<string, string>;

function normalizeBaseName(filePath: string) {
  return filePath
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .toLowerCase() || '';
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
  const imageLookup = new Map<string, string>();

  Object.entries(imageModules).forEach(([filePath, assetUrl]) => {
    imageLookup.set(normalizeBaseName(filePath), assetUrl);
  });

  return Object.entries(cubeModules)
    .map(([filePath, assetUrl]) => {
      const baseName = normalizeBaseName(filePath);

      return {
        id: baseName,
        name: humanizePresetName(baseName),
        fileName: `${baseName}.cube`,
        cubePath: assetUrl,
        imagePath: imageLookup.get(baseName),
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
