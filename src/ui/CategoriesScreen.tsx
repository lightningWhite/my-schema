/**
 * Manage categories: rename, move (use / for subcategories), merge (rename
 * into an existing one) or delete. Tidbits always come along — only their
 * labels change — and every change says what it will do before doing it.
 */
import { useMemo, useState } from 'react';
import { deleteCategoryEverywhere, renameCategoryEverywhere } from '../app/actions';
import { href, useTidbits } from '../app/hooks';
import { allCategories, inCategory, parentCategory, previewRename, resolveCategory } from '../core/categories';
import { isUnsorted } from '../core/tidbit';
import type { Tidbit } from '../core/types';
import { plural } from './format';
import { Empty, Icon } from './parts';

export function CategoriesScreen() {
  const tidbits = useTidbits();
  const [editing, setEditing] = useState<{ path: string; mode: 'rename' | 'delete' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const categories = useMemo(() => allCategories(tidbits ?? []), [tidbits]);
  if (!tidbits) return null;

  const count = (path: string) => tidbits.filter((t) => inCategory(t.category, path)).length;
  const unsorted = tidbits.filter((t) => isUnsorted(t) && t.status !== 'dormant' && t.status !== 'succeeded').length;
  const done = (message: string) => {
    setEditing(null);
    setNotice(message);
  };

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <button className="icon-button" onClick={() => history.back()} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>Categories</h1>
        <span className="header-count">{plural(categories.length, 'category', 'categories')}</span>
      </header>
      {categories.length === 0 ? (
        <Empty title="No categories yet">
          <p>Give a tidbit a category when you add it, or in Organize, and it shows up here.</p>
        </Empty>
      ) : (
        <>
          <p className="muted">
            Rename a category to fix its name, move it under another (write it like <em>Family/Kids</em>), or merge it into one that already exists.
            Tidbits always come along.
          </p>
          {notice && <p className="notice">{notice}</p>}
          <ul className="category-list">
            {categories.map((path) => {
              const depth = path.split('/').length - 1;
              const name = path.split('/').pop()!;
              const active = editing?.path === path ? editing.mode : null;
              return (
                <li key={path} style={{ paddingLeft: depth * 18 }}>
                  <div className="category-row">
                    <a className="category-name" href={href({ name: 'schema', category: path })}>
                      {name}
                    </a>
                    <span className="count">{count(path)}</span>
                    {!active && (
                      <span className="category-actions">
                        <button className="button small subtle" onClick={() => setEditing({ path, mode: 'rename' })}>
                          Rename
                        </button>
                        <button className="button small subtle danger" onClick={() => setEditing({ path, mode: 'delete' })}>
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                  {active === 'rename' && (
                    <RenameForm path={path} tidbits={tidbits} all={categories} onCancel={() => setEditing(null)} onDone={done} />
                  )}
                  {active === 'delete' && <DeleteConfirm path={path} count={count(path)} all={categories} onCancel={() => setEditing(null)} onDone={done} />}
                </li>
              );
            })}
          </ul>
          {unsorted > 0 && (
            <p className="muted small">
              <a href={href({ name: 'schema', category: '\u0000unsorted' })}>{plural(unsorted, 'tidbit')} without a category</a>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RenameForm(props: { path: string; tidbits: Tidbit[]; all: string[]; onCancel: () => void; onDone: (m: string) => void }) {
  const { path } = props;
  const [draft, setDraft] = useState(path);
  const [busy, setBusy] = useState(false);
  // Match existing spellings (so "health" merges into "Health"), but not this
  // category's own — so a capitals-only fix ("garden" → "Garden") still works.
  const others = props.all.filter((c) => !inCategory(c, path));
  const target = resolveCategory(others, draft);
  const preview = target ? previewRename(props.tidbits, path, target) : null;
  const unchanged = !target || target === path;
  const intoItself = !!target && target.startsWith(path + '/');

  const save = async () => {
    if (!target || unchanged) return;
    setBusy(true);
    const n = await renameCategoryEverywhere(path, target);
    props.onDone(`${preview?.merges ? 'Merged into' : 'Moved to'} “${target}” — ${plural(n, 'tidbit')} updated.`);
  };

  return (
    <form
      className="category-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`New name for ${path}`} />
      <p className="small muted">
        {!target
          ? 'Enter a name.'
          : unchanged
            ? 'Type a new name, or a path like Family/Kids to move it.'
            : intoItself
              ? `Moves “${path}” inside itself, as “${target}”. ${plural(preview!.count, 'tidbit')} will move.`
              : preview!.merges
                ? `“${target}” already exists. ${plural(preview!.count, 'tidbit')} will be combined into it.`
                : `${plural(preview!.count, 'tidbit')}${preview!.subcategories ? ` and ${plural(preview!.subcategories, 'subcategory', 'subcategories')}` : ''} will move to “${target}”.`}
      </p>
      <div className="editor-actions">
        <button type="button" className="button small" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit" className="button small primary" disabled={unchanged || busy}>
          {preview?.merges ? 'Merge' : 'Rename'}
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm(props: { path: string; count: number; all: string[]; onCancel: () => void; onDone: (m: string) => void }) {
  const parent = parentCategory(props.path);
  const subs = props.all.filter((c) => c.startsWith(props.path + '/')).length;
  const [busy, setBusy] = useState(false);
  return (
    <div className="category-edit danger-panel">
      <p className="small">
        Delete “{props.path}”{subs ? ` and its ${plural(subs, 'subcategory', 'subcategories')}` : ''}? {plural(props.count, 'tidbit')}{' '}
        {props.count === 1 ? 'moves' : 'move'} to {parent ? `“${parent}”` : 'Unsorted'}. No tidbits are deleted.
      </p>
      <div className="editor-actions">
        <button className="button small" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          className="button small danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const n = await deleteCategoryEverywhere(props.path);
            props.onDone(`Deleted “${props.path}” — ${plural(n, 'tidbit')} moved to ${parent ? `“${parent}”` : 'Unsorted'}.`);
          }}
        >
          Delete category
        </button>
      </div>
    </div>
  );
}
