/**
 * The front door (docs/design.md §6.2): one big input, focused on open.
 * Type, press Enter, done. Chips for kind / category / confidence appear for
 * the tidbit just saved; ignore them and it stays Unsorted. While typing,
 * matching tidbits already in the schema show below, so a near-duplicate can
 * become a revision instead.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { capture, editMeta, finishTidbit, reviseTidbit } from '../app/actions';
import { href, useTidbits, useNow } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { KIND_INFO, suggestKind } from '../core/kinds';
import { similarTidbits } from '../core/search';
import { currentRevision, displayTitle, splitTidbit, TIDBIT_SOFT_LENGTH } from '../core/tidbit';
import type { Kind, Tidbit } from '../core/types';
import { TidbitEditor } from './TidbitEditor';
import { PassingStrip } from './PassingStrip';
import { CategoryPicker, ConfidenceChips, Icon, KindBadge, KindChips, Logo } from './parts';

export function CaptureScreen() {
  const tidbits = useTidbits() ?? [];
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

  const matches = useMemo(() => (text.trim().length >= 3 ? similarTidbits(tidbits, text, 4) : []), [tidbits, text]);
  const saved = justSaved ? tidbits.find((s) => s.id === justSaved) : undefined;

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    const kind = suggestKind(t);
    // Quick captures are drafts until looked over in Organize.
    const tidbit = await capture({ text: t, details, kind, draft: true });
    setText('');
    setDetails('');
    setShowDetails(false);
    setJustSaved(tidbit.id);
    inputRef.current?.focus();
  };

  if (expanded) {
    return (
      <div className="screen narrow">
        <header className="screen-header">
          <button className="icon-button" onClick={() => setExpanded(false)} aria-label="Back">
            <Icon name="back" />
          </button>
          <h1>New tidbit</h1>
        </header>
        <TidbitEditor
          mode="new"
          initial={{ text, details, kind: suggestKind(text) }}
          categories={allCategories(tidbits)}
          recentCategories={recentCategories(tidbits)}
          onCancel={() => setExpanded(false)}
          onSave={async (input) => {
            const tidbit = await capture(input);
            setText('');
            setDetails('');
            setShowDetails(false);
            setExpanded(false);
            setJustSaved(tidbit.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`screen capture${tidbits.length ? ' has-passing' : ''}`}>
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
            aria-label="New tidbit"
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
          <button type="submit" className="icon-button primary" disabled={!text.trim()} aria-label="Save tidbit">
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

        {saved && <SavedCard tidbit={saved} tidbits={tidbits} onDone={() => setJustSaved(null)} />}

        {matches.length > 0 && (
          <section className="matches" aria-label="Similar tidbits already in your schema">
            <h2>Already in your schema?</h2>
            {matches.map((m) => (
              <MatchRow key={m.id} tidbit={m} draft={text} onRevised={() => setText('')} />
            ))}
          </section>
        )}
      </div>
      <PassingStrip tidbits={tidbits} now={now} quiet={text.trim().length > 0 || showDetails} exclude={justSaved ? [justSaved] : []} />
    </div>
  );
}

/** Quick filing for the tidbit just captured. Every tap saves immediately. */
function SavedCard({ tidbit, tidbits, onDone }: { tidbit: Tidbit; tidbits: Tidbit[]; onDone: () => void }) {
  const confidence = currentRevision(tidbit).confidence;
  const showConfidence = !tidbit.kind || KIND_INFO[tidbit.kind].hasConfidence;
  const setKind = (kind: Kind | undefined) => void editMeta(tidbit.id, { kind: kind ?? null });
  return (
    <section className="saved-card" aria-live="polite">
      <div className="saved-head">
        <span className="saved-check">
          <Icon name="check" size={16} />
        </span>
        <span className="saved-title">{tidbit.status === 'draft' ? 'Saved as a draft' : 'Saved'}</span>
        <a className="link" href={href({ name: 'tidbit', id: tidbit.id })}>
          Open
        </a>
        {tidbit.status === 'draft' && (
          <button className="button small" onClick={() => void finishTidbit(tidbit.id)} title="It's ready as it is — skip Organize">
            Done
          </button>
        )}
        <button className="icon-button subtle small" onClick={onDone} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="saved-quote">{displayTitle(tidbit)}</div>
      <div className="field-label">Kind</div>
      <KindChips value={tidbit.kind} onChange={setKind} />
      <div className="field-label">Category</div>
      <CategoryPicker
        value={tidbit.category}
        recent={recentCategories(tidbits.filter((s) => s.id !== tidbit.id))}
        all={allCategories(tidbits)}
        onChange={(c) => void editMeta(tidbit.id, { category: c ?? null })}
      />
      {showConfidence && (
        <>
          <div className="field-label">Confidence</div>
          <ConfidenceChips
            value={confidence}
            onChange={(c) => void reviseTidbit(tidbit.id, { text: currentRevision(tidbit).text, details: currentRevision(tidbit).details ?? '', confidence: c })}
          />
        </>
      )}
    </section>
  );
}

function MatchRow({ tidbit, draft, onRevised }: { tidbit: Tidbit; draft: string; onRevised: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="match-row">
      <a href={href({ name: 'tidbit', id: tidbit.id })} className="match-main">
        <div className="match-title">{displayTitle(tidbit)}</div>
        <div className="tidbit-row-meta">
          <KindBadge kind={tidbit.kind} />
          <span className="cat">{tidbit.category ?? 'Unsorted'}</span>
        </div>
      </a>
      {confirm ? (
        <div className="match-actions">
          <button
            className="button small primary"
            onClick={async () => {
              await reviseTidbit(tidbit.id, { text: draft, confidence: currentRevision(tidbit).confidence });
              onRevised();
              location.hash = href({ name: 'tidbit', id: tidbit.id });
            }}
          >
            Replace its text
          </button>
          <button className="button small" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="button small" onClick={() => setConfirm(true)} title="Save what you typed as a new revision of this tidbit">
          Revise this
        </button>
      )}
    </div>
  );
}
