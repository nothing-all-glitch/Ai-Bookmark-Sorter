import { describe, expect, it } from 'vitest';
import {
  findDefaultManagedParentId,
  flattenBookmarkTree,
} from '../lib/bookmarks';
import { MANAGED_FOLDER_NAME, type BookmarkTreeNodeLike } from '../lib/types';

const tree: BookmarkTreeNodeLike[] = [
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
            title: 'React',
            url: 'https://react.dev',
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
            title: MANAGED_FOLDER_NAME,
            children: [
              {
                id: '21',
                parentId: '20',
                index: 0,
                title: 'Already sorted',
                url: 'https://example.com',
              },
            ],
          },
          {
            id: '22',
            title: 'Locked',
            unmodifiable: 'managed',
            children: [
              {
                id: '23',
                parentId: '22',
                index: 0,
                title: 'Managed bookmark',
                url: 'https://managed.example',
              },
            ],
          },
        ],
      },
    ],
  },
];

describe('bookmark tree helpers', () => {
  it('flattens only writable bookmarks outside the managed folder', () => {
    const snapshot = flattenBookmarkTree(tree);

    expect(snapshot.totalBookmarks).toBe(3);
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      id: '10',
      domain: 'react.dev',
      currentPath: 'Root / Bookmarks Bar',
    });
    expect(snapshot.skippedManaged).toBe(1);
    expect(snapshot.skippedUnmodifiable).toBe(1);
    expect(snapshot.managedFolderId).toBe('20');
  });

  it('chooses Other Bookmarks as the managed folder parent', () => {
    expect(findDefaultManagedParentId(tree)).toBe('2');
  });
});
