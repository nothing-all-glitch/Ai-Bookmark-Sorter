import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import OrganizeView from './components/OrganizeView';
import SearchView from './components/SearchView';
import SettingsView from './components/SettingsView';
import { getBookmarkTree } from './lib/bookmarks';
import {
  collectBookmarks,
  mergeMetadata,
  type BookmarkMetadata,
  type BookmarkMetadataMap,
  type BookmarkRecord,
} from './lib/search';
import { loadBookmarkMetadata, saveBookmarkMetadata } from './lib/storage';

type View = 'search' | 'organize' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('search');
  const [records, setRecords] = useState<BookmarkRecord[]>([]);
  const [metadataMap, setMetadataMap] = useState<BookmarkMetadataMap>({});
  const [loading, setLoading] = useState(true);

  const refreshLibrary = useCallback(async () => {
    const [tree, storedMetadata] = await Promise.all([getBookmarkTree(), loadBookmarkMetadata()]);
    const nextRecords = collectBookmarks(tree);
    const nextMetadata: BookmarkMetadataMap = { ...storedMetadata };

    for (const record of nextRecords) {
      nextMetadata[record.id] = mergeMetadata(record, nextMetadata[record.id]);
    }

    setRecords(nextRecords);
    setMetadataMap(nextMetadata);
    await saveBookmarkMetadata(nextMetadata);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshLibrary();

    if (typeof chrome === 'undefined' || !chrome.bookmarks) {
      return;
    }

    const handleBookmarkChange = () => {
      void refreshLibrary();
    };

    chrome.bookmarks.onCreated.addListener(handleBookmarkChange);
    chrome.bookmarks.onRemoved.addListener(handleBookmarkChange);
    chrome.bookmarks.onChanged.addListener(handleBookmarkChange);
    chrome.bookmarks.onMoved.addListener(handleBookmarkChange);

    return () => {
      chrome.bookmarks.onCreated.removeListener(handleBookmarkChange);
      chrome.bookmarks.onRemoved.removeListener(handleBookmarkChange);
      chrome.bookmarks.onChanged.removeListener(handleBookmarkChange);
      chrome.bookmarks.onMoved.removeListener(handleBookmarkChange);
    };
  }, [refreshLibrary]);

  const patchMetadata = useCallback((id: string, patch: Partial<BookmarkMetadata>) => {
    setMetadataMap((current) => {
      const existing: BookmarkMetadata = current[id] ?? { tags: [] };
      const nextEntry: BookmarkMetadata = {
        ...existing,
        ...patch,
        tags: patch.tags ?? existing.tags,
        updatedAt: Date.now(),
      };
      const next: BookmarkMetadataMap = {
        ...current,
        [id]: nextEntry,
      };
      void saveBookmarkMetadata(next);
      return next;
    });
  }, []);

  const bulkMetadata = useCallback((updates: BookmarkMetadataMap) => {
    setMetadataMap((current) => {
      const next: BookmarkMetadataMap = { ...current };
      for (const [id, metadata] of Object.entries(updates)) {
        const existing: BookmarkMetadata = current[id] ?? { tags: [] };
        next[id] = {
          ...existing,
          ...metadata,
          tags: [...new Set([...existing.tags, ...metadata.tags])].slice(0, 10),
          updatedAt: Date.now(),
        };
      }
      void saveBookmarkMetadata(next);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          px: 3,
        }}
      >
        <Stack alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 52,
              height: 52,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 4,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 130%)',
              boxShadow: '0 20px 50px rgba(139,92,246,0.30)',
            }}
          >
            <SearchRoundedIcon sx={{ color: '#fff' }} />
          </Box>
          <CircularProgress size={22} />
          <Typography variant="caption" color="text.secondary">
            Indexing your bookmarks…
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        maxWidth: 760,
        mx: 'auto',
        px: { xs: 1.5, sm: 2 },
        pt: 2,
        pb: 1.1,
      }}
    >
      <Box sx={{ pb: 10 }}>
        <Box sx={{ display: view === 'search' ? 'block' : 'none' }}>
          <SearchView
            records={records}
            metadataMap={metadataMap}
            onPatchMetadata={patchMetadata}
            onLibraryChanged={refreshLibrary}
          />
        </Box>

        <Box sx={{ display: view === 'organize' ? 'block' : 'none' }}>
          <OrganizeView
            records={records}
            metadataMap={metadataMap}
            onBulkMetadata={bulkMetadata}
            onLibraryChanged={refreshLibrary}
          />
        </Box>

        <Box sx={{ display: view === 'settings' ? 'block' : 'none' }}>
          <SettingsView />
        </Box>
      </Box>

      <Paper
        sx={{
          position: 'fixed',
          zIndex: 20,
          left: 'max(12px, calc(50% - 365px))',
          right: 'max(12px, calc(50% - 365px))',
          bottom: 10,
          p: 0.65,
          borderRadius: 4,
          background: 'rgba(16,18,25,0.88)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.44)',
        }}
      >
        <Stack direction="row" spacing={0.55}>
          <Button
            fullWidth
            color={view === 'search' ? 'primary' : 'inherit'}
            variant={view === 'search' ? 'contained' : 'text'}
            startIcon={<SearchRoundedIcon />}
            onClick={() => setView('search')}
          >
            Find
          </Button>
          <Button
            fullWidth
            color={view === 'organize' ? 'primary' : 'inherit'}
            variant={view === 'organize' ? 'contained' : 'text'}
            startIcon={<CleaningServicesRoundedIcon />}
            onClick={() => setView('organize')}
          >
            Clean up
          </Button>
          <Button
            fullWidth
            color={view === 'settings' ? 'primary' : 'inherit'}
            variant={view === 'settings' ? 'contained' : 'text'}
            startIcon={<SettingsRoundedIcon />}
            onClick={() => setView('settings')}
          >
            Settings
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
