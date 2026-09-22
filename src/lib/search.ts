import { getDomain } from './url';
import { MANAGED_FOLDER_NAME, type BookmarkTreeNodeLike } from './types';

export interface BookmarkRecord {
  id: string;
  title: string;
  url: string;
  domain: string;
  parentId: string;
  index: number;
  currentPath: string;
  dateAdded?: number;
  managed: boolean;
}

export interface BookmarkMetadata {
  category?: string;
  tags: string[];
  description?: string;
  note?: string;
  favorite?: boolean;
  openCount?: number;
  lastOpened?: number;
  updatedAt?: number;
}

export type BookmarkMetadataMap = Record<string, BookmarkMetadata>;
export type SearchFilter = 'all' | 'recent' | 'favorites' | 'unsorted' | 'duplicates';

export interface SearchHit {
  record: BookmarkRecord;
  metadata: BookmarkMetadata;
  score: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'by', 'com', 'for', 'from', 'in', 'io', 'is', 'it', 'net',
  'of', 'on', 'org', 'page', 'site', 'the', 'this', 'to', 'www', 'with',
]);

const CATEGORY_RULES: Array<{ category: string; words: string[] }> = [
  { category: 'Security', words: ['security', 'pentest', 'pentesting', 'hacking', 'owasp', 'cve', 'exploit', 'burp', 'nmap', 'malware', 'reverse engineering', 'cyber'] },
  { category: 'Development', words: ['github', 'gitlab', 'stackoverflow', 'npm', 'react', 'vue', 'angular', 'developer', 'typescript', 'javascript', 'python', 'rust', 'golang', 'api', 'code'] },
  { category: 'AI & Tools', words: ['openai', 'chatgpt', 'gemini', 'claude', 'perplexity', 'huggingface', 'replicate', 'midjourney', 'cursor', 'codex', 'llm', 'artificial intelligence'] },
  { category: 'Learning', words: ['course', 'learn', 'tutorial', 'university', 'coursera', 'udemy', 'edx', 'lesson', 'guide', 'manual', 'documentation', 'docs'] },
  { category: 'Work', words: ['slack', 'notion', 'asana', 'jira', 'linear', 'trello', 'office', 'teams', 'zoom', 'calendar', 'workspace'] },
  { category: 'Finance', words: ['bank', 'paypal', 'stripe', 'wise', 'finance', 'tax', 'invoice', 'wallet', 'crypto', 'coinbase', 'binance', 'trading'] },
  { category: 'Shopping', words: ['amazon', 'ebay', 'etsy', 'shop', 'store', 'cart', 'aliexpress', 'temu', 'walmart', 'bestbuy'] },
  { category: 'Travel', words: ['flight', 'hotel', 'airbnb', 'booking', 'maps', 'travel', 'trip', 'visa', 'airline', 'expedia'] },
  { category: 'News', words: ['news', 'nytimes', 'bbc', 'guardian', 'reuters', 'ycombinator', 'hacker news', 'substack'] },
  { category: 'Entertainment', words: ['youtube', 'netflix', 'spotify', 'movie', 'music', 'game', 'twitch', 'imdb', 'podcast'] },
  { category: 'Social', words: ['twitter', 'x.com', 'facebook', 'instagram', 'reddit', 'linkedin', 'discord', 'tiktok'] },
];

function cleanText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.+#/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return cleanText(value)
    .split(/[\s/_.-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && !STOP_WORDS.has(item));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function collectBookmarks(tree: BookmarkTreeNodeLike[]): BookmarkRecord[] {
  const records: BookmarkRecord[] = [];

  const visit = (node: BookmarkTreeNodeLike, path: string[], insideManaged: boolean) => {
    const isFolder = !node.url;
    const managed = insideManaged || (isFolder && node.title === MANAGED_FOLDER_NAME);

    if (isFolder) {
      const nextPath = node.title && node.title.toLowerCase() !== 'root' ? [...path, node.title] : path;
      for (const child of node.children ?? []) {
        visit(child, nextPath, managed);
      }
      return;
    }

    if (!node.url || !node.parentId) {
      return;
    }

    records.push({
      id: node.id,
      title: node.title || node.url,
      url: node.url,
      domain: getDomain(node.url),
      parentId: node.parentId,
      index: node.index ?? 0,
      currentPath: path.filter(Boolean).join(' / ') || 'Bookmarks',
      dateAdded: node.dateAdded,
      managed,
    });
  };

  for (const root of tree) {
    visit(root, [], false);
  }

  return records;
}

export function inferCategory(record: BookmarkRecord): string | undefined {
  const haystack = cleanText(`${record.title} ${record.domain} ${record.url} ${record.currentPath}`);
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((word) => haystack.includes(cleanText(word)))) {
      return rule.category;
    }
  }
  return undefined;
}

export function deriveLocalMetadata(record: BookmarkRecord): BookmarkMetadata {
  const category = inferCategory(record);
  const rawTags = [
    ...tokens(record.title),
    ...tokens(record.domain.replace(/^www\./, '')),
    ...(category ? tokens(category) : []),
  ];

  const tags = unique(rawTags)
    .filter((tag) => tag.length > 2 && tag.length < 28)
    .slice(0, 7);

  const location = record.currentPath && record.currentPath !== 'Bookmarks'
    ? ` in ${record.currentPath}`
    : '';

  return {
    category,
    tags,
    description: category
      ? `${category} bookmark from ${record.domain || 'the web'}${location}.`
      : `Saved from ${record.domain || 'the web'}${location}.`,
    favorite: false,
    openCount: 0,
  };
}

export function mergeMetadata(record: BookmarkRecord, current?: BookmarkMetadata): BookmarkMetadata {
  const derived = deriveLocalMetadata(record);
  return {
    ...derived,
    ...(current ?? {}),
    tags: unique([...(current?.tags ?? []), ...derived.tags]).slice(0, 10),
  };
}

export function normalizeBookmarkUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '');

    const trackingKeys = new Set(['fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src']);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || trackingKeys.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    let normalized = url.toString();
    if (url.pathname === '/' && !url.search) {
      normalized = normalized.replace(/\/$/, '');
    }
    return normalized;
  } catch {
    return value.trim().replace(/#.*$/, '').replace(/\/$/, '');
  }
}

export function findDuplicateIds(records: BookmarkRecord[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const key = normalizeBookmarkUrl(record.url);
    const current = groups.get(key) ?? [];
    current.push(record.id);
    groups.set(key, current);
  }

  const duplicateIds = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => duplicateIds.add(id));
    }
  }
  return duplicateIds;
}

function fuzzyTokenScore(query: string, value: string): number {
  if (!query || !value) return 0;
  if (value === query) return 1;
  if (value.startsWith(query)) return 0.9;
  if (value.includes(query)) return 0.8;

  let queryIndex = 0;
  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] === query[queryIndex]) {
      queryIndex += 1;
    }
  }
  return queryIndex === query.length ? 0.45 : 0;
}

function scoreRecord(record: BookmarkRecord, metadata: BookmarkMetadata, rawQuery: string): number {
  const query = cleanText(rawQuery);
  if (!query) {
    const favoriteBoost = metadata.favorite ? 50 : 0;
    const openBoost = Math.min(metadata.openCount ?? 0, 10) * 2;
    const recency = record.dateAdded ? Math.max(0, 20 - (Date.now() - record.dateAdded) / 86_400_000 / 30) : 0;
    return favoriteBoost + openBoost + recency;
  }

  const queryTokens = tokens(query);
  const title = cleanText(record.title);
  const domain = cleanText(record.domain);
  const url = cleanText(record.url);
  const path = cleanText(record.currentPath);
  const category = cleanText(metadata.category ?? '');
  const description = cleanText(metadata.description ?? '');
  const note = cleanText(metadata.note ?? '');
  const tagText = cleanText(metadata.tags.join(' '));

  let score = 0;
  if (title.includes(query)) score += 90;
  if (tagText.includes(query)) score += 70;
  if (category.includes(query)) score += 60;
  if (description.includes(query)) score += 55;
  if (note.includes(query)) score += 55;
  if (domain.includes(query)) score += 45;
  if (path.includes(query)) score += 35;
  if (url.includes(query)) score += 25;

  const fields = [
    { value: title, weight: 32 },
    { value: tagText, weight: 26 },
    { value: description, weight: 22 },
    { value: note, weight: 22 },
    { value: category, weight: 20 },
    { value: domain, weight: 18 },
    { value: path, weight: 12 },
  ];

  for (const token of queryTokens) {
    let best = 0;
    for (const field of fields) {
      for (const fieldToken of tokens(field.value)) {
        best = Math.max(best, fuzzyTokenScore(token, fieldToken) * field.weight);
      }
    }
    score += best;
  }

  if (metadata.favorite) score += 5;
  score += Math.min(metadata.openCount ?? 0, 8) * 0.5;
  return score;
}

export function searchBookmarks(
  records: BookmarkRecord[],
  metadataMap: BookmarkMetadataMap,
  query: string,
  filter: SearchFilter,
  limit = 100,
): SearchHit[] {
  const duplicateIds = filter === 'duplicates' ? findDuplicateIds(records) : new Set<string>();
  const recentCutoff = Date.now() - 30 * 86_400_000;

  return records
    .filter((record) => {
      const metadata = mergeMetadata(record, metadataMap[record.id]);
      if (filter === 'recent') return Boolean(record.dateAdded && record.dateAdded >= recentCutoff);
      if (filter === 'favorites') return Boolean(metadata.favorite);
      if (filter === 'unsorted') return !metadata.category && !record.managed;
      if (filter === 'duplicates') return duplicateIds.has(record.id);
      return true;
    })
    .map((record) => {
      const metadata = mergeMetadata(record, metadataMap[record.id]);
      return { record, metadata, score: scoreRecord(record, metadata, query) };
    })
    .filter((hit) => !query.trim() || hit.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.record.dateAdded ?? 0) - (a.record.dateAdded ?? 0);
    })
    .slice(0, limit);
}

export function countCategories(records: BookmarkRecord[], metadataMap: BookmarkMetadataMap): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const category = mergeMetadata(record, metadataMap[record.id]).category;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}
