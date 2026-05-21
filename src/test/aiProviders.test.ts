import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createChromeAiProvider,
  getChromeAiAvailability,
  getConfiguredApiProvider,
  setupChromeAiModel,
  validateClassifications,
} from '../lib/aiProviders';
import {
  DEFAULT_SETTINGS,
  type BookmarkCandidate,
} from '../lib/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('passes expected English input and output languages to Chrome AI', async () => {
    const availability = vi.fn().mockResolvedValue('available');
    const prompt = vi.fn().mockResolvedValue(
      JSON.stringify({
        classifications: [
          {
            bookmarkId: '1',
            folder: 'Development',
            confidence: 0.85,
            reason: 'Developer documentation',
          },
        ],
      }),
    );
    const destroy = vi.fn();
    const create = vi.fn().mockResolvedValue({ prompt, destroy });

    vi.stubGlobal('LanguageModel', { availability, create });

    const provider = createChromeAiProvider();
    await provider.classifyBatch({
      bookmarks,
      taxonomy: ['Development', 'Other'],
      settings: DEFAULT_SETTINGS,
    });

    const languageOptions = {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    };
    expect(availability).toHaveBeenCalledWith(languageOptions);
    expect(create).toHaveBeenCalledWith(languageOptions);
    expect(prompt).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('checks Chrome AI availability with the same language options', async () => {
    const availability = vi.fn().mockResolvedValue('downloadable');
    vi.stubGlobal('LanguageModel', { availability, create: vi.fn() });

    await expect(getChromeAiAvailability()).resolves.toBe('downloadable');
    expect(availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  });

  it('reports Chrome AI model setup progress', async () => {
    const availability = vi.fn().mockResolvedValue('downloadable');
    const destroy = vi.fn();
    const create = vi.fn(async (options: { monitor?: (target: EventTarget) => void }) => {
      const target = new EventTarget();
      options.monitor?.(target);
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.42 }));
      return { prompt: vi.fn(), destroy };
    });
    const onProgress = vi.fn();

    vi.stubGlobal('LanguageModel', { availability, create });

    await setupChromeAiModel(onProgress);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        monitor: expect.any(Function),
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(2);
    expect(onProgress).toHaveBeenCalledWith(42);
    expect(onProgress).toHaveBeenCalledWith(100);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
