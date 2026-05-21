import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
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
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const selectedCount = useMemo(() => previewItems.filter((item) => item.selected).length, [previewItems]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      const [savedSettings, initialSnapshot, summary, undo] = await Promise.all([
        loadSettings(),
        scanBookmarks(),
        loadLastRunSummary(),
        loadUndoPlan(),
      ]);
      if (!mounted) {
        return;
      }
      setSettings(savedSettings);
      setSnapshot(initialSnapshot);
      setLastRun(summary);
      setUndoPlan(undo);
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

  function makeControls() {
    const controller = new AbortController();
    abortRef.current = controller;
    return {
      signal: controller.signal,
      shouldPause: () => pausedRef.current,
      onProgress: setProgress,
      onNotice: (notice: ProviderNotice) => setNotices((current) => [notice, ...current].slice(0, 8)),
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
            {providerLabel(notice.provider)}: {notice.message}
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

            <TableContainer component={Paper} variant="outlined">
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={previewItems.length > 0 && selectedCount === previewItems.length}
                        indeterminate={selectedCount > 0 && selectedCount < previewItems.length}
                        onChange={(event) => setPreviewItems((items) => items.map((item) => ({ ...item, selected: event.target.checked })))}
                      />
                    </TableCell>
                    <TableCell>Bookmark</TableCell>
                    <TableCell>Folder</TableCell>
                    <TableCell>AI</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewItems.map((item) => (
                    <TableRow key={item.id} hover selected={item.selected}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={item.selected}
                          onChange={(event) => updatePreviewItem(item.id, { selected: event.target.checked })}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 180, maxWidth: 260 }}>
                        <Typography variant="body2" fontWeight={700} noWrap title={item.title}>
                          {item.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div" title={item.domain}>
                          {item.domain || item.url}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div" title={item.currentPath}>
                          {item.currentPath}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ minWidth: 150 }}>
                        <TextField
                          size="small"
                          value={item.targetFolder}
                          onChange={(event) => updatePreviewItem(item.id, { targetFolder: event.target.value })}
                          inputProps={{ 'aria-label': `Target folder for ${item.title}` }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 104 }}>
                        <Stack spacing={0.75}>
                          <ProviderChip provider={item.provider} />
                          <Typography variant="caption" color="text.secondary">
                            {Math.round(item.confidence * 100)}%
                          </Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {previewItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                          No preview yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
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
