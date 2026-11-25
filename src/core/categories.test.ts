import { describe, expect, it } from 'vitest';
import {
  allCategories,
  deleteCategory,
  filterCategories,
  inCategory,
  previewRename,
  renameCategory,
  renamedPath,
  resolveCategory,
} from './categories';
import { testCtx } from './testing';
import { createTidbit } from './tidbit';

const ctx = testCtx();
const t = (category?: string) => createTidbit(ctx, { text: `in ${category ?? 'nothing'}`, category });

describe('inCategory', () => {
  it('includes the category and everything beneath it, not look-alike siblings', () => {
    expect(inCategory('Garden', 'Garden')).toBe(true);
    expect(inCategory('Garden/Tomatoes', 'Garden')).toBe(true);
    expect(inCategory('Gardening', 'Garden')).toBe(false);
    expect(inCategory(undefined, 'Garden')).toBe(false);
  });
});

describe('resolveCategory', () => {
  const all = ['Garden', 'Garden/Tomatoes', 'Health'];
  it('reuses existing spellings, ignoring case, segment by segment', () => {
    expect(resolveCategory(all, 'health')).toBe('Health');
    expect(resolveCategory(all, ' garden / tomatoes ')).toBe('Garden/Tomatoes');
    expect(resolveCategory(all, 'health/sleep')).toBe('Health/sleep');
    expect(resolveCategory(all, 'Leadership')).toBe('Leadership');
    expect(resolveCategory(all, ' / ')).toBeUndefined();
  });
});

describe('filterCategories', () => {
  const all = ['Engineering/C++', 'Garden', 'Garden/Tomatoes', 'Health', 'Parenting/Discipline'];
  it('finds categories as you type, best matches first', () => {
    expect(filterCategories(all, 'tom')).toEqual(['Garden/Tomatoes']);
    expect(filterCategories(all, 'gar')).toEqual(['Garden', 'Garden/Tomatoes']);
    expect(filterCategories(all, 'IPLINE')).toEqual(['Parenting/Discipline']);
    expect(filterCategories(all, '')).toEqual([]);
  });
});

describe('renameCategory', () => {
  it('moves every tidbit in the category and beneath it, keeping subcategories', () => {
    const tidbits = [t('Garden'), t('Garden/Tomatoes'), t('Gardening'), t('Health'), t()];
    const changed = renameCategory(ctx, tidbits, 'Garden', 'Yard');
    expect(changed.map((x) => x.category)).toEqual(['Yard', 'Yard/Tomatoes']);
    expect(changed.every((x) => x.history === tidbits.find((o) => o.id === x.id)!.history)).toBe(true); // labels only
  });

  it('moves a category under another one', () => {
    const changed = renameCategory(ctx, [t('Kids'), t('Kids/Bedtime')], 'Kids', 'Family/Kids');
    expect(changed.map((x) => x.category)).toEqual(['Family/Kids', 'Family/Kids/Bedtime']);
  });

  it('merges into an existing category', () => {
    const tidbits = [t('Fitness'), t('Health'), t('Health/Sleep')];
    expect(previewRename(tidbits, 'Fitness', 'Health')).toEqual({ count: 1, subcategories: 0, merges: true });
    const changed = renameCategory(ctx, tidbits, 'Fitness', 'Health');
    expect(allCategories([...changed, ...tidbits.slice(1)])).toEqual(['Health', 'Health/Sleep']);
  });

  it('does nothing for an empty name or the same name', () => {
    const tidbits = [t('Garden')];
    expect(renameCategory(ctx, tidbits, 'Garden', ' ')).toEqual([]);
    expect(renameCategory(ctx, tidbits, 'Garden', 'Garden')).toEqual([]);
  });

  it('previews what a rename affects', () => {
    expect(previewRename([t('Garden'), t('Garden/Tomatoes'), t('Garden/Herbs/Basil')], 'Garden', 'Yard')).toEqual({
      count: 3,
      subcategories: 3,
      merges: false,
    });
  });
});

describe('deleteCategory', () => {
  it('moves its tidbits (and its subcategories’) up to the parent', () => {
    const tidbits = [t('Garden/Tomatoes'), t('Garden/Tomatoes/Heirloom'), t('Garden'), t('Garden/Herbs')];
    const changed = deleteCategory(ctx, tidbits, 'Garden/Tomatoes');
    expect(changed.map((x) => x.category)).toEqual(['Garden', 'Garden']);
  });

  it('moves them to Unsorted at the top level, never deleting a tidbit', () => {
    const tidbits = [t('Garden'), t('Garden/Herbs'), t('Health')];
    const changed = deleteCategory(ctx, tidbits, 'Garden');
    expect(changed).toHaveLength(2);
    expect(changed.every((x) => x.category === undefined)).toBe(true);
  });
});

describe('renamedPath', () => {
  it('keeps saved references (like the review focus) pointing at the moved category', () => {
    expect(renamedPath('Garden/Tomatoes', 'Garden', 'Yard')).toBe('Yard/Tomatoes');
    expect(renamedPath('Gardening', 'Garden', 'Yard')).toBe('Gardening');
    expect(renamedPath(undefined, 'Garden', 'Yard')).toBeUndefined();
  });
});
