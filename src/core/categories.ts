/** Category paths (`Garden/Tomatoes`) as a tree, and recency for quick-pick chips. */
import { cmpAt } from './time';
import type { Grain } from './types';

export interface CategoryNode {
  name: string;
  path: string;
  /** Grains filed exactly here. */
  own: number;
  /** Grains here and in every subcategory. */
  total: number;
  children: CategoryNode[];
}

export function categoryTree(grains: Grain[]): CategoryNode[] {
  const root: CategoryNode = { name: '', path: '', own: 0, total: 0, children: [] };
  for (const grain of grains) {
    if (!grain.category) continue;
    let node = root;
    node.total++;
    const parts = grain.category.split('/');
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
export function allCategories(grains: Grain[]): string[] {
  const set = new Set<string>();
  for (const s of grains) {
    if (!s.category) continue;
    const parts = s.category.split('/');
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Categories most recently used, for the chips after capture. */
export function recentCategories(grains: Grain[], limit = 6): string[] {
  const latest = new Map<string, string>();
  for (const s of grains) {
    if (!s.category) continue;
    const prev = latest.get(s.category);
    if (!prev || cmpAt(s.updated, prev) > 0) latest.set(s.category, s.updated);
  }
  return [...latest.entries()]
    .sort((a, b) => cmpAt(b[1], a[1]))
    .slice(0, limit)
    .map(([c]) => c);
}

export function allTags(grains: Grain[]): string[] {
  return [...new Set(grains.flatMap((s) => s.tags))].sort();
}
