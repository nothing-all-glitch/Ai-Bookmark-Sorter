import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreview,
  buildProviderChain,
  type PreviewResult,
} from '../lib/organizer';
import { DEFAULT_SETTINGS, type PreviewItem } from '../lib/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('organizer provider chain', () => {
  it('uses API provider first when key-first mode has a Gemini key', () => {
    const providers = buildProviderChain({
      ...DEFAULT_SETTINGS,
      geminiApiKey: 'test-key',
      aiMode: 'api-first',
    });

    expect(providers.map((provider) => provider.id)).toEqual(['gemini', 'chrome-ai', 'heuristic']);
  });

  it('falls back to no-key and heuristic providers without an API key', () => {
    const providers = buildProviderChain({
      ...DEFAULT_SETTINGS,
      geminiApiKey: '',
      aiMode: 'api-first',
    });

    expect(providers.map((provider) => provider.id)).toEqual(['chrome-ai', 'heuristic']);
  });

  it('uses local-only provider order', () => {
    const providers = buildProviderChain({
      ...DEFAULT_SETTINGS,
      geminiApiKey: 'test-key',
      aiMode: 'local-only',
    });

    expect(providers.map((provider) => provider.id)).toEqual(['chrome-ai', 'heuristic']);
  });

  it('writes undo entries only for successful moves', async () => {
    const storage: Record<string, unknown> = {};
    const move = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('move failed'));

    vi.stubGlobal('chrome', {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([
          {
            id: '0',
            title: 'Root',
            children: [{ id: '2', title: 'Other Bookmarks', folderType: 'other', children: [] }],
          },
        ]),
        getChildren: vi.fn().mockResolvedValue([]),
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'managed', title: 'AI Organized Bookmarks' })
          .mockResolvedValueOnce({ id: 'dev', parentId: 'managed', title: 'Development' })
          .mockResolvedValueOnce({ id: 'news', parentId: 'managed', title: 'News' }),
        move,
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => Object.assign(storage, values)),
        },
      },
    });

    const items: PreviewItem[] = [
      {
        id: '1',
        title: 'React Docs',
        url: 'https://react.dev',
        domain: 'react.dev',
        parentId: '10',
        index: 0,
        currentPath: 'Bookmarks Bar',
        targetFolder: 'Development',
        confidence: 0.9,
        provider: 'heuristic',
        selected: true,
      },
      {
        id: '2',
        title: 'News',
        url: 'https://news.example',
        domain: 'news.example',
        parentId: '10',
        index: 1,
        currentPath: 'Bookmarks Bar',
        targetFolder: 'News',
        confidence: 0.8,
        provider: 'heuristic',
        selected: true,
      },
    ];

    const preview: PreviewResult = {
      runId: 'run-test',
      startedAt: 1,
      taxonomy: ['Development', 'News'],
      notices: [],
      previewItems: items,
      snapshot: {
        totalBookmarks: 2,
        candidates: items,
        folderNames: [],
        skippedManaged: 0,
        skippedUnmodifiable: 0,
      },
    };

    const result = await applyPreview(preview, items);

    expect(move).toHaveBeenCalledTimes(2);
    expect(result.summary.applied).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.undoPlan.moves).toHaveLength(1);
    expect(result.undoPlan.moves[0].bookmarkId).toBe('1');
  });
});
