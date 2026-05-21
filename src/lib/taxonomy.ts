export const BASE_TAXONOMY = [
  'Development',
  'AI & Tools',
  'Learning',
  'Work',
  'Finance',
  'Shopping',
  'Travel',
  'News',
  'Entertainment',
  'Social',
  'Personal',
  'Other',
] as const;

const RESERVED_FOLDER_NAMES = new Set(['', 'root']);

export function normalizeFolderName(folder: string): string {
  const cleaned = folder
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);

  if (!cleaned) {
    return 'Other';
  }

  return cleaned
    .split(' ')
    .map((part) => {
      if (/^[A-Z0-9&+.-]{2,}$/.test(part)) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export function isValidFolderName(folder: string): boolean {
  const normalized = normalizeFolderName(folder);
  return normalized.length > 0 && !RESERVED_FOLDER_NAMES.has(normalized.toLowerCase());
}

export function mergeTaxonomy(existingFolders: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const folder of [...BASE_TAXONOMY, ...existingFolders]) {
    const normalized = normalizeFolderName(folder);
    const key = normalized.toLowerCase();
    if (!RESERVED_FOLDER_NAMES.has(key) && !byKey.has(key)) {
      byKey.set(key, normalized);
    }
  }
  return [...byKey.values()];
}

export function closestTaxonomyFolder(folder: string, taxonomy: string[]): string {
  const normalized = normalizeFolderName(folder);
  const exact = taxonomy.find((item) => item.toLowerCase() === normalized.toLowerCase());
  return exact ?? normalized;
}
