/** Category paths (`Garden/Tomatoes`) as a tree, and recency for quick-pick chips. */
import { cmpAt } from './time';
import type { Seed } from './types';

export interface CategoryNode {
  name: string;
  path: string;
  /** Seeds filed exactly here. */
  own: number;
  /** Seeds here and in every subcategory. */
  total: number;
  children: CategoryNode[];
}

export function categoryTree(seeds: Seed[]): CategoryNode[] {
  const root: CategoryNode = { name: '', path: '', own: 0, total: 0, children: [] };
  for (const seed of seeds) {
    if (!seed.category) continue;
    let node = root;
    node.total++;
    const parts = seed.category.split('/');
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
export function allCategories(seeds: Seed[]): string[] {
  const set = new Set<string>();
  for (const s of seeds) {
    if (!s.category) continue;
    const parts = s.category.split('/');
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Categories most recently used, for the chips after capture. */
export function recentCategories(seeds: Seed[], limit = 6): string[] {
  const latest = new Map<string, string>();
  for (const s of seeds) {
    if (!s.category) continue;
    const prev = latest.get(s.category);
    if (!prev || cmpAt(s.updated, prev) > 0) latest.set(s.category, s.updated);
  }
  return [...latest.entries()]
    .sort((a, b) => cmpAt(b[1], a[1]))
    .slice(0, limit)
    .map(([c]) => c);
}

export function allTags(seeds: Seed[]): string[] {
  return [...new Set(seeds.flatMap((s) => s.tags))].sort();
}
