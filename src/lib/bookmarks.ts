import { getDomain } from './url';
import { MANAGED_FOLDER_NAME, type BookmarkCandidate, type BookmarkSnapshot, type BookmarkTreeNodeLike } from './types';

export function isChromeBookmarksAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.bookmarks?.getTree);
}

export async function getBookmarkTree(): Promise<BookmarkTreeNodeLike[]> {
  if (!isChromeBookmarksAvailable()) {
    return getMockBookmarkTree();
  }
  return chrome.bookmarks.getTree() as Promise<BookmarkTreeNodeLike[]>;
}

export function flattenBookmarkTree(
  tree: BookmarkTreeNodeLike[],
  managedFolderName = MANAGED_FOLDER_NAME,
): BookmarkSnapshot {
  const candidates: BookmarkCandidate[] = [];
  const folderNames = new Set<string>();
  let totalBookmarks = 0;
  let skippedManaged = 0;
  let skippedUnmodifiable = 0;
  let managedFolderId: string | undefined;

  const visit = (node: BookmarkTreeNodeLike, path: string[], insideManaged: boolean, insideUnmodifiable: boolean) => {
    const isFolder = !node.url;
    const isManagedFolder = isFolder && node.title === managedFolderName;
    const nextInsideManaged = insideManaged || isManagedFolder;
    const nextInsideUnmodifiable = insideUnmodifiable || Boolean(node.unmodifiable);

    if (isManagedFolder) {
      managedFolderId = node.id;
    }

    if (isFolder) {
      if (node.title && !isManagedFolder && node.title.toLowerCase() !== 'root') {
        folderNames.add(node.title);
      }
      const nextPath = node.title ? [...path, node.title] : path;
      for (const child of node.children ?? []) {
        visit(child, nextPath, nextInsideManaged, nextInsideUnmodifiable);
      }
      return;
    }

    totalBookmarks += 1;

    if (nextInsideManaged) {
      skippedManaged += 1;
      return;
    }

    if (nextInsideUnmodifiable || !node.parentId) {
      skippedUnmodifiable += 1;
      return;
    }

    const url = node.url;
    if (!url) {
      return;
    }

    candidates.push({
      id: node.id,
      title: node.title || url,
      url,
      domain: getDomain(url),
      parentId: node.parentId,
      index: node.index ?? 0,
      currentPath: path.filter(Boolean).join(' / ') || 'Bookmarks',
      dateAdded: node.dateAdded,
    });
  };

  for (const root of tree) {
    visit(root, [], false, false);
  }

  return {
    totalBookmarks,
    candidates,
    folderNames: [...folderNames].sort((a, b) => a.localeCompare(b)),
    managedFolderId,
    skippedManaged,
    skippedUnmodifiable,
  };
}

export function findManagedFolder(
  tree: BookmarkTreeNodeLike[],
  managedFolderName = MANAGED_FOLDER_NAME,
): BookmarkTreeNodeLike | undefined {
  const stack = [...tree];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (!node.url && node.title === managedFolderName) {
      return node;
    }
    stack.push(...(node.children ?? []));
  }
  return undefined;
}

export function findDefaultManagedParentId(tree: BookmarkTreeNodeLike[]): string | undefined {
  const rootChildren = tree.flatMap((node) => node.children ?? []);
  const preferred =
    rootChildren.find((node) => node.folderType === 'other') ??
    rootChildren.find((node) => node.title.toLowerCase() === 'other bookmarks') ??
    rootChildren.find((node) => node.folderType === 'bookmarks-bar') ??
    rootChildren.find((node) => !node.url && !node.unmodifiable);
  return preferred?.id;
}

export async function ensureManagedFolder(): Promise<BookmarkTreeNodeLike> {
  const tree = await getBookmarkTree();
  const existing = findManagedFolder(tree);
  if (existing) {
    return existing;
  }

  if (!isChromeBookmarksAvailable()) {
    throw new Error('Bookmark writes are only available when the extension is loaded in Chrome.');
  }

  const parentId = findDefaultManagedParentId(tree);
  return chrome.bookmarks.create({ parentId, title: MANAGED_FOLDER_NAME }) as Promise<BookmarkTreeNodeLike>;
}

export async function ensureSubFolder(parentId: string, title: string): Promise<BookmarkTreeNodeLike> {
  if (!isChromeBookmarksAvailable()) {
    throw new Error('Bookmark writes are only available when the extension is loaded in Chrome.');
  }

  const children = (await chrome.bookmarks.getChildren(parentId)) as BookmarkTreeNodeLike[];
  const existing = children.find((child) => !child.url && child.title.toLowerCase() === title.toLowerCase());
  if (existing) {
    return existing;
  }

  return chrome.bookmarks.create({ parentId, title }) as Promise<BookmarkTreeNodeLike>;
}

export async function moveBookmark(bookmarkId: string, parentId: string, index?: number): Promise<void> {
  if (!isChromeBookmarksAvailable()) {
    throw new Error('Bookmark writes are only available when the extension is loaded in Chrome.');
  }
  await chrome.bookmarks.move(bookmarkId, { parentId, index });
}

export function getMockBookmarkTree(): BookmarkTreeNodeLike[] {
  return [
    {
      id: '0',
      title: 'Root',
      children: [
        {
          id: '1',
          title: 'Bookmarks Bar',
          folderType: 'bookmarks-bar',
          children: [
            {
              id: '10',
              parentId: '1',
              index: 0,
              title: 'React Docs',
              url: 'https://react.dev/reference/react',
            },
            {
              id: '11',
              parentId: '1',
              index: 1,
              title: 'Google Flights',
              url: 'https://www.google.com/travel/flights',
            },
          ],
        },
        {
          id: '2',
          title: 'Other Bookmarks',
          folderType: 'other',
          children: [
            {
              id: '20',
              parentId: '2',
              index: 0,
              title: 'Hacker News',
              url: 'https://news.ycombinator.com',
            },
            {
              id: '21',
              parentId: '2',
              index: 1,
              title: MANAGED_FOLDER_NAME,
              children: [
                {
                  id: '22',
                  parentId: '21',
                  index: 0,
                  title: 'Existing organized bookmark',
                  url: 'https://developer.chrome.com/docs/extensions',
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}
