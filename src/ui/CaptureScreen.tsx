/**
 * The front door (docs/design.md §6.2): one big input, focused on open.
 * Type, press Enter, done. Chips for kind / category / confidence appear for
 * the seed just saved; ignore them and it stays Unsorted. While typing,
 * matching seeds already in the bank show below, so a near-duplicate can
 * become a revision instead.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { capture, editMeta, reviseSeed } from '../app/actions';
import { href, useSeeds } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { KIND_INFO, suggestKind } from '../core/kinds';
import { similarSeeds } from '../core/search';
import { currentRevision, displayTitle, SOFT_LENGTH } from '../core/seed';
import type { Kind, Seed } from '../core/types';
import { SeedEditor } from './SeedEditor';
import { CategoryPicker, ConfidenceChips, Icon, KindBadge, KindChips } from './parts';

export function CaptureScreen() {
  const seeds = useSeeds() ?? [];
  const [text, setText] = useState('');
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Auto-grow the field with its content.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const matches = useMemo(() => (text.trim().length >= 3 ? similarSeeds(seeds, text, 4) : []), [seeds, text]);
  const saved = justSaved ? seeds.find((s) => s.id === justSaved) : undefined;

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    const kind = suggestKind(t);
    const seed = await capture({ text: t, kind });
    setText('');
    setJustSaved(seed.id);
    inputRef.current?.focus();
  };

  if (expanded) {
    return (
      <div className="screen narrow">
        <header className="screen-header">
          <button className="icon-button" onClick={() => setExpanded(false)} aria-label="Back">
            <Icon name="back" />
          </button>
          <h1>New seed</h1>
        </header>
        <SeedEditor
          mode="new"
          initial={{ text, kind: suggestKind(text) }}
          categories={allCategories(seeds)}
          recentCategories={recentCategories(seeds)}
          onCancel={() => setExpanded(false)}
          onSave={async (input) => {
            const seed = await capture(input);
            setText('');
            setExpanded(false);
            setJustSaved(seed.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen capture">
      <div className="capture-hero">
        <div className="brand">
          <Icon name="sprout" size={28} />
          <span>Seedbank</span>
        </div>

        <form
          className="capture-box"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder="What have you noticed, learned or come to believe?"
            aria-label="New seed"
            onChange={(e) => {
              setText(e.target.value);
              if (justSaved) setJustSaved(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void save();
              }
            }}
          />
          <button type="button" className="icon-button subtle" onClick={() => setExpanded(true)} aria-label="Open full editor" title="Full editor">
            <Icon name="expand" size={18} />
          </button>
          <button type="submit" className="icon-button primary" disabled={!text.trim()} aria-label="Save seed">
            <Icon name="send" />
          </button>
        </form>
        <div className="capture-hint">
          {text.length > SOFT_LENGTH ? (
            <span className="soft-limit">Seeds work best short — maybe a title and a summary first line? (Keep going if you need to.)</span>
          ) : (
            <span>
              <kbd>Enter</kbd> to save · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
            </span>
          )}
        </div>

        {saved && <SavedCard seed={saved} seeds={seeds} onDone={() => setJustSaved(null)} />}

        {matches.length > 0 && (
          <section className="matches" aria-label="Similar seeds already in your bank">
            <h2>Already in your bank?</h2>
            {matches.map((m) => (
              <MatchRow key={m.id} seed={m} draft={text} onRevised={() => setText('')} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

/** Quick filing for the seed just captured. Every tap saves immediately. */
function SavedCard({ seed, seeds, onDone }: { seed: Seed; seeds: Seed[]; onDone: () => void }) {
  const confidence = currentRevision(seed).confidence;
  const showConfidence = !seed.kind || KIND_INFO[seed.kind].hasConfidence;
  const setKind = (kind: Kind | undefined) => void editMeta(seed.id, { kind: kind ?? null });
  return (
    <section className="saved-card" aria-live="polite">
      <div className="saved-head">
        <span className="saved-check">
          <Icon name="check" size={16} />
        </span>
        <span className="saved-title">Saved{seed.category ? '' : ' to Unsorted'}</span>
        <a className="link" href={href({ name: 'seed', id: seed.id })}>
          Open
        </a>
        <button className="icon-button subtle small" onClick={onDone} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="saved-quote">{displayTitle(seed)}</div>
      <div className="field-label">Kind</div>
      <KindChips value={seed.kind} onChange={setKind} />
      <div className="field-label">Category</div>
      <CategoryPicker
        value={seed.category}
        recent={recentCategories(seeds.filter((s) => s.id !== seed.id))}
        all={allCategories(seeds)}
        onChange={(c) => void editMeta(seed.id, { category: c ?? null })}
      />
      {showConfidence && (
        <>
          <div className="field-label">Confidence</div>
          <ConfidenceChips
            value={confidence}
            onChange={(c) => void reviseSeed(seed.id, { text: currentRevision(seed).text, confidence: c })}
          />
        </>
      )}
    </section>
  );
}

function MatchRow({ seed, draft, onRevised }: { seed: Seed; draft: string; onRevised: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="match-row">
      <a href={href({ name: 'seed', id: seed.id })} className="match-main">
        <div className="match-title">{displayTitle(seed)}</div>
        <div className="seed-row-meta">
          <KindBadge kind={seed.kind} />
          <span className="cat">{seed.category ?? 'Unsorted'}</span>
        </div>
      </a>
      {confirm ? (
        <div className="match-actions">
          <button
            className="button small primary"
            onClick={async () => {
              await reviseSeed(seed.id, { text: draft, confidence: currentRevision(seed).confidence });
              onRevised();
              location.hash = href({ name: 'seed', id: seed.id });
            }}
          >
            Replace its text
          </button>
          <button className="button small" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="button small" onClick={() => setConfirm(true)} title="Save what you typed as a new revision of this seed">
          Revise this
        </button>
      )}
    </div>
  );
}
