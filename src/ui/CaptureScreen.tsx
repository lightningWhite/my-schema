/**
 * The front door (docs/design.md §6.2): one big input, focused on open.
 * Type, press Enter, done. Chips for kind / category / confidence appear for
 * the grain just saved; ignore them and it stays Unsorted. While typing,
 * matching grains already in the schema show below, so a near-duplicate can
 * become a revision instead.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { capture, editMeta, finishGrain, reviseGrain } from '../app/actions';
import { href, useGrains, useNow } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { KIND_INFO, suggestKind } from '../core/kinds';
import { similarGrains } from '../core/search';
import { currentRevision, displayTitle, splitTidbit, TIDBIT_SOFT_LENGTH } from '../core/grain';
import type { Kind, Grain } from '../core/types';
import { GrainEditor } from './GrainEditor';
import { PassingStrip } from './PassingStrip';
import { CategoryPicker, ConfidenceChips, Icon, KindBadge, KindChips, Logo } from './parts';

export function CaptureScreen() {
  const grains = useGrains() ?? [];
  const now = useNow();
  const [text, setText] = useState('');
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const detailsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Auto-grow the field with its content.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [details, showDetails]);

  const openDetails = () => {
    setShowDetails(true);
    // After the field renders.
    requestAnimationFrame(() => detailsRef.current?.focus());
  };

  const matches = useMemo(() => (text.trim().length >= 3 ? similarGrains(grains, text, 4) : []), [grains, text]);
  const saved = justSaved ? grains.find((s) => s.id === justSaved) : undefined;

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    const kind = suggestKind(t);
    // Quick captures are drafts until looked over in Organize.
    const grain = await capture({ text: t, details, kind, draft: true });
    setText('');
    setDetails('');
    setShowDetails(false);
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
          initial={{ text, details, kind: suggestKind(text) }}
          categories={allCategories(grains)}
          recentCategories={recentCategories(grains)}
          onCancel={() => setExpanded(false)}
          onSave={async (input) => {
            const grain = await capture(input);
            setText('');
            setDetails('');
            setShowDetails(false);
            setExpanded(false);
            setJustSaved(grain.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`screen capture${grains.length ? ' has-passing' : ''}`}>
      <div className="capture-hero">
        <div className="brand">
          <Logo size={34} />
          <span>Schema</span>
        </div>
        <p className="tagline">Turn passing tidbits into guideposts.</p>

        <form
          className={`capture-box${showDetails ? ' with-details' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="capture-row">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder="Add a tidbit"
            aria-label="New grain"
            onChange={(e) => {
              setText(e.target.value);
              if (justSaved) setJustSaved(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              // The tidbit is one line: Enter saves, Shift+Enter goes to the details.
              if (e.shiftKey) openDetails();
              else void save();
            }}
            onPaste={(e) => {
              // Pasting several lines: first line is the tidbit, the rest are details.
              const pasted = e.clipboardData.getData('text');
              if (!pasted.includes('\n') || text.trim() || details.trim()) return;
              e.preventDefault();
              const split = splitTidbit(pasted);
              setText(split.text);
              if (split.details) {
                setDetails(split.details);
                setShowDetails(true);
              }
            }}
          />
          <button type="button" className="icon-button subtle" onClick={() => setExpanded(true)} aria-label="Open full editor" title="Full editor">
            <Icon name="expand" size={18} />
          </button>
          <button type="submit" className="icon-button primary" disabled={!text.trim()} aria-label="Save grain">
            <Icon name="send" />
          </button>
          </div>
          {showDetails && (
            <textarea
              ref={detailsRef}
              className="capture-details"
              value={details}
              placeholder="Details — the context, the why, the example"
              aria-label="Details"
              onChange={(e) => setDetails(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void save();
                } else if (e.key === 'Backspace' && !details) {
                  // Backspace in an empty details field goes back to the tidbit.
                  e.preventDefault();
                  setShowDetails(false);
                  inputRef.current?.focus();
                }
              }}
            />
          )}
        </form>
        <div className="capture-hint">
          {text.length > TIDBIT_SOFT_LENGTH && !showDetails ? (
            <span className="soft-limit">
              Tidbits work best short. <button type="button" className="link-button" onClick={openDetails}>Put the rest in details</button>
            </span>
          ) : showDetails ? (
            <span>
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or → to save
            </span>
          ) : (
            <span>
              <kbd>Enter</kbd> to save ·{' '}
              <button type="button" className="link-button quiet" onClick={openDetails}>
                <kbd>Shift</kbd>+<kbd>Enter</kbd> to add details
              </button>
            </span>
          )}
        </div>
        <a className="about-link" href={href({ name: 'about' })}>
          About Schema
        </a>

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
      <PassingStrip grains={grains} now={now} quiet={text.trim().length > 0 || showDetails} exclude={justSaved ? [justSaved] : []} />
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
        <span className="saved-title">{grain.status === 'draft' ? 'Saved as a draft' : 'Saved'}</span>
        <a className="link" href={href({ name: 'grain', id: grain.id })}>
          Open
        </a>
        {grain.status === 'draft' && (
          <button className="button small" onClick={() => void finishGrain(grain.id)} title="It's ready as it is — skip Organize">
            Done
          </button>
        )}
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
            onChange={(c) => void reviseGrain(grain.id, { text: currentRevision(grain).text, details: currentRevision(grain).details ?? '', confidence: c })}
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
