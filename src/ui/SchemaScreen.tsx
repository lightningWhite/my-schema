/** Everything in the schema: category tree, filters and search. */
import { useMemo, useState } from 'react';
import { navigate, useNow, useTidbits } from '../app/hooks';
import { categoryTree, type CategoryNode } from '../core/categories';
import { KIND_INFO } from '../core/kinds';
import { searchTidbits } from '../core/search';
import { isUnsorted } from '../core/tidbit';
import { cmpAt } from '../core/time';
import { KINDS, type Kind, type Tidbit } from '../core/types';
import { plural } from './format';
import { Chip, Empty, TidbitRow } from './parts';

type StatusFilter = 'current' | 'drafts' | 'retired' | 'all';
const UNSORTED = '\u0000unsorted';

export function SchemaScreen({ category, query }: { category?: string; query?: string }) {
  const tidbits = useTidbits();
  const now = useNow();
  const [q, setQ] = useState(query ?? '');
  const [kind, setKind] = useState<Kind | undefined>();
  const [status, setStatus] = useState<StatusFilter>('current');

  const setCategory = (c: string | undefined) => navigate({ name: 'schema', category: c, query: q || undefined }, true);

  const tree = useMemo(() => categoryTree(tidbits ?? []), [tidbits]);
  const list = useMemo(() => {
    let out: Tidbit[] = tidbits ?? [];
    if (status === 'current') out = out.filter((s) => s.status === 'active' || s.status === 'draft');
    else if (status === 'drafts') out = out.filter((s) => s.status === 'draft');
    else if (status === 'retired') out = out.filter((s) => s.status === 'dormant' || s.status === 'succeeded');
    if (kind) out = out.filter((s) => s.kind === kind);
    if (category === UNSORTED) out = out.filter(isUnsorted);
    else if (category) out = out.filter((s) => s.category === category || s.category?.startsWith(category + '/'));
    if (q.trim()) return searchTidbits(out, q, 500).map((h) => h.tidbit);
    return [...out].sort((a, b) => cmpAt(b.updated, a.updated));
  }, [tidbits, status, kind, category, q]);

  if (!tidbits) return null;
  if (tidbits.length === 0) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>Schema</h1>
        </header>
        <Empty title="Your schema is empty">
          <p>
            <a href="#/">Capture your first tidbit</a> — something you've noticed, learned or come to believe.
          </p>
        </Empty>
      </div>
    );
  }

  const unsortedCount = tidbits.filter((s) => (s.status === 'active' || s.status === 'draft') && isUnsorted(s)).length;

  return (
    <div className="screen schema">
      <header className="screen-header">
        <h1>Schema</h1>
        <span className="header-count">{plural(tidbits.length, 'tidbit')}</span>
      </header>
      <div className="schema-layout">
        <nav className="tree" aria-label="Categories">
          <button className={`tree-item${!category ? ' selected' : ''}`} onClick={() => setCategory(undefined)}>
            <span>All tidbits</span>
          </button>
          {unsortedCount > 0 && (
            <button className={`tree-item${category === UNSORTED ? ' selected' : ''}`} onClick={() => setCategory(UNSORTED)}>
              <span>Unsorted</span>
              <span className="count">{unsortedCount}</span>
            </button>
          )}
          {tree.map((n) => (
            <TreeNode key={n.path} node={n} selected={category} onSelect={setCategory} depth={0} />
          ))}
        </nav>
        <div className="schema-main">
          <input className="search" type="search" placeholder="Search your schema" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <div className="filters">
            <div className="chips">
              {KINDS.map((k) => (
                <Chip key={k} selected={kind === k} onClick={() => setKind(kind === k ? undefined : k)}>
                  {KIND_INFO[k].label}
                </Chip>
              ))}
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
              <option value="current">Active &amp; drafts</option>
              <option value="drafts">Drafts</option>
              <option value="retired">Dormant &amp; succeeded</option>
              <option value="all">All</option>
            </select>
          </div>
          {list.length ? (
            <div className="tidbit-list">
              {list.map((s) => (
                <TidbitRow key={s.id} tidbit={s} now={now} />
              ))}
            </div>
          ) : (
            <p className="muted center">No tidbits match.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, selected, onSelect, depth }: { node: CategoryNode; selected?: string; onSelect: (c: string) => void; depth: number }) {
  const [open, setOpen] = useState(selected?.startsWith(node.path) ?? false);
  return (
    <>
      <div className="tree-row" style={{ paddingLeft: depth * 14 }}>
        {node.children.length > 0 ? (
          <button className="tree-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-toggle" />
        )}
        <button className={`tree-item${selected === node.path ? ' selected' : ''}`} onClick={() => onSelect(node.path)}>
          <span>{node.name}</span>
          <span className="count">{node.total}</span>
        </button>
      </div>
      {open && node.children.map((c) => <TreeNode key={c.path} node={c} selected={selected} onSelect={onSelect} depth={depth + 1} />)}
    </>
  );
}
