function escapeOmnibox(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function openUrl(url: string, disposition?: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    return;
  }

  if (disposition === 'newBackgroundTab') {
    await chrome.tabs.create({ url, active: false });
    return;
  }

  if (disposition === 'newForegroundTab') {
    await chrome.tabs.create({ url, active: true });
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

async function openRecall(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  chrome.omnibox?.setDefaultSuggestion({
    description: 'Search bookmarks with Recall',
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
});

chrome.action.onClicked.addListener(() => {
  void openRecall();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-recall') {
    void openRecall();
  }
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  void (async () => {
    const nodes = text.trim()
      ? await chrome.bookmarks.search(text.trim())
      : await chrome.bookmarks.getRecent(6);

    const suggestions: chrome.omnibox.SuggestResult[] = nodes
      .filter((node) => Boolean(node.url))
      .slice(0, 6)
      .map((node) => ({
        content: node.url as string,
        description: `${escapeOmnibox(node.title || node.url || 'Bookmark')} — ${escapeOmnibox(node.url || '')}`,
      }));

    suggest(suggestions);
  })();
});

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  void (async () => {
    if (/^https?:\/\//i.test(text)) {
      await openUrl(text, disposition);
      return;
    }

    const [match] = (await chrome.bookmarks.search(text)).filter((node) => Boolean(node.url));
    if (match?.url) {
      await openUrl(match.url, disposition);
    }
  })();
});
