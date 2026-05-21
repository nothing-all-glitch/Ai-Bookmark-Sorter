# AI Bookmark Organizer

Manifest V3 Chrome extension that scans existing bookmarks, previews AI-suggested folder moves, and applies approved changes into a managed `AI Organized Bookmarks` folder.

## Features

- Reads bookmarks through Chrome's `bookmarks` permission.
- Uses a provider fallback chain: saved API key AI, Chrome built-in AI, then deterministic local heuristics.
- Stores API keys only in `chrome.storage.local`.
- Skips bookmarks already inside the managed folder on later runs.
- Shows progress, pause/cancel controls, preview editing, apply selected, and undo last run.
- Runs heuristic classification in a Web Worker when available.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

Load the built `dist` folder in `chrome://extensions` with Developer Mode enabled.
