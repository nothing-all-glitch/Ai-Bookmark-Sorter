import {
  ensureManagedFolder,
  ensureSubFolder,
  flattenBookmarkTree,
  getBookmarkTree,
  moveBookmark,
} from './bookmarks';
import {
  appendLedger,
  loadSettings,
  saveLastRunSummary,
  saveUndoPlan,
} from './storage';
import { mergeTaxonomy, normalizeFolderName } from './taxonomy';
import {
  createChromeAiProvider,
  createDirectHeuristicProvider,
  getConfiguredApiProvider,
} from './aiProviders';
import { HeuristicWorkerClient } from './workerClient';
import { hashUrl } from './url';
import type {
  AiProvider,
  BookmarkCandidate,
  BookmarkSnapshot,
  Classification,
  LedgerEntry,
  OrganizerControls,
  OrganizeSettings,
  PreviewResult,
  PreviewItem,
  ProviderNotice,
  RunSummary,
  UndoMove,
  UndoPlan,
} from './types';

export type { PreviewResult } from './types';

export interface ApplyResult {
  summary: RunSummary;
  undoPlan: UndoPlan;
}

const sleep = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was cancelled.', 'AbortError');
  }
}

function makeRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createWorkerHeuristicProvider(worker: HeuristicWorkerClient): AiProvider {
  return {
    id: 'heuristic',
    label: 'Deterministic fallback',
    classifyBatch({ bookmarks, taxonomy }) {
      return worker.classify(bookmarks, taxonomy);
    },
  };
}

export function buildProviderChain(settings: OrganizeSettings, worker = new HeuristicWorkerClient()): AiProvider[] {
  const apiProvider = getConfiguredApiProvider(settings);
  const chromeProvider = createChromeAiProvider();
  const heuristicProvider = typeof Worker === 'undefined' ? createDirectHeuristicProvider() : createWorkerHeuristicProvider(worker);

  if (settings.aiMode === 'local-only') {
    return [chromeProvider, heuristicProvider];
  }

  if (settings.aiMode === 'no-key-first') {
    return apiProvider ? [chromeProvider, apiProvider, heuristicProvider] : [chromeProvider, heuristicProvider];
  }

  return apiProvider ? [apiProvider, chromeProvider, heuristicProvider] : [chromeProvider, heuristicProvider];
}

async function classifyWithFallback(
  batch: BookmarkCandidate[],
  taxonomy: string[],
  settings: OrganizeSettings,
  providers: AiProvider[],
  controls: OrganizerControls,
): Promise<{ classifications: Classification[]; notices: ProviderNotice[] }> {
  const notices: ProviderNotice[] = [];

  for (const provider of providers) {
    assertNotAborted(controls.signal);
    try {
      const classifications = await provider.classifyBatch({
        bookmarks: batch,
        taxonomy,
        settings,
        signal: controls.signal,
      });
      if (provider.id !== providers[0]?.id) {
        const notice: ProviderNotice = {
          provider: provider.id,
          severity: 'info',
          message: `${provider.label} handled this run after another AI option was unavailable.`,
        };
        notices.push(notice);
      }
      return { classifications, notices };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      const notice: ProviderNotice = {
        provider: provider.id,
        severity: provider.id === 'heuristic' ? 'error' : 'warning',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      notices.push(notice);
    }
  }

  throw new Error('All classification providers failed.');
}

async function runConcurrently<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runOne));
  return results;
}

export async function scanBookmarks(): Promise<BookmarkSnapshot> {
  return flattenBookmarkTree(await getBookmarkTree());
}

export async function createPreview(controls: OrganizerControls = {}): Promise<PreviewResult> {
  const startedAt = Date.now();
  const runId = makeRunId();
  const settings = await loadSettings();
  const worker = new HeuristicWorkerClient();
  const notices: ProviderNotice[] = [];

  controls.onProgress?.({ phase: 'scanning', label: 'Scanning bookmarks', completed: 0, total: 1 });
  const snapshot = await scanBookmarks();
  const taxonomy = mergeTaxonomy(snapshot.folderNames);
  controls.onProgress?.({ phase: 'scanning', label: 'Bookmark scan complete', completed: 1, total: 1 });

  if (snapshot.candidates.length === 0) {
    worker.terminate();
    controls.onProgress?.({ phase: 'preview', label: 'No new bookmarks to organize', completed: 1, total: 1 });
    return { runId, snapshot, taxonomy, previewItems: [], notices, startedAt };
  }

  const providers = buildProviderChain(settings, worker);
  const batches = chunk(snapshot.candidates, Math.max(1, settings.batchSize));
  let completedBatches = 0;

  controls.onProgress?.({
    phase: 'classifying',
    label: `Classifying ${snapshot.candidates.length} bookmarks`,
    completed: 0,
    total: batches.length,
  });

  try {
    const batchResults = await runConcurrently(
      batches,
      Math.max(1, Math.min(settings.concurrency, 6)),
      async (batch) => {
        while (controls.shouldPause?.()) {
          await sleep(150);
          assertNotAborted(controls.signal);
        }

        const result = await classifyWithFallback(batch, taxonomy, settings, providers, controls);
        notices.push(...result.notices);
        completedBatches += 1;
        controls.onProgress?.({
          phase: 'classifying',
          label: `Classified batch ${completedBatches} of ${batches.length}`,
          completed: completedBatches,
          total: batches.length,
        });
        return result.classifications;
      },
    );

    const classifications = new Map(batchResults.flat().map((classification) => [classification.bookmarkId, classification]));
    const previewItems = snapshot.candidates
      .map((bookmark): PreviewItem | null => {
        const classification = classifications.get(bookmark.id);
        if (!classification) {
          return null;
        }
        return {
          ...bookmark,
          targetFolder: normalizeFolderName(classification.folder),
          confidence: classification.confidence,
          provider: classification.provider,
          reason: classification.reason,
          selected: true,
        };
      })
      .filter((item): item is PreviewItem => Boolean(item));

    controls.onProgress?.({
      phase: 'preview',
      label: `Prepared ${previewItems.length} suggested moves`,
      completed: previewItems.length,
      total: snapshot.candidates.length,
    });

    return { runId, snapshot, taxonomy, previewItems, notices: dedupeNotices(notices), startedAt };
  } finally {
    worker.terminate();
  }
}

function dedupeNotices(notices: ProviderNotice[]): ProviderNotice[] {
  const seen = new Set<string>();
  return notices.filter((notice) => {
    const key = `${notice.provider}:${notice.severity}:${notice.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function applyPreview(
  preview: PreviewResult,
  selectedItems: PreviewItem[],
  controls: OrganizerControls = {},
): Promise<ApplyResult> {
  const startedAt = preview.startedAt;
  const selected = selectedItems.filter((item) => item.selected);
  const managedFolder = await ensureManagedFolder();
  const folderCache = new Map<string, string>();
  const undoMoves: UndoMove[] = [];
  const ledgerEntries: LedgerEntry[] = [];
  let failed = 0;

  controls.onProgress?.({
    phase: 'applying',
    label: `Moving ${selected.length} bookmarks`,
    completed: 0,
    total: selected.length,
  });

  for (let index = 0; index < selected.length; index += 1) {
    assertNotAborted(controls.signal);
    const item = selected[index];
    try {
      const folderName = normalizeFolderName(item.targetFolder);
      let targetParentId = folderCache.get(folderName);
      if (!targetParentId) {
        const subfolder = await ensureSubFolder(managedFolder.id, folderName);
        targetParentId = subfolder.id;
        folderCache.set(folderName, targetParentId);
      }

      const undoMove: UndoMove = {
        bookmarkId: item.id,
        previousParentId: item.parentId,
        previousIndex: item.index,
        originalTitle: item.title,
        originalUrl: item.url,
        targetFolder: folderName,
      };

      await moveBookmark(item.id, targetParentId);
      undoMoves.push(undoMove);
      const ledgerEntry = {
        runId: preview.runId,
        bookmarkId: item.id,
        urlHash: hashUrl(item.url),
        previousParentId: item.parentId,
        previousIndex: item.index,
        targetFolder: folderName,
        provider: item.provider,
        confidence: item.confidence,
        timestamp: Date.now(),
      };
      ledgerEntries.push(ledgerEntry);
      await Promise.all([
        saveUndoPlan({
          runId: preview.runId,
          createdAt: Date.now(),
          moves: undoMoves,
        }),
        appendLedger([ledgerEntry]),
      ]);
    } catch (error) {
      failed += 1;
      controls.onNotice?.({
        provider: item.provider,
        severity: 'error',
        message: `Could not move "${item.title}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    controls.onProgress?.({
      phase: 'applying',
      label: `Moved ${index + 1 - failed} of ${selected.length} bookmarks`,
      completed: index + 1,
      total: selected.length,
    });
  }

  const undoPlan: UndoPlan = {
    runId: preview.runId,
    createdAt: Date.now(),
    moves: undoMoves,
  };

  await saveUndoPlan(undoPlan);

  const notices = preview.notices;
  const summary: RunSummary = {
    id: preview.runId,
    startedAt,
    finishedAt: Date.now(),
    totalBookmarks: preview.snapshot.totalBookmarks,
    candidates: preview.snapshot.candidates.length,
    skippedManaged: preview.snapshot.skippedManaged,
    skippedUnmodifiable: preview.snapshot.skippedUnmodifiable,
    classified: preview.previewItems.length,
    applied: ledgerEntries.length,
    failed,
    providersUsed: unique(preview.previewItems.map((item) => item.provider)),
    notices,
  };

  await saveLastRunSummary(summary);
  controls.onProgress?.({
    phase: 'complete',
    label: `Moved ${summary.applied} bookmarks`,
    completed: selected.length,
    total: selected.length,
  });

  return { summary, undoPlan };
}

export async function undoLastRun(plan: UndoPlan, controls: OrganizerControls = {}): Promise<number> {
  let restored = 0;
  controls.onProgress?.({
    phase: 'applying',
    label: `Restoring ${plan.moves.length} bookmarks`,
    completed: 0,
    total: plan.moves.length,
  });

  for (let index = 0; index < plan.moves.length; index += 1) {
    assertNotAborted(controls.signal);
    const move = plan.moves[index];
    try {
      await moveBookmark(move.bookmarkId, move.previousParentId, move.previousIndex);
      restored += 1;
    } catch (error) {
      controls.onNotice?.({
        provider: 'heuristic',
        severity: 'error',
        message: `Could not restore "${move.originalTitle}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    controls.onProgress?.({
      phase: 'applying',
      label: `Restored ${restored} of ${plan.moves.length} bookmarks`,
      completed: index + 1,
      total: plan.moves.length,
    });
  }

  await saveUndoPlan(null);
  return restored;
}
