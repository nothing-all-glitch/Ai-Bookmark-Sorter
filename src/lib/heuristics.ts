import { BASE_TAXONOMY, closestTaxonomyFolder } from './taxonomy';
import type { BookmarkCandidate, Classification } from './types';

const CATEGORY_RULES: Array<{ folder: (typeof BASE_TAXONOMY)[number]; score: number; words: string[] }> = [
  {
    folder: 'Development',
    score: 0.82,
    words: ['github', 'gitlab', 'stackoverflow', 'stack overflow', 'npm', 'react', 'vue', 'angular', 'developer', 'docs', 'api', 'code', 'typescript', 'javascript', 'python', 'rust'],
  },
  {
    folder: 'AI & Tools',
    score: 0.8,
    words: ['openai', 'chatgpt', 'gemini', 'claude', 'perplexity', 'huggingface', 'replicate', 'midjourney', 'cursor', 'ai', 'llm'],
  },
  {
    folder: 'Learning',
    score: 0.75,
    words: ['course', 'learn', 'tutorial', 'university', 'khan', 'coursera', 'udemy', 'edx', 'docs', 'guide', 'manual'],
  },
  {
    folder: 'Work',
    score: 0.74,
    words: ['slack', 'notion', 'asana', 'jira', 'linear', 'trello', 'docs.google', 'drive.google', 'office', 'teams', 'zoom', 'calendar'],
  },
  {
    folder: 'Finance',
    score: 0.78,
    words: ['bank', 'paypal', 'stripe', 'wise', 'finance', 'tax', 'invoice', 'wallet', 'crypto', 'coinbase', 'binance', 'trading'],
  },
  {
    folder: 'Shopping',
    score: 0.76,
    words: ['amazon', 'ebay', 'etsy', 'shop', 'store', 'cart', 'aliexpress', 'temu', 'walmart', 'bestbuy'],
  },
  {
    folder: 'Travel',
    score: 0.78,
    words: ['flight', 'hotel', 'airbnb', 'booking', 'maps', 'travel', 'trip', 'visa', 'airline', 'expedia'],
  },
  {
    folder: 'News',
    score: 0.72,
    words: ['news', 'nytimes', 'bbc', 'cnn', 'guardian', 'reuters', 'ycombinator', 'hacker news', 'medium', 'substack'],
  },
  {
    folder: 'Entertainment',
    score: 0.72,
    words: ['youtube', 'netflix', 'spotify', 'movie', 'music', 'game', 'twitch', 'imdb', 'podcast'],
  },
  {
    folder: 'Social',
    score: 0.7,
    words: ['twitter', 'x.com', 'facebook', 'instagram', 'reddit', 'linkedin', 'discord', 'social', 'tiktok'],
  },
];

export function heuristicClassify(bookmarks: BookmarkCandidate[], taxonomy: string[]): Classification[] {
  return bookmarks.map((bookmark) => {
    const haystack = `${bookmark.title} ${bookmark.domain} ${bookmark.url} ${bookmark.currentPath}`.toLowerCase();
    let best = { folder: 'Other', confidence: 0.58, reason: 'No strong keyword match; placed in Other.' };

    for (const rule of CATEGORY_RULES) {
      const match = rule.words.find((word) => haystack.includes(word));
      if (match && rule.score > best.confidence) {
        best = {
          folder: rule.folder,
          confidence: rule.score,
          reason: `Matched "${match}" in title, domain, URL, or current path.`,
        };
      }
    }

    return {
      bookmarkId: bookmark.id,
      folder: closestTaxonomyFolder(best.folder, taxonomy),
      confidence: best.confidence,
      provider: 'heuristic',
      reason: best.reason,
    };
  });
}
