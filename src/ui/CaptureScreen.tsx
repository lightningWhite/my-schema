/**
 * The front door (docs/design.md §6.2): one big input, focused on open.
 * Type, press Enter, done. Chips for kind / category / confidence appear for
 * the grain just saved; ignore them and it stays Unsorted. While typing,
 * matching grains already in the schema show below, so a near-duplicate can
 * become a revision instead.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { capture, editMeta, reviseGrain } from '../app/actions';
import { href, useGrains } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { KIND_INFO, suggestKind } from '../core/kinds';
import { similarGrains } from '../core/search';
import { currentRevision, displayTitle, SOFT_LENGTH } from '../core/grain';
import type { Kind, Grain } from '../core/types';
import { GrainEditor } from './GrainEditor';
import { CategoryPicker, ConfidenceChips, Icon, KindBadge, KindChips, Logo } from './parts';

export function CaptureScreen() {
  const grains = useGrains() ?? [];
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

  const matches = useMemo(() => (text.trim().length >= 3 ? similarGrains(grains, text, 4) : []), [grains, text]);
  const saved = justSaved ? grains.find((s) => s.id === justSaved) : undefined;

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    const kind = suggestKind(t);
    const grain = await capture({ text: t, kind });
    setText('');
    setJustSaved(grain.id);
    inputRef.current?.focus();
  };

  if (expanded) {
    return (
      <div className="screen narrow">
        <header className="screen-header">
          <button className="icon-button" onClick={() => setExpanded(false)} aria-label="Back">
            <Icon name="back" />
          </button>
          <h1>New grain</h1>
        </header>
        <GrainEditor
          mode="new"
          initial={{ text, kind: suggestKind(text) }}
          categories={allCategories(grains)}
          recentCategories={recentCategories(grains)}
          onCancel={() => setExpanded(false)}
          onSave={async (input) => {
            const grain = await capture(input);
            setText('');
            setExpanded(false);
            setJustSaved(grain.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen capture">
      <div className="capture-hero">
        <div className="brand">
          <Logo size={34} />
          <span>Schema</span>
        </div>
        <p className="tagline">Turn tidbits in passing into guideposts.</p>

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
            aria-label="New grain"
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
          <button type="submit" className="icon-button primary" disabled={!text.trim()} aria-label="Save grain">
            <Icon name="send" />
          </button>
        </form>
        <div className="capture-hint">
          {text.length > SOFT_LENGTH ? (
            <span className="soft-limit">Grains work best short — maybe a title and a summary first line? (Keep going if you need to.)</span>
          ) : (
            <span>
              <kbd>Enter</kbd> to save · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
            </span>
          )}
        </div>

        {saved && <SavedCard grain={saved} grains={grains} onDone={() => setJustSaved(null)} />}

        {matches.length > 0 && (
          <section className="matches" aria-label="Similar grains already in your schema">
            <h2>Already in your schema?</h2>
            {matches.map((m) => (
              <MatchRow key={m.id} grain={m} draft={text} onRevised={() => setText('')} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

/** Quick filing for the grain just captured. Every tap saves immediately. */
function SavedCard({ grain, grains, onDone }: { grain: Grain; grains: Grain[]; onDone: () => void }) {
  const confidence = currentRevision(grain).confidence;
  const showConfidence = !grain.kind || KIND_INFO[grain.kind].hasConfidence;
  const setKind = (kind: Kind | undefined) => void editMeta(grain.id, { kind: kind ?? null });
  return (
    <section className="saved-card" aria-live="polite">
      <div className="saved-head">
        <span className="saved-check">
          <Icon name="check" size={16} />
        </span>
        <span className="saved-title">Saved{grain.category ? '' : ' to Unsorted'}</span>
        <a className="link" href={href({ name: 'grain', id: grain.id })}>
          Open
        </a>
        <button className="icon-button subtle small" onClick={onDone} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="saved-quote">{displayTitle(grain)}</div>
      <div className="field-label">Kind</div>
      <KindChips value={grain.kind} onChange={setKind} />
      <div className="field-label">Category</div>
      <CategoryPicker
        value={grain.category}
        recent={recentCategories(grains.filter((s) => s.id !== grain.id))}
        all={allCategories(grains)}
        onChange={(c) => void editMeta(grain.id, { category: c ?? null })}
      />
      {showConfidence && (
        <>
          <div className="field-label">Confidence</div>
          <ConfidenceChips
            value={confidence}
            onChange={(c) => void reviseGrain(grain.id, { text: currentRevision(grain).text, confidence: c })}
          />
        </>
      )}
    </section>
  );
}

function MatchRow({ grain, draft, onRevised }: { grain: Grain; draft: string; onRevised: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="match-row">
      <a href={href({ name: 'grain', id: grain.id })} className="match-main">
        <div className="match-title">{displayTitle(grain)}</div>
        <div className="grain-row-meta">
          <KindBadge kind={grain.kind} />
          <span className="cat">{grain.category ?? 'Unsorted'}</span>
        </div>
      </a>
      {confirm ? (
        <div className="match-actions">
          <button
            className="button small primary"
            onClick={async () => {
              await reviseGrain(grain.id, { text: draft, confidence: currentRevision(grain).confidence });
              onRevised();
              location.hash = href({ name: 'grain', id: grain.id });
            }}
          >
            Replace its text
          </button>
          <button className="button small" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="button small" onClick={() => setConfirm(true)} title="Save what you typed as a new revision of this grain">
          Revise this
        </button>
      )}
    </div>
  );
}
