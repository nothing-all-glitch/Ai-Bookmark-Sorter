import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import {
  getChromeAiAvailability,
  setupChromeAiModel,
  testApiProviderKey,
  type ChromeAiAvailability,
} from '../lib/aiProviders';
import { loadSettings, saveSettings } from '../lib/storage';
import { DEFAULT_SETTINGS, type OrganizeSettings } from '../lib/types';

function providerName(provider: OrganizeSettings['apiProvider']): string {
  return provider === 'gemini' ? 'Gemini' : 'OpenAI-compatible';
}

function chromeAiLabel(value: ChromeAiAvailability): string {
  if (value === 'available') return 'Ready';
  if (value === 'downloadable') return 'Model available to download';
  if (value === 'downloading') return 'Downloading';
  if (value === 'unsupported') return 'Not supported in this Chrome version';
  return 'Unavailable on this device/profile';
}

async function ensureEndpointPermission(endpoint: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return true;

  try {
    const parsed = new URL(endpoint);
    if (parsed.hostname === 'api.openai.com') return true;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    const origin = `${parsed.origin}/*`;
    const alreadyGranted = await chrome.permissions.contains({ origins: [origin] });
    if (alreadyGranted) return true;
    return chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export default function SettingsView() {
  const [settings, setSettings] = useState<OrganizeSettings>(DEFAULT_SETTINGS);
  const [chromeAi, setChromeAi] = useState<ChromeAiAvailability>('unsupported');
  const [chromeAiProgress, setChromeAiProgress] = useState(0);
  const [chromeAiBusy, setChromeAiBusy] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([loadSettings(), getChromeAiAvailability()]).then(([saved, availability]) => {
      setSettings(saved);
      setChromeAi(availability);
    });
  }, []);

  const hasApiKey = useMemo(
    () =>
      settings.apiProvider === 'gemini'
        ? Boolean(settings.geminiApiKey.trim())
        : Boolean(settings.customApiKey.trim()),
    [settings.apiProvider, settings.customApiKey, settings.geminiApiKey],
  );

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      if (
        settings.aiMode !== 'local-only' &&
        settings.apiProvider === 'openai-compatible' &&
        settings.customEndpoint.trim()
      ) {
        const granted = await ensureEndpointPermission(settings.customEndpoint.trim());
        if (!granted) {
          setToast('Endpoint permission was not granted. The provider is saved but cannot be contacted until permission is allowed.');
          await saveSettings(settings);
          return;
        }
      }

      await saveSettings(settings);

      if (settings.aiMode !== 'local-only' && hasApiKey) {
        const result = await testApiProviderKey(settings);
        setToast(
          result.ok
            ? `${providerName(result.provider)} is connected and ready`
            : result.message || 'Settings saved, but the API key check failed',
        );
      } else {
        setToast('Settings saved');
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetupChromeAi(): Promise<void> {
    const controller = new AbortController();
    setChromeAiBusy(true);
    setChromeAiProgress(0);
    try {
      await setupChromeAiModel(setChromeAiProgress, controller.signal);
      setChromeAi(await getChromeAiAvailability());
      setToast('Chrome built-in AI is ready');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Chrome AI setup could not finish');
    } finally {
      setChromeAiBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
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
          <SettingsRoundedIcon fontSize="small" />
        </Box>
        <Box>
          <Typography variant="h1">Settings</Typography>
          <Typography variant="caption" color="text.secondary">
            Keep the defaults simple. Power controls live under Advanced.
          </Typography>
        </Box>
      </Stack>

      <Paper sx={{ p: 1.6, borderRadius: 4 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h2">AI behavior</Typography>
            <Typography variant="caption" color="text.secondary">
              Search stays local. AI is only used to improve organization metadata and cleanup suggestions.
            </Typography>
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel id="ai-mode-label">Mode</InputLabel>
            <Select
              labelId="ai-mode-label"
              label="Mode"
              value={settings.aiMode}
              onChange={(event) =>
                setSettings({ ...settings, aiMode: event.target.value as OrganizeSettings['aiMode'] })
              }
            >
              <MenuItem value="api-first">Automatic — API key first, then browser/local fallback</MenuItem>
              <MenuItem value="no-key-first">Browser first — Chrome AI, then local fallback</MenuItem>
              <MenuItem value="local-only">Local only — never call an external API</MenuItem>
            </Select>
          </FormControl>

          <Paper
            variant="outlined"
            sx={{
              p: 1.25,
              borderRadius: 3,
              background: chromeAi === 'available' ? 'rgba(52,211,153,0.045)' : 'rgba(255,255,255,0.02)',
              boxShadow: 'none',
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <SmartToyRoundedIcon sx={{ color: chromeAi === 'available' ? 'success.main' : 'text.secondary' }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={800}>
                  Chrome built-in AI
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {chromeAiLabel(chromeAi)}
                </Typography>
              </Box>
              {(chromeAi === 'downloadable' || chromeAi === 'downloading') && (
                <Button size="small" variant="outlined" disabled={chromeAiBusy} onClick={handleSetupChromeAi}>
                  {chromeAiBusy ? `${chromeAiProgress}%` : 'Set up'}
                </Button>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Paper>

      {settings.aiMode !== 'local-only' && (
        <Paper sx={{ p: 1.6, borderRadius: 4 }}>
          <Stack spacing={1.4}>
            <Box>
              <Typography variant="h2">Bring your own API key</Typography>
              <Typography variant="caption" color="text.secondary">
                Optional. Recall still works without one.
              </Typography>
            </Box>

            <FormControl fullWidth size="small">
              <InputLabel id="provider-label">Provider</InputLabel>
              <Select
                labelId="provider-label"
                label="Provider"
                value={settings.apiProvider}
                onChange={(event) =>
                  setSettings({ ...settings, apiProvider: event.target.value as OrganizeSettings['apiProvider'] })
                }
              >
                <MenuItem value="gemini">Gemini</MenuItem>
                <MenuItem value="openai-compatible">OpenAI-compatible endpoint</MenuItem>
              </Select>
            </FormControl>

            {settings.apiProvider === 'gemini' ? (
              <TextField
                size="small"
                label="Gemini API key"
                type={showGeminiKey ? 'text' : 'password'}
                value={settings.geminiApiKey}
                onChange={(event) => setSettings({ ...settings, geminiApiKey: event.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <KeyRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowGeminiKey((value) => !value)}>
                        {showGeminiKey ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            ) : (
              <Stack spacing={1}>
                <TextField
                  size="small"
                  label="Endpoint"
                  placeholder="https://api.openai.com/v1/chat/completions"
                  value={settings.customEndpoint}
                  onChange={(event) => setSettings({ ...settings, customEndpoint: event.target.value })}
                  helperText="Custom hosts request permission only when you save them."
                />
                <TextField
                  size="small"
                  label="API key"
                  type={showCustomKey ? 'text' : 'password'}
                  value={settings.customApiKey}
                  onChange={(event) => setSettings({ ...settings, customApiKey: event.target.value })}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <KeyRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowCustomKey((value) => !value)}>
                          {showCustomKey ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      <Accordion
        disableGutters
        sx={{
          borderRadius: '16px !important',
          overflow: 'hidden',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
          <Box>
            <Typography variant="body2" fontWeight={800}>
              Advanced
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Models, confidence, batching, and folder behavior
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            {settings.apiProvider === 'gemini' ? (
              <TextField
                size="small"
                label="Gemini model"
                value={settings.geminiModel}
                onChange={(event) => setSettings({ ...settings, geminiModel: event.target.value })}
                disabled={settings.aiMode === 'local-only'}
              />
            ) : (
              <TextField
                size="small"
                label="Model"
                value={settings.customModel}
                onChange={(event) => setSettings({ ...settings, customModel: event.target.value })}
                disabled={settings.aiMode === 'local-only'}
              />
            )}

            <Box>
              <Typography variant="body2" fontWeight={750}>
                Minimum confidence · {Math.round(settings.minConfidence * 100)}%
              </Typography>
              <Slider
                min={0.35}
                max={0.9}
                step={0.05}
                value={settings.minConfidence}
                onChange={(_, value) => setSettings({ ...settings, minConfidence: Number(value) })}
              />
            </Box>

            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                type="number"
                label="Batch size"
                value={settings.batchSize}
                onChange={(event) =>
                  setSettings({ ...settings, batchSize: Math.max(4, Math.min(50, Number(event.target.value) || 4)) })
                }
                inputProps={{ min: 4, max: 50 }}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                label="Concurrency"
                value={settings.concurrency}
                onChange={(event) =>
                  setSettings({ ...settings, concurrency: Math.max(1, Math.min(6, Number(event.target.value) || 1)) })
                }
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
              label="Allow AI to propose new folder names"
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Alert
        severity="info"
        icon={<LockRoundedIcon />}
        sx={{ borderRadius: 3 }}
      >
        Search, favorites, notes, tags, and usage ranking stay in your browser profile. When an external AI provider is enabled, bookmark titles, URLs, domains, and current folders may be sent to that provider for classification.
      </Alert>

      <Button
        size="large"
        variant="contained"
        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveRoundedIcon />}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save settings'}
      </Button>

      <Snackbar open={Boolean(toast)} autoHideDuration={3200} onClose={() => setToast(null)} message={toast} />
    </Stack>
  );
}
