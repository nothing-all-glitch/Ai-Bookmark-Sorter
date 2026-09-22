import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { saveCurrentPage } from '../lib/bookmarks';
import {
  countCategories,
  findDuplicateIds,
  searchBookmarks,
  type BookmarkMetadata,
  type BookmarkMetadataMap,
  type BookmarkRecord,
  type SearchFilter,
} from '../lib/search';
import { loadRecentSearches, saveRecentSearch } from '../lib/storage';

interface SearchViewProps {
  records: BookmarkRecord[];
  metadataMap: BookmarkMetadataMap;
  onPatchMetadata: (id: string, patch: Partial<BookmarkMetadata>) => void;
  onLibraryChanged: () => Promise<void>;
}

const FILTERS: Array<{ id: SearchFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'unsorted', label: 'Unsorted' },
  { id: 'duplicates', label: 'Duplicates' },
];

function faviconUrl(url: string): string | undefined {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    return undefined;
  }
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
}

function formatDate(value?: number): string {
  if (!value) return '';
  const deltaDays = Math.floor((Date.now() - value) / 86_400_000);
  if (deltaDays <= 0) return 'Today';
  if (deltaDays === 1) return 'Yesterday';
  if (deltaDays < 30) return `${deltaDays}d ago`;
  if (deltaDays < 365) return `${Math.floor(deltaDays / 30)}mo ago`;
  return `${Math.floor(deltaDays / 365)}y ago`;
}

export default function SearchView({
  records,
  metadataMap,
  onPatchMetadata,
  onLibraryChanged,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [noteTarget, setNoteTarget] = useState<BookmarkRecord | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingPage, setSavingPage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadRecentSearches().then(setRecentSearches);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, []);

  const hits = useMemo(
    () => searchBookmarks(records, metadataMap, query, filter, 120),
    [filter, metadataMap, query, records],
  );

  const duplicateCount = useMemo(() => findDuplicateIds(records).size, [records]);
  const topCategories = useMemo(
    () => [...countCategories(records, metadataMap).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    [metadataMap, records],
  );

  async function rememberSearch(value = query): Promise<void> {
    if (!value.trim()) return;
    setRecentSearches(await saveRecentSearch(value));
  }

  async function openBookmark(record: BookmarkRecord): Promise<void> {
    await rememberSearch();
    onPatchMetadata(record.id, {
      openCount: (metadataMap[record.id]?.openCount ?? 0) + 1,
      lastOpened: Date.now(),
    });

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url: record.url, active: true });
    } else {
      globalThis.open(record.url, '_blank', 'noopener,noreferrer');
    }
  }

  function toggleFavorite(record: BookmarkRecord): void {
    onPatchMetadata(record.id, { favorite: !metadataMap[record.id]?.favorite });
  }

  function editNote(record: BookmarkRecord): void {
    setNoteTarget(record);
    setNoteDraft(metadataMap[record.id]?.note ?? '');
  }

  function saveNote(): void {
    if (!noteTarget) return;
    onPatchMetadata(noteTarget.id, { note: noteDraft.trim() });
    setNoteTarget(null);
    setToast('Note saved');
  }

  async function copyUrl(record: BookmarkRecord): Promise<void> {
    try {
      await navigator.clipboard.writeText(record.url);
      setToast('Link copied');
    } catch {
      setToast('Could not copy the link');
    }
  }

  async function handleSaveCurrentPage(): Promise<void> {
    setSavingPage(true);
    try {
      const result = await saveCurrentPage();
      await onLibraryChanged();
      setToast(result.created ? 'Current page saved and indexed' : 'This page is already bookmarked');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not save this page');
    } finally {
      setSavingPage(false);
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    void rememberSearch();
    if (hits[0]) {
      void openBookmark(hits[0].record);
    }
  }

  return (
    <Stack spacing={2.25}>
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 3,
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 130%)',
            boxShadow: '0 14px 34px rgba(139,92,246,0.28)',
          }}
        >
          <BookmarkRoundedIcon sx={{ color: '#fff', fontSize: 21 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h1">Recall</Typography>
          <Typography variant="caption" color="text.secondary">
            Find anything you saved.
          </Typography>
        </Box>
        <Tooltip title="Bookmark the current page">
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={handleSaveCurrentPage}
              disabled={savingPage}
            >
              {savingPage ? 'Saving' : 'Save'}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Paper
        sx={{
          p: 1,
          borderRadius: 4,
          background:
            'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(34,211,238,0.035) 55%, rgba(255,255,255,0.02))',
        }}
      >
        <TextField
          inputRef={searchRef}
          autoFocus
          fullWidth
          placeholder="Search by topic, site, folder, tag, or note…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon color="primary" />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Clear search" onClick={() => setQuery('')}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : (
              <InputAdornment position="end">
                <Chip size="small" label="⌘ K" variant="outlined" sx={{ opacity: 0.62 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              minHeight: 54,
              background: 'rgba(8,9,13,0.58)',
              '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
            },
          }}
        />
      </Paper>

      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {FILTERS.map((item) => {
          const suffix = item.id === 'duplicates' && duplicateCount > 0 ? ` · ${duplicateCount}` : '';
          return (
            <Chip
              key={item.id}
              clickable
              label={item.label + suffix}
              color={filter === item.id ? 'primary' : 'default'}
              variant={filter === item.id ? 'filled' : 'outlined'}
              onClick={() => setFilter(item.id)}
            />
          );
        })}
      </Stack>

      {!query && filter === 'all' && (recentSearches.length > 0 || topCategories.length > 0) && (
        <Stack spacing={1.4}>
          {recentSearches.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.8 }}>
                <HistoryRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                  Recent searches
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
                {recentSearches.slice(0, 5).map((item) => (
                  <Chip
                    key={item}
                    size="small"
                    label={item}
                    onClick={() => {
                      setQuery(item);
                      setFilter('all');
                    }}
                    sx={{ background: 'rgba(255,255,255,0.035)' }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {topCategories.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 0.8 }}>
                Browse
              </Typography>
              <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
                {topCategories.map(([category, count]) => (
                  <Chip
                    key={category}
                    size="small"
                    variant="outlined"
                    label={`${category} · ${count}`}
                    onClick={() => {
                      setQuery(category);
                      setFilter('all');
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}

      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography variant="h2" sx={{ flex: 1 }}>
          {query ? 'Results' : filter === 'all' ? 'Recently saved' : FILTERS.find((item) => item.id === filter)?.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hits.length} {hits.length === 1 ? 'bookmark' : 'bookmarks'}
        </Typography>
      </Stack>

      {filter === 'duplicates' && duplicateCount > 0 && (
        <Alert severity="info" variant="outlined">
          URLs are normalized before comparison, so common tracking parameters and fragments do not create false duplicates.
        </Alert>
      )}

      <Stack spacing={0.85}>
        {hits.map(({ record, metadata }) => (
          <Paper
            key={record.id}
            role="button"
            tabIndex={0}
            onClick={() => void openBookmark(record)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void openBookmark(record);
            }}
            sx={{
              p: 1.35,
              cursor: 'pointer',
              borderRadius: 3,
              transition: 'transform 120ms ease, border-color 120ms ease, background 120ms ease',
              background: 'rgba(17,19,26,0.76)',
              '&:hover': {
                transform: 'translateY(-1px)',
                borderColor: 'rgba(139,92,246,0.28)',
                background: 'rgba(23,25,34,0.9)',
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
          >
            <Stack direction="row" spacing={1.15} alignItems="flex-start">
              <Avatar
                variant="rounded"
                src={faviconUrl(record.url)}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2.25,
                  bgcolor: 'rgba(255,255,255,0.055)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <LinkRoundedIcon fontSize="small" />
              </Avatar>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography variant="body2" fontWeight={800} noWrap title={record.title} sx={{ flex: 1 }}>
                    {record.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatDate(record.dateAdded)}
                  </Typography>
                </Stack>

                <Typography variant="caption" color="text.secondary" noWrap title={record.url}>
                  {record.domain || record.url}
                  {record.currentPath ? ` · ${record.currentPath}` : ''}
                </Typography>

                {(metadata.description || metadata.note) && (
                  <Typography
                    variant="caption"
                    color={metadata.note ? 'text.primary' : 'text.secondary'}
                    sx={{
                      display: '-webkit-box',
                      mt: 0.55,
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      opacity: metadata.note ? 0.9 : 0.76,
                    }}
                  >
                    {metadata.note || metadata.description}
                  </Typography>
                )}

                <Stack direction="row" spacing={0.55} alignItems="center" sx={{ mt: 0.9, minWidth: 0 }}>
                  {metadata.category && (
                    <Chip
                      size="small"
                      label={metadata.category}
                      sx={{
                        height: 23,
                        bgcolor: 'rgba(139,92,246,0.13)',
                        color: 'primary.light',
                        border: '1px solid rgba(139,92,246,0.18)',
                      }}
                    />
                  )}
                  {metadata.tags.slice(0, 2).map((tag) => (
                    <Chip
                      key={tag}
                      size="small"
                      label={tag}
                      variant="outlined"
                      sx={{ height: 23, maxWidth: 110, opacity: 0.8 }}
                    />
                  ))}
                  <Box sx={{ flex: 1 }} />

                  <Tooltip title={metadata.favorite ? 'Remove favorite' : 'Favorite'}>
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavorite(record);
                      }}
                    >
                      {metadata.favorite ? (
                        <StarRoundedIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                      ) : (
                        <StarBorderRoundedIcon sx={{ fontSize: 18 }} />
                      )}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Add or edit note">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        editNote(record);
                      }}
                    >
                      <NotesRoundedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Copy link">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyUrl(record);
                      }}
                    >
                      <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>

                  <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary', ml: 0.25 }} />
                </Stack>
              </Box>
            </Stack>
          </Paper>
        ))}

        {hits.length === 0 && (
          <Paper sx={{ py: 5, px: 2, textAlign: 'center', borderStyle: 'dashed', background: 'rgba(17,19,26,0.45)' }}>
            <SearchRoundedIcon sx={{ fontSize: 28, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body2" fontWeight={750}>
              Nothing matched that search
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Try a topic, domain, folder name, tag, or a word from one of your notes.
            </Typography>
          </Paper>
        )}
      </Stack>

      <Divider sx={{ opacity: 0.65 }} />

      <Typography variant="caption" color="text.secondary" textAlign="center">
        Tip: type <strong>bm</strong> in Chrome&apos;s address bar, press Space, then search without opening Recall.
      </Typography>

      <Dialog
        open={Boolean(noteTarget)}
        onClose={() => setNoteTarget(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ pb: 0.5 }}>Bookmark note</DialogTitle>
        <DialogContent>
          {noteTarget && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mb: 1.5 }}>
              {noteTarget.title}
            </Typography>
          )}
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            placeholder="Why did you save this? Notes become searchable."
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setNoteTarget(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveNote}>
            Save note
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={2600} onClose={() => setToast(null)} message={toast} />
    </Stack>
  );
}
