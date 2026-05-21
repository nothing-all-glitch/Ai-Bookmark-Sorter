# AI Bookmark Organizer

<p align="center">
  <img src="docs/assets/icon.png" alt="AI Bookmark Organizer icon" width="112" />
</p>

Manifest V3 Chrome extension that scans existing bookmarks, previews AI-suggested folder moves, and applies approved changes into a managed `AI Organized Bookmarks` folder.

## Screenshots

<p align="center">
  <img src="docs/assets/screenshot-dashboard.png" alt="AI Bookmark Organizer dashboard screenshot" width="720" />
</p>

<p align="center">
  <img src="docs/assets/screenshot-preview.png" alt="AI Bookmark Organizer preview screenshot" width="720" />
</p>

<p align="center">
  <img src="docs/assets/screenshot-settings.png" alt="AI Bookmark Organizer settings screenshot" width="720" />
</p>

## Download

The latest ready-to-install ZIP is available from the GitHub Releases page:

- [Download AI Bookmark Organizer v0.1.3](https://github.com/nothing-all-glitch/Ai-Bookmark-Sorter/releases/download/v0.1.3/ai-bookmark-organizer-v0.1.3.zip)
- [View all releases](https://github.com/nothing-all-glitch/Ai-Bookmark-Sorter/releases)

## Install In Chrome

Chrome extensions downloaded outside the Chrome Web Store must be loaded manually:

1. Download `ai-bookmark-organizer-v0.1.3.zip` from the release link above.
2. Unzip the downloaded file.
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer Mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the unzipped extension folder.
7. Pin **AI Bookmark Organizer** from the Chrome extensions menu if you want quick access.

After installation, open the extension, review the proposed bookmark moves, then apply only the ones you want.

## Features

- Reads bookmarks through Chrome's `bookmarks` permission.
- Uses a provider fallback chain: saved API key AI, Chrome built-in AI, then deterministic local heuristics.
- Stores API keys only in `chrome.storage.local`.
- Skips bookmarks already inside the managed folder on later runs.
- Shows progress, pause/cancel controls, Chrome AI setup progress, preview editing, apply selected, and undo last run.
- Groups suggested moves into an expandable folder tree for easier review.
- Runs heuristic classification in a Web Worker when available.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

Load the built `dist` folder in `chrome://extensions` with Developer Mode enabled.
