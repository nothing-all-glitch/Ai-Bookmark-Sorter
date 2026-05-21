import { heuristicClassify } from './heuristics';
import { closestTaxonomyFolder, isValidFolderName, normalizeFolderName } from './taxonomy';
import type {
  AiProvider,
  ApiProvider,
  BookmarkCandidate,
  Classification,
  ClassifyBatchInput,
  OrganizeSettings,
  ProviderId,
} from './types';

export type ChromeAiAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export interface ApiKeyCheckResult {
  ok: boolean;
  provider: ApiProvider;
  message: string;
}

declare global {
  const LanguageModel:
    | undefined
    | {
        availability(options?: Record<string, unknown>): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
        create(options?: Record<string, unknown>): Promise<{
          prompt(input: string, options?: Record<string, unknown>): Promise<string>;
          destroy?: () => void;
        }>;
      };
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
  ) {
    super(message);
  }
}

type RawClassification = {
  bookmarkId?: unknown;
  id?: unknown;
  folder?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

const CHROME_AI_LANGUAGE_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
} as const;

function chromeAiSessionOptions(
  monitor?: (monitorTarget: EventTarget) => void,
  signal?: AbortSignal,
): Record<string, unknown> {
  return {
    ...CHROME_AI_LANGUAGE_OPTIONS,
    ...(monitor ? { monitor } : {}),
    ...(signal ? { signal } : {}),
  };
}

function buildPrompt(bookmarks: BookmarkCandidate[], taxonomy: string[], allowNewFolders: boolean): string {
  const compactBookmarks = bookmarks.map((bookmark) => ({
    bookmarkId: bookmark.id,
    title: bookmark.title,
    domain: bookmark.domain,
    url: bookmark.url,
    currentFolder: bookmark.currentPath,
  }));

  return [
    'You organize browser bookmarks into concise folder names.',
    'Return only valid JSON. No markdown. No prose.',
    'The JSON shape must be: {"classifications":[{"bookmarkId":"...","folder":"...","confidence":0.0,"reason":"short reason"}]}',
    'Confidence must be a number from 0 to 1.',
    `Use these folder names when suitable: ${taxonomy.join(', ')}.`,
    allowNewFolders
      ? 'You may propose a new folder only when it is clearly better than the supplied taxonomy.'
      : 'Do not propose new folders. Pick the closest supplied folder.',
    'Prefer broad, reusable folders over very specific one-off folders.',
    `Bookmarks: ${JSON.stringify(compactBookmarks)}`,
  ].join('\n');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('The model did not return parseable JSON.');
  }
}

export function validateClassifications(
  raw: unknown,
  bookmarks: BookmarkCandidate[],
  taxonomy: string[],
  provider: ProviderId,
  minConfidence: number,
  allowNewFolders: boolean,
): Classification[] {
  const source = raw as { classifications?: unknown };
  const values = Array.isArray(source.classifications) ? source.classifications : raw;
  if (!Array.isArray(values)) {
    throw new ProviderError('The model response did not include a classifications array.', provider);
  }

  const byId = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const seen = new Set<string>();
  const classifications = values.map((value) => {
    const item = value as RawClassification;
    const bookmarkId = typeof item.bookmarkId === 'string' ? item.bookmarkId : typeof item.id === 'string' ? item.id : '';
    const folder = typeof item.folder === 'string' ? normalizeFolderName(item.folder) : '';
    const confidence = typeof item.confidence === 'number' ? item.confidence : Number(item.confidence);
    const reason = typeof item.reason === 'string' ? item.reason.slice(0, 140) : undefined;

    if (!byId.has(bookmarkId)) {
      throw new ProviderError(`Response included an unknown bookmark id: ${bookmarkId || '<missing>'}.`, provider);
    }
    if (seen.has(bookmarkId)) {
      throw new ProviderError(`Response included duplicate bookmark id: ${bookmarkId}.`, provider);
    }
    if (!isValidFolderName(folder)) {
      throw new ProviderError(`Response included an invalid folder for bookmark ${bookmarkId}.`, provider);
    }
    if (!Number.isFinite(confidence) || confidence < minConfidence || confidence > 1) {
      throw new ProviderError(`Response confidence was out of range for bookmark ${bookmarkId}.`, provider);
    }

    seen.add(bookmarkId);
    return {
      bookmarkId,
      folder: allowNewFolders ? folder : closestTaxonomyFolder(folder, taxonomy),
      confidence,
      provider,
      reason,
    };
  });

  if (seen.size !== bookmarks.length) {
    throw new ProviderError('Response did not classify every bookmark in the batch.', provider);
  }

  return classifications;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function createGeminiProvider(): AiProvider {
  return {
    id: 'gemini',
    label: 'Gemini API',
    async classifyBatch({ bookmarks, taxonomy, settings, signal }: ClassifyBatchInput) {
      if (!settings.geminiApiKey.trim()) {
        throw new ProviderError('No Gemini API key is saved.', 'gemini');
      }

      const prompt = buildPrompt(bookmarks, taxonomy, settings.allowNewFolders);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        settings.geminiModel,
      )}:generateContent?key=${encodeURIComponent(settings.geminiApiKey.trim())}`;

      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        },
        18000,
        signal,
      );

      if (!response.ok) {
        throw new ProviderError(`Gemini returned ${response.status}: ${await response.text()}`, 'gemini');
      }

      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('');
      if (!text) {
        throw new ProviderError('Gemini returned an empty response.', 'gemini');
      }

      return validateClassifications(
        extractJson(text),
        bookmarks,
        taxonomy,
        'gemini',
        settings.minConfidence,
        settings.allowNewFolders,
      );
    },
  };
}

export function createOpenAiCompatibleProvider(): AiProvider {
  return {
    id: 'openai-compatible',
    label: 'OpenAI-compatible API',
    async classifyBatch({ bookmarks, taxonomy, settings, signal }: ClassifyBatchInput) {
      if (!settings.customApiKey.trim()) {
        throw new ProviderError('No OpenAI-compatible API key is saved.', 'openai-compatible');
      }

      const response = await fetchWithTimeout(
        settings.customEndpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.customApiKey.trim()}`,
          },
          body: JSON.stringify({
            model: settings.customModel,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: 'You classify bookmarks and return strict JSON only.',
              },
              {
                role: 'user',
                content: buildPrompt(bookmarks, taxonomy, settings.allowNewFolders),
              },
            ],
          }),
        },
        18000,
        signal,
      );

      if (!response.ok) {
        throw new ProviderError(`OpenAI-compatible provider returned ${response.status}: ${await response.text()}`, 'openai-compatible');
      }

      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        throw new ProviderError('OpenAI-compatible provider returned an empty response.', 'openai-compatible');
      }

      return validateClassifications(
        extractJson(text),
        bookmarks,
        taxonomy,
        'openai-compatible',
        settings.minConfidence,
        settings.allowNewFolders,
      );
    },
  };
}

export function createChromeAiProvider(): AiProvider {
  return {
    id: 'chrome-ai',
    label: 'Chrome built-in AI',
    async classifyBatch({ bookmarks, taxonomy, settings }: ClassifyBatchInput) {
      if (typeof LanguageModel === 'undefined') {
        throw new ProviderError('Chrome built-in AI is not available in this browser.', 'chrome-ai');
      }

      const availability = await LanguageModel.availability(CHROME_AI_LANGUAGE_OPTIONS);
      if (availability === 'unavailable') {
        throw new ProviderError('Chrome built-in AI is unavailable on this device/profile.', 'chrome-ai');
      }
      if (availability !== 'available') {
        throw new ProviderError('Chrome built-in AI needs its local model download before it can classify bookmarks.', 'chrome-ai');
      }

      const session = await LanguageModel.create(chromeAiSessionOptions());

      try {
        const text = await session.prompt(buildPrompt(bookmarks, taxonomy, settings.allowNewFolders));
        return validateClassifications(
          extractJson(text),
          bookmarks,
          taxonomy,
          'chrome-ai',
          settings.minConfidence,
          settings.allowNewFolders,
        );
      } finally {
        session.destroy?.();
      }
    },
  };
}

export async function getChromeAiAvailability(): Promise<ChromeAiAvailability> {
  if (typeof LanguageModel === 'undefined') {
    return 'unsupported';
  }
  return LanguageModel.availability(CHROME_AI_LANGUAGE_OPTIONS);
}

export async function setupChromeAiModel(
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('Chrome built-in AI is not available in this browser.');
  }

  onProgress(2);
  const session = await LanguageModel.create(
    chromeAiSessionOptions((monitorTarget) => {
      monitorTarget.addEventListener('downloadprogress', (event) => {
        const progressEvent = event as ProgressEvent;
        const loaded = Number(progressEvent.loaded);
        if (Number.isFinite(loaded)) {
          onProgress(Math.max(2, Math.min(100, Math.round(loaded * 100))));
        }
      });
    }, signal),
  );

  session.destroy?.();
  onProgress(100);
}

export function createDirectHeuristicProvider(): AiProvider {
  return {
    id: 'heuristic',
    label: 'Deterministic fallback',
    async classifyBatch({ bookmarks, taxonomy }: ClassifyBatchInput) {
      return heuristicClassify(bookmarks, taxonomy);
    },
  };
}

export function getConfiguredApiProvider(settings: OrganizeSettings): AiProvider | null {
  if (settings.apiProvider === 'openai-compatible') {
    return settings.customApiKey.trim() ? createOpenAiCompatibleProvider() : null;
  }
  return settings.geminiApiKey.trim() ? createGeminiProvider() : null;
}

export async function testApiProviderKey(
  settings: OrganizeSettings,
  signal?: AbortSignal,
): Promise<ApiKeyCheckResult> {
  const provider = getConfiguredApiProvider(settings);
  if (!provider) {
    return {
      ok: false,
      provider: settings.apiProvider,
      message: 'Add an API key to use cloud AI sorting.',
    };
  }

  const sampleBookmark: BookmarkCandidate = {
    id: 'api-key-test',
    title: 'React Docs',
    url: 'https://react.dev/reference/react',
    domain: 'react.dev',
    parentId: 'test',
    index: 0,
    currentPath: 'Bookmarks Bar',
  };

  try {
    await provider.classifyBatch({
      bookmarks: [sampleBookmark],
      taxonomy: ['Development', 'Other'],
      settings: {
        ...settings,
        allowNewFolders: false,
        minConfidence: 0.1,
      },
      signal,
    });

    return {
      ok: true,
      provider: settings.apiProvider,
      message: `${provider.label} is connected and ready.`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    return {
      ok: false,
      provider: settings.apiProvider,
      message: `${provider.label} could not be verified. Check the key, quota, and internet connection.`,
    };
  }
}
