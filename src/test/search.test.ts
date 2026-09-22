import { describe, expect, it } from 'vitest';
import {
  collectBookmarks,
  deriveLocalMetadata,
  findDuplicateIds,
  normalizeBookmarkUrl,
  searchBookmarks,
  type BookmarkMetadataMap,
} from '../lib/search';
import type { BookmarkTreeNodeLike } from '../lib/types';

const tree: BookmarkTreeNodeLike[] = [
  {
    id: '0',
    title: 'Root',
    children: [
      {
        id: '1',
        title: 'Bookmarks Bar',
        children: [
          {
            id: '10',
            parentId: '1',
            index: 0,
            title: 'OWASP Mobile Security Testing Guide',
            url: 'https://mas.owasp.org/MASTG/',
            dateAdded: Date.now() - 1000,
          },
          {
            id: '11',
            parentId: '1',
            index: 1,
            title: 'React Docs',
            url: 'https://react.dev/reference/react?utm_source=test',
          },
          {
            id: '12',
            parentId: '1',
            index: 2,
            title: 'React Docs duplicate',
            url: 'https://www.react.dev/reference/react#hooks',
          },
        ],
      },
    ],
  },
];

describe('bookmark search index', () => {
  it('collects bookmarks with their folder path', () => {
    const records = collectBookmarks(tree);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      id: '10',
      domain: 'mas.owasp.org',
      currentPath: 'Bookmarks Bar',
    });
  });

  it('normalizes tracking parameters and fragments for duplicate checks', () => {
    expect(normalizeBookmarkUrl('https://www.example.com/page?utm_source=x#top')).toBe(
      'https://example.com/page',
    );
  });

  it('finds normalized duplicate URLs', () => {
    const duplicates = findDuplicateIds(collectBookmarks(tree));
    expect(duplicates.has('11')).toBe(true);
    expect(duplicates.has('12')).toBe(true);
  });

  it('derives useful local security metadata', () => {
    const [record] = collectBookmarks(tree);
    const metadata = deriveLocalMetadata(record);
    expect(metadata.category).toBe('Security');
    expect(metadata.tags).toContain('owasp');
  });

  it('matches fuzzy topic searches against titles and metadata', () => {
    const records = collectBookmarks(tree);
    const metadata: BookmarkMetadataMap = {
      '10': {
        ...deriveLocalMetadata(records[0]),
        tags: ['android', 'pentesting', 'masvs'],
        description: 'Reference for Android mobile application security testing.',
      },
    };

    const results = searchBookmarks(records, metadata, 'android pentest', 'all');
    expect(results[0]?.record.id).toBe('10');
  });
});
