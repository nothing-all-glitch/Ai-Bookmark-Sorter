import {
  DEFAULT_SETTINGS,
  type ActiveOperation,
  type LedgerEntry,
  type OrganizeSettings,
  type PreviewDraft,
  type RunSummary,
  type UndoPlan,
} from './types';

const SETTINGS_KEY = 'settings';
const LEDGER_KEY = 'runLedger';
const UNDO_KEY = 'lastUndoPlan';
const LAST_RUN_KEY = 'lastRunSummary';
const PREVIEW_DRAFT_KEY = 'previewDraft';
const ACTIVE_OPERATION_KEY = 'activeOperation';

type StorageShape = {
  settings?: Partial<OrganizeSettings>;
  runLedger?: LedgerEntry[];
  lastUndoPlan?: UndoPlan | null;
  lastRunSummary?: RunSummary | null;
  previewDraft?: PreviewDraft | null;
  activeOperation?: ActiveOperation | null;
};

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

async function getLocal<T extends keyof StorageShape>(key: T): Promise<StorageShape[T]> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as StorageShape[T];
  }

  const raw = globalThis.localStorage?.getItem(key);
  return raw ? (JSON.parse(raw) as StorageShape[T]) : undefined;
}

async function setLocal(values: StorageShape): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set(values);
    return;
  }

  for (const [key, value] of Object.entries(values)) {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  }
}

export async function loadSettings(): Promise<OrganizeSettings> {
  const saved = await getLocal(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(settings: OrganizeSettings): Promise<void> {
  await setLocal({ settings });
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  return (await getLocal(LEDGER_KEY)) ?? [];
}

export async function appendLedger(entries: LedgerEntry[]): Promise<void> {
  const existing = await loadLedger();
  await setLocal({ runLedger: [...existing, ...entries].slice(-5000) });
}

export async function loadUndoPlan(): Promise<UndoPlan | null> {
  return (await getLocal(UNDO_KEY)) ?? null;
}

export async function saveUndoPlan(plan: UndoPlan | null): Promise<void> {
  await setLocal({ lastUndoPlan: plan });
}

export async function loadLastRunSummary(): Promise<RunSummary | null> {
  return (await getLocal(LAST_RUN_KEY)) ?? null;
}

export async function saveLastRunSummary(summary: RunSummary | null): Promise<void> {
  await setLocal({ lastRunSummary: summary });
}

export async function loadPreviewDraft(): Promise<PreviewDraft | null> {
  return (await getLocal(PREVIEW_DRAFT_KEY)) ?? null;
}

export async function savePreviewDraft(draft: PreviewDraft | null): Promise<void> {
  await setLocal({ previewDraft: draft });
}

export async function loadActiveOperation(): Promise<ActiveOperation | null> {
  return (await getLocal(ACTIVE_OPERATION_KEY)) ?? null;
}

export async function saveActiveOperation(operation: ActiveOperation | null): Promise<void> {
  await setLocal({ activeOperation: operation });
}
