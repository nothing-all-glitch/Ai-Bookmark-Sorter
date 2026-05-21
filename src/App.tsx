import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import CancelIcon from '@mui/icons-material/Cancel';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import KeyIcon from '@mui/icons-material/Key';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PreviewIcon from '@mui/icons-material/Preview';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  getChromeAiAvailability,
  setupChromeAiModel,
  type ChromeAiAvailability,
} from './lib/aiProviders';
import {
  applyPreview,
  createPreview,
  scanBookmarks,
  undoLastRun,
  type PreviewResult,
} from './lib/organizer';
import {
  loadLastRunSummary,
  loadSettings,
  loadUndoPlan,
  saveSettings,
} from './lib/storage';
import {
  DEFAULT_SETTINGS,
  MANAGED_FOLDER_NAME,
  type BookmarkSnapshot,
  type OrganizeSettings,
  type PreviewItem,
  type ProgressUpdate,
  type ProviderNotice,
  type RunSummary,
  type UndoPlan,
} from './lib/types';

const idleProgress: ProgressUpdate = {
  phase: 'idle',
  label: 'Ready',
  completed: 0,
  total: 1,
};

function formatDate(value?: number): string {
  if (!value) {
    return 'Never';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    gemini: 'Gemini',
    'openai-compatible': 'API',
    'chrome-ai': 'Chrome AI',
    heuristic: 'Fallback',
  };
  return labels[provider] ?? provider;
}

function progressValue(progress: ProgressUpdate): number {
  if (progress.total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((progress.completed / progress.total) * 100));
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ color: 'primary.main', display: 'grid', placeItems: 'center' }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h2" noWrap>
            {value}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function ProviderChip({ provider }: { provider: string }) {
  const color = provider === 'heuristic' ? 'warning' : provider === 'chrome-ai' ? 'success' : 'primary';
  return <Chip size="small" label={providerLabel(provider)} color={color} variant="outlined" />;
}

function addNoticeOnce(current: ProviderNotice[], notice: ProviderNotice): ProviderNotice[] {
  const exists = current.some(
    (item) => item.provider === notice.provider && item.severity === notice.severity && item.message === notice.message,
  );
  return exists ? current : [notice, ...current].slice(0, 4);
}

function friendlyRunNotices(notices: ProviderNotice[], items: PreviewItem[]): ProviderNotice[] {
  const failedAiProviders = new Set(
    notices
      .filter((notice) => notice.provider !== 'heuristic' && notice.severity !== 'info')
      .map((notice) => notice.provider),
  );
  const usedLocalSorting = items.some((item) => item.provider === 'heuristic');

  if (usedLocalSorting && failedAiProviders.size > 1) {
    return [
      {
        provider: 'heuristic',
        severity: 'info',
        message: 'Used local sorting for this run because the online or browser AI options were not ready. You can review every suggested move before applying.',
      },
    ];
  }

  if (usedLocalSorting && failedAiProviders.has('chrome-ai')) {
    return [];
  }

  if (usedLocalSorting && failedAiProviders.size > 0) {
    return [
      {
        provider: 'heuristic',
        severity: 'info',
        message: 'Used local sorting for this run because the selected AI service was unavailable. Your preview is ready to review.',
      },
    ];
  }

  return [];
}

function chromeAiStatusText(status: ChromeAiAvailability): string {
  const labels: Record<ChromeAiAvailability, string> = {
    available: 'Ready',
    downloadable: 'Needs setup',
    downloading: 'Download pending',
    unavailable: 'Unavailable',
    unsupported: 'Unsupported',
  };
  return labels[status];
}

function chromeAiHelpText(status: ChromeAiAvailability): string {
  const labels: Record<ChromeAiAvailability, string> = {
    available: 'Chrome AI is ready for local bookmark sorting.',
    downloadable: 'Download the local AI model once to use browser-based AI sorting.',
    downloading: 'Chrome is preparing the local AI model.',
    unavailable: 'This Chrome profile or device does not currently support built-in AI.',
    unsupported: 'This browser does not expose Chrome built-in AI.',
  };
  return labels[status];
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState<OrganizeSettings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = useState<BookmarkSnapshot | null>(null);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [undoPlan, setUndoPlan] = useState<UndoPlan | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate>(idleProgress);
  const [notices, setNotices] = useState<ProviderNotice[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [chromeAiAvailability, setChromeAiAvailability] = useState<ChromeAiAvailability>('unsupported');
  const [chromeAiSetupBusy, setChromeAiSetupBusy] = useState(false);
  const [chromeAiSetupProgress, setChromeAiSetupProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const selectedCount = useMemo(() => previewItems.filter((item) => item.selected).length, [previewItems]);
  const previewGroups = useMemo(() => {
    const groups = new Map<string, PreviewItem[]>();
    for (const item of previewItems) {
      const folder = item.targetFolder.trim() || 'Other';
      groups.set(folder, [...(groups.get(folder) ?? []), item]);
    }
    return [...groups.entries()]
      .map(([folder, items]) => ({
        folder,
        items: [...items].sort((a, b) => a.title.localeCompare(b.title)),
        selected: items.filter((item) => item.selected).length,
        confidence: items.reduce((total, item) => total + item.confidence, 0) / items.length,
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder));
  }, [previewItems]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      const [savedSettings, initialSnapshot, summary, undo, aiAvailability] = await Promise.all([
        loadSettings(),
        scanBookmarks(),
        loadLastRunSummary(),
        loadUndoPlan(),
        getChromeAiAvailability(),
      ]);
      if (!mounted) {
        return;
      }
      setSettings(savedSettings);
      setSnapshot(initialSnapshot);
      setLastRun(summary);
      setUndoPlan(undo);
      setChromeAiAvailability(aiAvailability);
    }
    boot().catch((error) => {
      setNotices([{ provider: 'heuristic', severity: 'error', message: error instanceof Error ? error.message : 'Startup failed' }]);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  async function refreshSnapshot() {
    setSnapshot(await scanBookmarks());
  }

  async function refreshChromeAiStatus() {
    setChromeAiAvailability(await getChromeAiAvailability());
  }

  function makeControls() {
    const controller = new AbortController();
    abortRef.current = controller;
    return {
      signal: controller.signal,
      shouldPause: () => pausedRef.current,
      onProgress: setProgress,
      onNotice: (notice: ProviderNotice) => setNotices((current) => addNoticeOnce(current, notice)),
    };
  }

  async function handleCreatePreview() {
    setBusy(true);
    setPaused(false);
    setPreview(null);
    setPreviewItems([]);
    setNotices([]);
    setProgress({ phase: 'scanning', label: 'Scanning bookmarks', completed: 0, total: 1 });

    try {
      const result = await createPreview(makeControls());
      setPreview(result);
      setPreviewItems(result.previewItems);
      setSnapshot(result.snapshot);
      setExpandedFolders(new Set(result.previewItems.map((item) => item.targetFolder)));
      setNotices(friendlyRunNotices(result.notices, result.previewItems));
      setTab(1);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setProgress({ phase: 'cancelled', label: 'Cancelled', completed: 0, total: 1 });
      } else {
        setProgress({ phase: 'error', label: error instanceof Error ? error.message : 'Preview failed', completed: 0, total: 1 });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function handleApply() {
    if (!preview) {
      return;
    }
    setBusy(true);
    setPaused(false);
    try {
      const result = await applyPreview(preview, previewItems, makeControls());
      setLastRun(result.summary);
      setUndoPlan(result.undoPlan);
      setPreview(null);
      setPreviewItems([]);
      await refreshSnapshot();
      setTab(0);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setProgress({ phase: 'cancelled', label: 'Cancelled', completed: 0, total: 1 });
      } else {
        setProgress({ phase: 'error', label: error instanceof Error ? error.message : 'Apply failed', completed: 0, total: 1 });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function handleUndo() {
    if (!undoPlan) {
      return;
    }
    setBusy(true);
    try {
      const restored = await undoLastRun(undoPlan, makeControls());
      setUndoPlan(null);
      setNotices((current) => [
        { provider: 'heuristic', severity: 'info', message: `Restored ${restored} bookmarks from the last run.` },
        ...current,
      ]);
      await refreshSnapshot();
    } catch (error) {
      setProgress({ phase: 'error', label: error instanceof Error ? error.message : 'Undo failed', completed: 0, total: 1 });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function handleSaveSettings() {
    await saveSettings(settings);
    setSaved(true);
    globalThis.setTimeout(() => setSaved(false), 1800);
  }

  function updatePreviewItem(id: string, patch: Partial<PreviewItem>) {
    setPreviewItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function toggleFolder(folder: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }

  function setFolderSelected(folder: string, selected: boolean) {
    setPreviewItems((items) => items.map((item) => (item.targetFolder === folder ? { ...item, selected } : item)));
  }

  async function handleSetupChromeAi() {
    setChromeAiSetupBusy(true);
    setChromeAiSetupProgress(0);
    setNotices([]);

    try {
      await setupChromeAiModel(setChromeAiSetupProgress);
      await refreshChromeAiStatus();
      setNotices((current) =>
        addNoticeOnce(current, {
          provider: 'chrome-ai',
          severity: 'success',
          message: 'Chrome AI is ready. Future runs can use browser-based sorting before local fallback.',
        }),
      );
    } catch {
      await refreshChromeAiStatus();
      setNotices((current) =>
        addNoticeOnce(current, {
          provider: 'chrome-ai',
          severity: 'warning',
          message: 'Chrome AI could not finish setup right now. Local sorting is still available.',
        }),
      );
    } finally {
      setChromeAiSetupBusy(false);
    }
  }

  const apiKeyConfigured = settings.apiProvider === 'gemini' ? Boolean(settings.geminiApiKey.trim()) : Boolean(settings.customApiKey.trim());

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: 56 }}>
          <AutoAwesomeIcon color="primary" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h1" noWrap>
              Bookmark Organizer
            </Typography>
          </Box>
          <Tooltip title="Refresh bookmark count">
            <IconButton aria-label="Refresh bookmark count" onClick={refreshSnapshot} disabled={busy}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth">
          <Tab icon={<BookmarkAddedIcon />} iconPosition="start" label="Dashboard" />
          <Tab icon={<PreviewIcon />} iconPosition="start" label="Preview" />
          <Tab icon={<SettingsIcon />} iconPosition="start" label="Settings" />
        </Tabs>
      </AppBar>

      <Stack spacing={2} sx={{ p: 2, pb: 4 }}>
        {progress.phase !== 'idle' && (
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                {busy ? <CircularProgress size={18} /> : <CheckCircleIcon color={progress.phase === 'error' ? 'error' : 'success'} fontSize="small" />}
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {progress.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {progressValue(progress)}%
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progressValue(progress)} />
            </Stack>
          </Paper>
        )}

        {notices.map((notice, index) => (
          <Alert key={`${notice.provider}-${index}-${notice.message}`} severity={notice.severity}>
            {notice.message}
          </Alert>
        ))}

        {tab === 0 && (
          <Stack spacing={2}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 1.25,
              }}
            >
              <Stat label="Bookmarks" value={snapshot?.totalBookmarks ?? '-'} icon={<BookmarkAddedIcon />} />
              <Stat label="Ready" value={snapshot?.candidates.length ?? '-'} icon={<AutoAwesomeIcon />} />
              <Stat label="Managed" value={snapshot?.skippedManaged ?? '-'} icon={<CheckCircleIcon />} />
              <Stat label="Last Run" value={formatDate(lastRun?.finishedAt)} icon={<RestartAltIcon />} />
            </Box>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <SmartToyIcon color="primary" />
                  <Typography variant="h2">Provider Chain</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {settings.aiMode === 'api-first'
                    ? apiKeyConfigured
                      ? 'API key provider, Chrome built-in AI, then deterministic fallback.'
                      : 'Chrome built-in AI, then deterministic fallback until an API key is saved.'
                    : settings.aiMode === 'no-key-first'
                      ? 'Chrome built-in AI, API key provider, then deterministic fallback.'
                      : 'Chrome built-in AI, then deterministic fallback.'}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {apiKeyConfigured && settings.aiMode !== 'local-only' && <ProviderChip provider={settings.apiProvider} />}
                  <ProviderChip provider="chrome-ai" />
                  <ProviderChip provider="heuristic" />
                </Stack>
                <Divider />
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <SmartToyIcon color={chromeAiAvailability === 'available' ? 'success' : 'primary'} fontSize="small" />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700}>
                        Chrome AI: {chromeAiStatusText(chromeAiAvailability)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {chromeAiHelpText(chromeAiAvailability)}
                      </Typography>
                    </Box>
                    {(chromeAiAvailability === 'downloadable' || chromeAiAvailability === 'downloading') && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleSetupChromeAi}
                        disabled={busy || chromeAiSetupBusy}
                      >
                        Set Up
                      </Button>
                    )}
                  </Stack>
                  {chromeAiSetupBusy && (
                    <Stack spacing={0.5}>
                      <LinearProgress variant="determinate" value={chromeAiSetupProgress} />
                      <Typography variant="caption" color="text.secondary">
                        Downloading local AI model {chromeAiSetupProgress}%
                      </Typography>
                    </Stack>
                  )}
                </Stack>
                <Divider />
                <Stack direction="row" spacing={1}>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    startIcon={<PreviewIcon />}
                    onClick={handleCreatePreview}
                    disabled={busy}
                  >
                    Preview Organization
                  </Button>
                  {busy && (
                    <Tooltip title={paused ? 'Resume' : 'Pause'}>
                      <IconButton aria-label={paused ? 'Resume' : 'Pause'} onClick={() => setPaused((value) => !value)}>
                        {paused ? <PlayArrowIcon /> : <PauseIcon />}
                      </IconButton>
                    </Tooltip>
                  )}
                  {busy && (
                    <Tooltip title="Cancel">
                      <IconButton aria-label="Cancel" onClick={() => abortRef.current?.abort()} color="error">
                        <CancelIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
                <Button
                  variant="outlined"
                  startIcon={<RestartAltIcon />}
                  onClick={handleUndo}
                  disabled={busy || !undoPlan}
                >
                  Undo Last Run
                </Button>
              </Stack>
            </Paper>

            {lastRun && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography variant="h2">Last Run Summary</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Applied {lastRun.applied} of {lastRun.classified} suggested moves. Skipped {lastRun.skippedManaged} already inside{' '}
                    {MANAGED_FOLDER_NAME}.
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {lastRun.providersUsed.map((provider) => (
                      <ProviderChip key={provider} provider={provider} />
                    ))}
                  </Stack>
                </Stack>
              </Paper>
            )}
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <PreviewIcon color="primary" />
                  <Typography variant="h2" sx={{ flex: 1 }}>
                    Proposed Moves
                  </Typography>
                  <Chip label={`${selectedCount} selected`} size="small" color="primary" variant="outlined" />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    startIcon={<BookmarkAddedIcon />}
                    onClick={handleApply}
                    disabled={busy || selectedCount === 0 || !preview}
                  >
                    Apply Selected
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<DeleteSweepIcon />}
                    onClick={() => setPreviewItems((items) => items.map((item) => ({ ...item, selected: false })))}
                    disabled={busy || previewItems.length === 0}
                  >
                    Clear
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Checkbox
                  size="small"
                  checked={previewItems.length > 0 && selectedCount === previewItems.length}
                  indeterminate={selectedCount > 0 && selectedCount < previewItems.length}
                  onChange={(event) => setPreviewItems((items) => items.map((item) => ({ ...item, selected: event.target.checked })))}
                  inputProps={{ 'aria-label': 'Select all suggested moves' }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {previewGroups.length} folders
                </Typography>
              </Stack>

              {previewGroups.length > 0 ? (
                <List disablePadding>
                  {previewGroups.map((group) => {
                    const expanded = expandedFolders.has(group.folder);
                    const allSelected = group.selected === group.items.length;
                    const partiallySelected = group.selected > 0 && !allSelected;

                    return (
                      <Box key={group.folder}>
                        <ListItemButton
                          dense
                          onClick={() => toggleFolder(group.folder)}
                          sx={{ borderBottom: expanded ? '1px solid' : 0, borderColor: 'divider', minHeight: 42 }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                          </ListItemIcon>
                          <Checkbox
                            size="small"
                            checked={allSelected}
                            indeterminate={partiallySelected}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setFolderSelected(group.folder, event.target.checked)}
                            inputProps={{ 'aria-label': `Select ${group.folder}` }}
                            sx={{ mr: 0.5 }}
                          />
                          <ListItemIcon sx={{ minWidth: 32, color: 'primary.main' }}>
                            <FolderIcon fontSize="small" />
                          </ListItemIcon>
                          <ListItemText
                            primary={group.folder}
                            secondary={`${group.items.length} bookmarks • ${group.selected} selected`}
                            primaryTypographyProps={{ noWrap: true, fontWeight: 700 }}
                            secondaryTypographyProps={{ noWrap: true }}
                          />
                          <Chip size="small" variant="outlined" label={`${Math.round(group.confidence * 100)}%`} />
                        </ListItemButton>

                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <List disablePadding>
                            {group.items.map((item) => (
                              <Box
                                key={item.id}
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: '32px 28px minmax(0, 1fr)',
                                  gap: 0.5,
                                  alignItems: 'start',
                                  px: 1,
                                  py: 1,
                                  pl: 5,
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                  bgcolor: item.selected ? 'action.hover' : 'transparent',
                                }}
                              >
                                <Checkbox
                                  size="small"
                                  checked={item.selected}
                                  onChange={(event) => updatePreviewItem(item.id, { selected: event.target.checked })}
                                  inputProps={{ 'aria-label': `Select ${item.title}` }}
                                />
                                <BookmarkIcon fontSize="small" color="action" sx={{ mt: 0.75 }} />
                                <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={700} noWrap title={item.title} sx={{ flex: 1 }}>
                                      {item.title}
                                    </Typography>
                                    <ProviderChip provider={item.provider} />
                                  </Stack>
                                  <Typography variant="caption" color="text.secondary" noWrap title={`${item.domain} • ${item.currentPath}`}>
                                    {item.domain || item.url} • {item.currentPath}
                                  </Typography>
                                  <TextField
                                    size="small"
                                    label="Folder"
                                    value={item.targetFolder}
                                    onChange={(event) => updatePreviewItem(item.id, { targetFolder: event.target.value })}
                                    inputProps={{ 'aria-label': `Target folder for ${item.title}` }}
                                  />
                                </Stack>
                              </Box>
                            ))}
                          </List>
                        </Collapse>
                      </Box>
                    );
                  })}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                  No preview yet.
                </Typography>
              )}
            </Paper>
          </Stack>
        )}

        {tab === 2 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <SettingsIcon color="primary" />
                <Typography variant="h2">Settings</Typography>
              </Stack>

              <FormControl fullWidth size="small">
                <InputLabel id="ai-mode-label">AI Mode</InputLabel>
                <Select
                  labelId="ai-mode-label"
                  label="AI Mode"
                  value={settings.aiMode}
                  onChange={(event) => setSettings({ ...settings, aiMode: event.target.value as OrganizeSettings['aiMode'] })}
                >
                  <MenuItem value="api-first">API key first</MenuItem>
                  <MenuItem value="no-key-first">No-key first</MenuItem>
                  <MenuItem value="local-only">Local only</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel id="api-provider-label">API Provider</InputLabel>
                <Select
                  labelId="api-provider-label"
                  label="API Provider"
                  value={settings.apiProvider}
                  onChange={(event) => setSettings({ ...settings, apiProvider: event.target.value as OrganizeSettings['apiProvider'] })}
                  disabled={settings.aiMode === 'local-only'}
                >
                  <MenuItem value="gemini">Gemini</MenuItem>
                  <MenuItem value="openai-compatible">OpenAI-compatible</MenuItem>
                </Select>
              </FormControl>

              {settings.apiProvider === 'gemini' && (
                <Stack spacing={1.5}>
                  <TextField
                    size="small"
                    label="Gemini Model"
                    value={settings.geminiModel}
                    onChange={(event) => setSettings({ ...settings, geminiModel: event.target.value })}
                    disabled={settings.aiMode === 'local-only'}
                  />
                  <TextField
                    size="small"
                    label="Gemini API Key"
                    type={showGeminiKey ? 'text' : 'password'}
                    value={settings.geminiApiKey}
                    onChange={(event) => setSettings({ ...settings, geminiApiKey: event.target.value })}
                    disabled={settings.aiMode === 'local-only'}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <KeyIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={showGeminiKey ? 'Hide Gemini key' : 'Show Gemini key'}
                            onClick={() => setShowGeminiKey((value) => !value)}
                            edge="end"
                          >
                            {showGeminiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Stack>
              )}

              {settings.apiProvider === 'openai-compatible' && (
                <Stack spacing={1.5}>
                  <TextField
                    size="small"
                    label="Endpoint"
                    value={settings.customEndpoint}
                    onChange={(event) => setSettings({ ...settings, customEndpoint: event.target.value })}
                    disabled={settings.aiMode === 'local-only'}
                  />
                  <TextField
                    size="small"
                    label="Model"
                    value={settings.customModel}
                    onChange={(event) => setSettings({ ...settings, customModel: event.target.value })}
                    disabled={settings.aiMode === 'local-only'}
                  />
                  <TextField
                    size="small"
                    label="API Key"
                    type={showCustomKey ? 'text' : 'password'}
                    value={settings.customApiKey}
                    onChange={(event) => setSettings({ ...settings, customApiKey: event.target.value })}
                    disabled={settings.aiMode === 'local-only'}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <KeyIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={showCustomKey ? 'Hide API key' : 'Show API key'}
                            onClick={() => setShowCustomKey((value) => !value)}
                            edge="end"
                          >
                            {showCustomKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Stack>
              )}

              <Box>
                <Typography variant="body2" fontWeight={700}>
                  Minimum Confidence: {Math.round(settings.minConfidence * 100)}%
                </Typography>
                <Slider
                  min={0.35}
                  max={0.9}
                  step={0.05}
                  value={settings.minConfidence}
                  onChange={(_, value) => setSettings({ ...settings, minConfidence: Number(value) })}
                />
              </Box>

              <Stack direction="row" spacing={1.5}>
                <TextField
                  size="small"
                  label="Batch Size"
                  type="number"
                  value={settings.batchSize}
                  onChange={(event) => setSettings({ ...settings, batchSize: Math.max(4, Number(event.target.value)) })}
                  inputProps={{ min: 4, max: 50 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Concurrency"
                  type="number"
                  value={settings.concurrency}
                  onChange={(event) => setSettings({ ...settings, concurrency: Math.max(1, Number(event.target.value)) })}
                  inputProps={{ min: 1, max: 6 }}
                  sx={{ flex: 1 }}
                />
              </Stack>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.allowNewFolders}
                    onChange={(event) => setSettings({ ...settings, allowNewFolders: event.target.checked })}
                  />
                }
                label="Allow new AI folders"
              />

              <Alert severity="info">API keys are stored only in this browser profile with chrome.storage.local.</Alert>

              <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveSettings}>
                {saved ? 'Saved' : 'Save Settings'}
              </Button>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}
