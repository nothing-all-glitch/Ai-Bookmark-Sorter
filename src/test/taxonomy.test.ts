import { describe, expect, it } from 'vitest';
import {
  BASE_TAXONOMY,
  mergeTaxonomy,
  normalizeFolderName,
} from '../lib/taxonomy';

describe('taxonomy helpers', () => {
  it('normalizes folder names into safe display labels', () => {
    expect(normalizeFolderName('  dev/tools//react  ')).toBe('Dev Tools React');
    expect(normalizeFolderName('')).toBe('Other');
  });

  it('merges base and user folders without duplicates', () => {
    const taxonomy = mergeTaxonomy(['development', 'Research', 'AI & Tools']);

    expect(taxonomy).toContain('Development');
    expect(taxonomy).toContain('Research');
    expect(taxonomy.filter((item) => item === 'Development')).toHaveLength(1);
    expect(taxonomy.length).toBe(BASE_TAXONOMY.length + 1);
  });
});
