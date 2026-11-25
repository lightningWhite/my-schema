/** Category paths (`Garden/Tomatoes`) as a tree, and recency for quick-pick chips. */
import { normalizeCategory, updateMeta } from './tidbit';
import { cmpAt } from './time';
import type { Ctx, Tidbit } from './types';

export interface CategoryNode {
  name: string;
  path: string;
  /** Tidbits filed exactly here. */
  own: number;
  /** Tidbits here and in every subcategory. */
  total: number;
  children: CategoryNode[];
}

export function categoryTree(tidbits: Tidbit[]): CategoryNode[] {
  const root: CategoryNode = { name: '', path: '', own: 0, total: 0, children: [] };
  for (const tidbit of tidbits) {
    if (!tidbit.category) continue;
    let node = root;
    node.total++;
    const parts = tidbit.category.split('/');
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path, own: 0, total: 0, children: [] };
        node.children.push(child);
      }
      child.total++;
      node = child;
    });
    node.own++;
  }
  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

/** Every category path in use, including parents, sorted. */
export function allCategories(tidbits: Tidbit[]): string[] {
  const set = new Set<string>();
  for (const s of tidbits) {
    if (!s.category) continue;
    const parts = s.category.split('/');
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Categories most recently used, for the chips after capture. */
export function recentCategories(tidbits: Tidbit[], limit = 6): string[] {
  const latest = new Map<string, string>();
  for (const s of tidbits) {
    if (!s.category) continue;
    const prev = latest.get(s.category);
    if (!prev || cmpAt(s.updated, prev) > 0) latest.set(s.category, s.updated);
  }
  return [...latest.entries()]
    .sort((a, b) => cmpAt(b[1], a[1]))
    .slice(0, limit)
    .map(([c]) => c);
}

export function allTags(tidbits: Tidbit[]): string[] {
  return [...new Set(tidbits.flatMap((s) => s.tags))].sort();
}

// ---------------------------------------------------------------- matching what's typed

/** Whether `category` is `path` itself or somewhere beneath it. ("Garden" contains "Garden/Tomatoes", not "Gardening".) */
export function inCategory(category: string | undefined, path: string): boolean {
  return !!category && (category === path || category.startsWith(path + '/'));
}

/**
 * Use the existing spelling where one exists, segment by segment, ignoring
 * case: typing "health/sleep" when "Health" exists gives "Health/sleep", and
 * "garden/tomatoes" gives "Garden/Tomatoes" if that exists. Prevents near
 * duplicates that differ only in capitals.
 */
export function resolveCategory(all: string[], typed: string): string | undefined {
  const parts = normalizeCategory(typed)?.split('/');
  if (!parts) return undefined;
  const existing = new Set(all);
  const out: string[] = [];
  for (const part of parts) {
    const prefix = out.length ? out.join('/') + '/' : '';
    const match = [...existing].find((c) => c.toLowerCase() === (prefix + part).toLowerCase());
    out.push(match ? match.slice(prefix.length) : part);
  }
  return out.join('/');
}

/**
 * Categories matching what's being typed, best first: those where a segment
 * starts with the query, then any containing it. Accent- and case-insensitive.
 */
export function filterCategories(all: string[], query: string, limit = 8): string[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored = all
    .map((c) => {
      const f = fold(c);
      const segStart = f.split('/').some((s) => s.startsWith(q)) || f.startsWith(q);
      return { c, score: segStart ? 2 : f.includes(q) ? 1 : 0 };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.c.localeCompare(b.c));
  return scored.slice(0, limit).map((x) => x.c);
}

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------- reorganizing

/** Where a category would move to, and what that would affect. */
export interface CategoryChange {
  /** Tidbits that would change. */
  count: number;
  /** Subcategories that move along with it. */
  subcategories: number;
  /** The new name already exists: the two would be combined. */
  merges: boolean;
}

export function previewRename(tidbits: Tidbit[], from: string, to: string): CategoryChange {
  const target = normalizeCategory(to);
  const all = allCategories(tidbits);
  return {
    count: tidbits.filter((t) => inCategory(t.category, from)).length,
    subcategories: all.filter((c) => c.startsWith(from + '/')).length,
    merges: !!target && target !== from && all.includes(target),
  };
}

/**
 * Rename (or move, or merge) a category: every tidbit in `from` or beneath it
 * gets `to` in its place, keeping subcategories ("Garden/Tomatoes" renamed to
 * "Yard" becomes "Yard/Tomatoes"). Renaming to an existing category merges
 * the two. Returns only the tidbits that changed.
 */
export function renameCategory(ctx: Ctx, tidbits: Tidbit[], from: string, to: string): Tidbit[] {
  const target = normalizeCategory(to);
  if (!target || target === from) return [];
  const changed: Tidbit[] = [];
  for (const t of tidbits) {
    if (!inCategory(t.category, from)) continue;
    const next = updateMeta(ctx, t, { category: target + t.category!.slice(from.length) });
    if (next !== t) changed.push(next);
  }
  return changed;
}

/** The parent of a category path, or undefined at the top level. */
export function parentCategory(path: string): string | undefined {
  const i = path.lastIndexOf('/');
  return i < 0 ? undefined : path.slice(0, i);
}

/**
 * Delete a category and its subcategories. Their tidbits aren't deleted: they
 * move up to the parent category, or to Unsorted at the top level. Returns
 * only the tidbits that changed.
 */
export function deleteCategory(ctx: Ctx, tidbits: Tidbit[], path: string): Tidbit[] {
  const parent = parentCategory(path);
  const changed: Tidbit[] = [];
  for (const t of tidbits) {
    if (!inCategory(t.category, path)) continue;
    const next = updateMeta(ctx, t, { category: parent ?? null });
    if (next !== t) changed.push(next);
  }
  return changed;
}

/** Keep a saved reference to a category (e.g. the review focus) pointing at the right place after a rename. */
export function renamedPath(path: string | undefined, from: string, to: string): string | undefined {
  if (!path || !inCategory(path, from)) return path;
  return (normalizeCategory(to) ?? '') + path.slice(from.length) || undefined;
}
