<div align="center">
  <img src="docs/assets/icon.png" alt="AI Bookmark Organizer icon" width="118" />

  <h1>🤖 AI Bookmark Organizer</h1>

  **A Manifest V3 Chrome extension that turns messy bookmark bars into clean, reviewable folder systems.**

  <p>
    <a href="https://github.com/nothing-all-glitch/Ai-Bookmark-Sorter/releases">
      <img alt="Latest release" src="https://img.shields.io/badge/release-v0.1.7-2563eb?style=for-the-badge" />
    </a>
    <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Manifest%20V3-22c55e?style=for-the-badge&logo=googlechrome&logoColor=white" />
    <img alt="Built with React" src="https://img.shields.io/badge/React%20%2B%20MUI-UI-06b6d4?style=for-the-badge&logo=react&logoColor=white" />
    <img alt="Tests with Vitest" src="https://img.shields.io/badge/Vitest-tested-facc15?style=for-the-badge&logo=vitest&logoColor=111827" />
  </p>

  <p>
    <a href="#download">Download</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#features">Features</a> •
    <a href="#development">Development</a>
  </p>
</div>

---

## ✨ Overview

AI Bookmark Organizer scans your existing Chrome bookmarks, suggests smarter folders, lets you preview and edit every proposed move, then applies only the changes you approve into a managed **AI Organized Bookmarks** folder.

It is built to be careful first: bookmark writes are delayed until review, API keys stay in `chrome.storage.local`, and classification falls back from API-based AI to Chrome built-in AI to local heuristics.

<a id="screenshots"></a>

## 📸 Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="docs/assets/screenshot-dashboard.png" alt="Dashboard screenshot" />
      <br />
      <strong>Dashboard</strong>
      <br />
      Scan progress, controls, and run summary.
    </td>
    <td width="50%">
      <img src="docs/assets/screenshot-preview.png" alt="Preview screenshot" />
      <br />
      <strong>Review Preview</strong>
      <br />
      Expand folders, edit suggestions, and apply selected moves.
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="docs/assets/screenshot-settings.png" alt="Settings screenshot" />
      <br />
      <strong>Settings</strong>
      <br />
      Configure provider options, API keys, and classification behavior.
    </td>
  </tr>
</table>

<a id="download"></a>

## 🚀 Download

Grab the latest ready-to-install ZIP from GitHub Releases:

<p>
  <a href="https://github.com/nothing-all-glitch/Ai-Bookmark-Sorter/releases/download/v0.1.7/ai-bookmark-organizer-v0.1.7.zip">
    <img alt="Download AI Bookmark Organizer v0.1.7" src="https://img.shields.io/badge/Download-v0.1.7-111827?style=for-the-badge&logo=github" />
  </a>
  <a href="https://github.com/nothing-all-glitch/Ai-Bookmark-Sorter/releases">
    <img alt="View all releases" src="https://img.shields.io/badge/View-all%20releases-64748b?style=for-the-badge&logo=github" />
  </a>
</p>

## 🧩 Install In Chrome

Chrome extensions downloaded outside the Chrome Web Store must be loaded manually:

1. Download `ai-bookmark-organizer-v0.1.7.zip` from the release link above.
2. Unzip the downloaded file.
3. Open Chrome and visit `chrome://extensions`.
4. Enable **Developer Mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the unzipped extension folder.
7. Pin **AI Bookmark Organizer** from the Chrome extensions menu for quick access.

After installation, open the extension, review the proposed bookmark moves, then apply only the ones you want.

<a id="features"></a>

## 🛠️ Features

| Area | What it does |
| --- | --- |
| 🔎 Bookmark scanning | Reads bookmarks through Chrome's `bookmarks` permission. |
| 🧠 AI fallback chain | Tries saved API key AI, Chrome built-in AI, then deterministic local heuristics. |
| 🧪 API key check | Verifies a saved API key with a tiny test request and clearly shows when API sorting is active. |
| 🔐 Local key storage | Stores API keys only in `chrome.storage.local`. |
| 👀 Safe preview | Shows suggested folder moves before writing anything. |
| ✅ Selective apply | Applies only approved moves into `AI Organized Bookmarks`. |
| ↩️ Undo support | Keeps an undo plan and run ledger for the last applied organization run. |
| 🌳 Folder tree review | Groups suggested moves into expandable folders for easier scanning. |
| ⚙️ Worker-powered heuristics | Runs local classification in a Web Worker when available. |
| ⏸️ Flow controls | Includes progress, pause, cancel, setup progress, editing, and apply controls. |

## 🧭 How It Works

```mermaid
flowchart LR
  Scan["1. Scan bookmarks"] --> Classify["2. Classify with provider chain"]
  Classify --> Preview["3. Preview suggested moves"]
  Preview --> Edit["4. Edit or deselect"]
  Edit --> Apply["5. Apply approved changes"]
  Apply --> Undo["6. Undo last run if needed"]
```

## 🏗️ Architecture Design

```mermaid
flowchart TD
  User["Chrome user"] --> Action["Extension toolbar action"]
  Action --> SidePanel["Side panel UI<br/>React + MUI"]

  subgraph Extension["Manifest V3 extension"]
    SidePanel --> Organizer["Organizer orchestration<br/>src/lib/organizer.ts"]
    Organizer --> BookmarkApi["Chrome bookmarks API<br/>src/lib/bookmarks.ts"]
    Organizer --> Storage["chrome.storage.local<br/>src/lib/storage.ts"]
    Organizer --> Providers["Provider chain<br/>API key provider -> Chrome AI -> heuristic"]
    Organizer --> Preview["Preview model<br/>editable proposed moves"]
    Preview --> Apply["Apply selected moves"]
    Apply --> BookmarkApi
    Apply --> Undo["Undo plan + run ledger"]
    Undo --> Storage
  end

  subgraph ProvidersGroup["Classification providers"]
    Providers --> Gemini["Gemini API"]
    Providers --> OpenAI["OpenAI-compatible API"]
    Providers --> ChromeAI["Chrome built-in AI"]
    Providers --> Worker["Heuristic Web Worker<br/>src/workers/organizer.worker.ts"]
    Worker --> Rules["Local taxonomy + URL heuristics"]
  end

  BookmarkApi --> ManagedFolder["AI Organized Bookmarks folder"]
  Storage --> Settings["Settings, keys, summaries, undo state"]
```

The side panel is the only user-facing surface. It loads settings and a bookmark snapshot, then delegates scan, classification, preview, apply, and undo work to `src/lib/organizer.ts`.

Classification is intentionally defensive: the selected API provider runs first when configured, Chrome built-in AI is tried when available, and local heuristics keep the extension usable offline. The heuristic path runs in `src/workers/organizer.worker.ts` when Web Workers are available, with a direct fallback for test and constrained environments.

Bookmark writes are delayed until the user approves the preview. Applied moves go into the managed `AI Organized Bookmarks` folder, while `chrome.storage.local` keeps settings, API keys, the last run summary, and the undo plan inside the current Chrome profile.

<a id="development"></a>

## 🧑‍💻 Development

```bash
npm install
npm run dev
npm test
npm run build
```

Load the built `dist` folder in `chrome://extensions` with Developer Mode enabled.

### Useful Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server on `127.0.0.1`. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run build` | Type-check and build the production extension. |
| `npm run preview` | Preview the built app locally. |

## 📦 Tech Stack

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=111827" />
  <img alt="MUI" src="https://img.shields.io/badge/MUI-7-007fff?style=flat-square&logo=mui&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-4-6e9f18?style=flat-square&logo=vitest&logoColor=white" />
</p>

---

<div align="center">
  <strong>Organize carefully. Review everything. Keep control of your bookmarks.</strong>
</div>
