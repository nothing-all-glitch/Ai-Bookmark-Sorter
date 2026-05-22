export const MANAGED_FOLDER_NAME = 'AI Organized Bookmarks';

export type AiMode = 'api-first' | 'no-key-first' | 'local-only';
export type ApiProvider = 'gemini' | 'openai-compatible';
export type ProviderId = 'gemini' | 'openai-compatible' | 'chrome-ai' | 'heuristic';
export type ProgressPhase = 'idle' | 'scanning' | 'classifying' | 'preview' | 'applying' | 'setup' | 'complete' | 'cancelled' | 'error';

export interface OrganizeSettings {
  aiMode: AiMode;
  apiProvider: ApiProvider;
  geminiApiKey: string;
  geminiModel: string;
  customApiKey: string;
  customEndpoint: string;
  customModel: string;
  minConfidence: number;
  batchSize: number;
  concurrency: number;
  allowNewFolders: boolean;
}

export const DEFAULT_SETTINGS: OrganizeSettings = {
  aiMode: 'api-first',
  apiProvider: 'gemini',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-lite',
  customApiKey: '',
  customEndpoint: 'https://api.openai.com/v1/chat/completions',
  customModel: 'gpt-4.1-mini',
  minConfidence: 0.55,
  batchSize: 16,
  concurrency: 3,
  allowNewFolders: true,
};

export interface BookmarkTreeNodeLike {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  unmodifiable?: string;
  folderType?: string;
  children?: BookmarkTreeNodeLike[];
}

export interface BookmarkCandidate {
  id: string;
  title: string;
  url: string;
  domain: string;
  parentId: string;
  index: number;
  currentPath: string;
  dateAdded?: number;
}

export interface BookmarkSnapshot {
  totalBookmarks: number;
  candidates: BookmarkCandidate[];
  folderNames: string[];
  managedFolderId?: string;
  skippedManaged: number;
  skippedUnmodifiable: number;
}

export interface Classification {
  bookmarkId: string;
  folder: string;
  confidence: number;
  provider: ProviderId;
  reason?: string;
}

export interface PreviewItem extends BookmarkCandidate {
  targetFolder: string;
  confidence: number;
  provider: ProviderId;
  reason?: string;
  selected: boolean;
}

export interface ProviderNotice {
  provider: ProviderId;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

export interface PreviewResult {
  runId: string;
  snapshot: BookmarkSnapshot;
  taxonomy: string[];
  previewItems: PreviewItem[];
  notices: ProviderNotice[];
  startedAt: number;
}

export interface PreviewDraft extends PreviewResult {
  expandedFolders: string[];
  updatedAt: number;
}

export interface ProgressUpdate {
  phase: ProgressPhase;
  label: string;
  completed: number;
  total: number;
}

export type ActiveOperationKind = 'preview' | 'apply' | 'undo' | 'chrome-ai-setup';

export interface ActiveOperation {
  id: string;
  kind: ActiveOperationKind;
  label: string;
  progress: ProgressUpdate;
  startedAt: number;
  updatedAt: number;
}

export interface RunSummary {
  id: string;
  startedAt: number;
  finishedAt: number;
  totalBookmarks: number;
  candidates: number;
  skippedManaged: number;
  skippedUnmodifiable: number;
  classified: number;
  applied: number;
  failed: number;
  providersUsed: ProviderId[];
  notices: ProviderNotice[];
}

export interface LedgerEntry {
  runId: string;
  bookmarkId: string;
  urlHash: string;
  previousParentId: string;
  previousIndex: number;
  targetFolder: string;
  provider: ProviderId;
  confidence: number;
  timestamp: number;
}

export interface UndoMove {
  bookmarkId: string;
  previousParentId: string;
  previousIndex: number;
  originalTitle: string;
  originalUrl: string;
  targetFolder: string;
}

export interface UndoPlan {
  runId: string;
  createdAt: number;
  moves: UndoMove[];
}

export interface ClassifyBatchInput {
  bookmarks: BookmarkCandidate[];
  taxonomy: string[];
  settings: OrganizeSettings;
  signal?: AbortSignal;
}

export interface AiProvider {
  id: ProviderId;
  label: string;
  classifyBatch(input: ClassifyBatchInput): Promise<Classification[]>;
}

export interface OrganizerControls {
  signal?: AbortSignal;
  shouldPause?: () => boolean;
  onProgress?: (update: ProgressUpdate) => void;
  onNotice?: (notice: ProviderNotice) => void;
}
