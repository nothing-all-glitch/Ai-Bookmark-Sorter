import { describe, expect, it } from 'vitest';
import {
  getConfiguredApiProvider,
  validateClassifications,
} from '../lib/aiProviders';
import {
  DEFAULT_SETTINGS,
  type BookmarkCandidate,
} from '../lib/types';

const bookmarks: BookmarkCandidate[] = [
  {
    id: '1',
    title: 'React Docs',
    url: 'https://react.dev',
    domain: 'react.dev',
    parentId: '10',
    index: 0,
    currentPath: 'Bookmarks Bar',
  },
];

describe('AI provider helpers', () => {
  it('validates strict model JSON', () => {
    const result = validateClassifications(
      {
        classifications: [
          {
            bookmarkId: '1',
            folder: 'development',
            confidence: 0.9,
            reason: 'Docs for a JavaScript framework',
          },
        ],
      },
      bookmarks,
      ['Development', 'Other'],
      'gemini',
      0.55,
      true,
    );

    expect(result).toEqual([
      {
        bookmarkId: '1',
        folder: 'Development',
        confidence: 0.9,
        provider: 'gemini',
        reason: 'Docs for a JavaScript framework',
      },
    ]);
  });

  it('rejects malformed model JSON', () => {
    expect(() =>
      validateClassifications(
        {
          classifications: [{ bookmarkId: 'missing', folder: 'Dev', confidence: 0.9 }],
        },
        bookmarks,
        ['Development', 'Other'],
        'gemini',
        0.55,
        true,
      ),
    ).toThrow(/unknown bookmark/i);
  });

  it('uses Gemini as the configured API provider when a key exists', () => {
    const provider = getConfiguredApiProvider({
      ...DEFAULT_SETTINGS,
      geminiApiKey: 'test-key',
    });

    expect(provider?.id).toBe('gemini');
  });

  it('omits API providers when no key is saved', () => {
    expect(getConfiguredApiProvider(DEFAULT_SETTINGS)).toBeNull();
  });
});
