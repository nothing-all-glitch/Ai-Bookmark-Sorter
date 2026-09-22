import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { applyPreview, createPreview, undoLastRun, type PreviewResult } from '../lib/organizer';
import { findDuplicateIds, mergeMetadata, type BookmarkMetadataMap, type BookmarkRecord } from '../lib/search';
import {
  loadLastRunSummary,
  loadPreviewDraft,
  loadUndoPlan,
  savePreviewDraft,
} from '../lib/storage';
import type { PreviewItem, ProgressUpdate, RunSummary, UndoPlan } from '../lib/types';

interface OrganizeViewProps {
  records: BookmarkRecord[];
  metadataMap: BookmarkMetadataMap;
  onBulkMetadata: (updates: BookmarkMetadataMap) => void;
  onLibraryChanged: () => Promise<void>;
}

interface PreviewGroup {
  folder: string;
  items: PreviewItem[];
  selected: number;
  confidence: number;
}

const IDLE_PROGRESS: ProgressUpdate = {
  phase: 'idle',
  label: '',
  completed: 0,
  total: 1,
};

function progressValue(progress: ProgressUpdate): number {
  if (progress.total <= 0) return 0;
  return Math.round(Math.min(1, progress.completed / progress.total) * 100);
}

function groupPreview(items: PreviewItem[]): PreviewGroup[] {
  const groups = new Map<string, PreviewItem[]>();
  for (const item of items) {
    const folder = item.targetFolder.trim() || 'Other';
    const current = groups.get(folder) ?? [];
    current.push(item);
    groups.set(folder, current);
  }

  return [...groups.entries()]
    .map(([folder, groupItems]) => ({
      folder,
      items: groupItems,
      selected: groupItems.filter((item) => item.selected).length,
      confidence:
        groupItems.reduce((sum, item) => sum + item.confidence, 0) / Math.max(groupItems.length, 1),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.folder.localeCompare(b.folder));
}

export default function OrganizeView({
  records,
  metadataMap,
  onBulkMetadata,
  onLibraryChanged,
}: OrganizeViewProps) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressUpdate>(IDLE_PROGRESS);
  const [undoPlan, setUndoPlan] = useState<UndoPlan | null>(null);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    void Promise.all([loadPreviewDraft(), loadUndoPlan(), loadLastRunSummary()]).then(
      ([draft, storedUndo, storedLastRun]) => {
        if (draft) {
          setPreview(draft);
          setPreviewItems(draft.previewItems);
          setExpandedFolders(new Set(draft.expandedFolders));
        }
        setUndoPlan(storedUndo);
        setLastRun(storedLastRun);
      },
    );
  }, []);

  useEffect(() => {
    if (!preview) return;
    void savePreviewDraft({
      ...preview,
      previewItems,
      expandedFolders: [...expandedFolders],
      updatedAt: Date.now(),
    });
  }, [expandedFolders, preview, previewItems]);

  const duplicateCount = useMemo(() => findDuplicateIds(records).size, [records]);
  const managedCount = useMemo(() => records.filter((record) => record.managed).length, [records]);
  const previewGroups = useMemo(() => groupPreview(previewItems), [previewItems]);
  const selectedCount = useMemo(() => previewItems.filter((item) => item.selected).length, [previewItems]);
  const recordById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);

  function updateItem(id: string, patch: Partial<PreviewItem>): void {
    setPreviewItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function setFolderSelected(folder: string, selected: boolean): void {
    setPreviewItems((items) =>
      items.map((item) => (item.targetFolder === folder ? { ...item, selected } : item)),
    );
  }

  function toggleFolder(folder: string): void {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  function enrichMetadata(items: PreviewItem[]): void {
    const updates: BookmarkMetadataMap = {};
    for (const item of items) {
      const record = recordById.get(item.id);
      if (!record) continue;
      const base = mergeMetadata(record, metadataMap[item.id]);
      const folderTags = item.targetFolder
        .toLowerCase()
        .split(/[^a-z0-9+#.-]+/)
        .filter((tag) => tag.length > 2);

      updates[item.id] = {
        ...base,
        category: item.targetFolder,
        description: item.reason || base.description,
        tags: [...new Set([...base.tags, ...folderTags])].slice(0, 10),
        updatedAt: Date.now(),
      };
    }
    onBulkMetadata(updates);
  }

  async function handleCreatePreview(): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    pausedRef.current = false;
    setPaused(false);
    setProgress({ phase: 'scanning', label: 'Scanning bookmarks', completed: 0, total: 1 });

    try {
      const result = await createPreview({
        signal: controller.signal,
        shouldPause: () => pausedRef.current,
        onProgress: setProgress,
      });

      setPreview(result);
      setPreviewItems(result.previewItems);
      const expanded = new Set(result.previewItems.map((item) => item.targetFolder));
      setExpandedFolders(expanded);
      enrichMetadata(result.previewItems);
      setToast(
        result.previewItems.length > 0
          ? `Prepared ${result.previewItems.length} cleanup suggestions`
          : 'Everything is already organized',
      );
    } catch (error) {
      const cancelled = controller.signal.aborted;
      setProgress({
        phase: cancelled ? 'cancelled' : 'error',
        label: cancelled ? 'Cleanup scan cancelled' : error instanceof Error ? error.message : 'Cleanup scan failed',
        completed: 0,
        total: 1,
      });
      if (!cancelled) setToast(error instanceof Error ? error.message : 'Cleanup scan failed');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function handleApply(): Promise<void> {
    if (!preview || selectedCount === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    pausedRef.current = false;
    setPaused(false);
    enrichMetadata(previewItems);

    try {
      const result = await applyPreview(preview, previewItems, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setUndoPlan(result.undoPlan);
      setLastRun(result.summary);
      setPreview(null);
      setPreviewItems([]);
      setExpandedFolders(new Set());
      await savePreviewDraft(null);
      await onLibraryChanged();
      setToast(`Moved ${result.summary.applied} bookmarks. Undo is available here.`);
    } catch (error) {
      setToast(
        controller.signal.aborted
          ? 'Apply stopped. Any completed moves are still protected by the undo plan.'
          : error instanceof Error
            ? error.message
            : 'Could not apply the cleanup plan',
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function handleUndo(): Promise<void> {
    if (!undoPlan) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);

    try {
      const restored = await undoLastRun(undoPlan, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setUndoPlan(null);
      await onLibraryChanged();
      setToast(`Restored ${restored} bookmarks to their previous locations`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not undo the last cleanup');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2.6,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(139,92,246,0.14)',
              color: 'primary.light',
            }}
          >
            <CleaningServicesRoundedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h1">Clean up</Typography>
            <Typography variant="caption" color="text.secondary">
              AI-assisted organization, always previewed before anything moves.
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 0.85,
        }}
      >
        {[
          ['Bookmarks', records.length],
          ['Organized', managedCount],
          ['Duplicates', duplicateCount],
        ].map(([label, value]) => (
          <Paper key={label} sx={{ p: 1.2, borderRadius: 3, background: 'rgba(17,19,26,0.65)' }}>
            <Typography variant="h2">{value}</Typography>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper
        sx={{
          p: 1.6,
          borderRadius: 4,
          background:
            'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(255,255,255,0.025) 60%)',
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoAwesomeRoundedIcon color="primary" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h2">Generate a cleanup plan</Typography>
              <Typography variant="caption" color="text.secondary">
                Recall classifies bookmarks first and only moves the ones you approve.
              </Typography>
            </Box>
          </Stack>

          {progress.phase !== 'idle' && (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.6 }}>
                {busy ? (
                  <CircularProgress size={15} />
                ) : (
                  <CheckCircleRoundedIcon
                    sx={{ fontSize: 16, color: progress.phase === 'error' ? 'error.main' : 'success.main' }}
                  />
                )}
                <Typography variant="caption" sx={{ flex: 1 }}>
                  {progress.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {progressValue(progress)}%
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progressValue(progress)} />
            </Box>
          )}

          <Stack direction="row" spacing={0.8}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<AutoAwesomeRoundedIcon />}
              disabled={busy}
              onClick={handleCreatePreview}
            >
              {previewItems.length > 0 ? 'Regenerate plan' : 'Create cleanup plan'}
            </Button>

            {busy && (
              <Tooltip title={paused ? 'Resume' : 'Pause'}>
                <IconButton
                  onClick={() => {
                    setPaused((current) => {
                      pausedRef.current = !current;
                      return !current;
                    });
                  }}
                >
                  {paused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
                </IconButton>
              </Tooltip>
            )}
            {busy && (
              <Tooltip title="Stop">
                <IconButton color="error" onClick={() => abortRef.current?.abort()}>
                  <CloseRoundedIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {undoPlan && !busy && (
            <Button color="inherit" startIcon={<UndoRoundedIcon />} onClick={handleUndo}>
              Undo last cleanup ({undoPlan.moves.length})
            </Button>
          )}
        </Stack>
      </Paper>

      {preview && (
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h2" sx={{ flex: 1 }}>
              Review suggestions
            </Typography>
            <Chip size="small" color="primary" label={`${selectedCount} selected`} />
          </Stack>

          <Alert severity="info" variant="outlined">
            Nothing moves until you press Apply. Edit a folder name, uncheck individual bookmarks, or skip a whole group.
          </Alert>

          <Paper sx={{ overflow: 'hidden', borderRadius: 3.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 1.2, py: 0.9, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Checkbox
                size="small"
                checked={previewItems.length > 0 && selectedCount === previewItems.length}
                indeterminate={selectedCount > 0 && selectedCount < previewItems.length}
                onChange={(event) =>
                  setPreviewItems((items) => items.map((item) => ({ ...item, selected: event.target.checked })))
                }
              />
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {previewGroups.length} destination folders
              </Typography>
              <Button
                size="small"
                color="inherit"
                startIcon={<RestartAltRoundedIcon />}
                onClick={() => setPreviewItems((items) => items.map((item) => ({ ...item, selected: false })))}
              >
                Clear
              </Button>
            </Stack>

            {previewGroups.map((group) => {
              const expanded = expandedFolders.has(group.folder);
              const allSelected = group.selected === group.items.length;
              const partial = group.selected > 0 && !allSelected;

              return (
                <Box key={group.folder} sx={{ borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.7}
                    onClick={() => toggleFolder(group.folder)}
                    sx={{ px: 1, py: 0.85, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' } }}
                  >
                    {expanded ? <ExpandMoreRoundedIcon fontSize="small" /> : <ChevronRightRoundedIcon fontSize="small" />}
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={partial}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setFolderSelected(group.folder, event.target.checked)}
                    />
                    <FolderRoundedIcon sx={{ fontSize: 18, color: 'primary.light' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={800} noWrap>
                        {group.folder}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {group.items.length} bookmarks · {Math.round(group.confidence * 100)}% confidence
                      </Typography>
                    </Box>
                  </Stack>

                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    <Stack>
                      {group.items.map((item) => (
                        <Box
                          key={item.id}
                          sx={{
                            px: 1.2,
                            py: 1,
                            pl: 4.5,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                            bgcolor: item.selected ? 'rgba(139,92,246,0.035)' : 'transparent',
                          }}
                        >
                          <Stack direction="row" spacing={0.8} alignItems="flex-start">
                            <Checkbox
                              size="small"
                              checked={item.selected}
                              onChange={(event) => updateItem(item.id, { selected: event.target.checked })}
                            />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body2" fontWeight={750} noWrap title={item.title}>
                                {item.title}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {item.domain || item.url} · {item.currentPath}
                              </Typography>
                              {item.reason && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: 'block', mt: 0.45, opacity: 0.8 }}
                                >
                                  {item.reason}
                                </Typography>
                              )}
                              <TextField
                                size="small"
                                label="Destination"
                                value={item.targetFolder}
                                onChange={(event) => updateItem(item.id, { targetFolder: event.target.value })}
                                sx={{ mt: 0.8 }}
                              />
                            </Box>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  </Collapse>
                </Box>
              );
            })}
          </Paper>

          <Button
            size="large"
            variant="contained"
            disabled={busy || selectedCount === 0}
            onClick={handleApply}
            startIcon={<CheckCircleRoundedIcon />}
          >
            Apply {selectedCount} {selectedCount === 1 ? 'move' : 'moves'}
          </Button>
        </Stack>
      )}

      {!preview && lastRun && (
        <Paper sx={{ p: 1.4, borderRadius: 3, background: 'rgba(17,19,26,0.55)' }}>
          <Typography variant="body2" fontWeight={750}>
            Last cleanup
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Moved {lastRun.applied} of {lastRun.classified} suggested bookmarks.
          </Typography>
        </Paper>
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={2800} onClose={() => setToast(null)} message={toast} />
    </Stack>
  );
}
