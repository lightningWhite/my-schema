/**
 * The full editor. Three modes:
 *  - new:     everything (tidbit, details, kind, category, tags, source, confidence)
 *  - revise:  tidbit, details, confidence and why it changed — a new revision
 *  - succeed: like new, plus why the old idea is being replaced
 */
import { useEffect, useRef, useState } from 'react';
import { KIND_INFO } from '../core/kinds';
import { TIDBIT_SOFT_LENGTH, type NewTidbit } from '../core/tidbit';
import type { Confidence, Kind } from '../core/types';
import { CategoryPicker, ConfidenceChips, KindChips, TagsField } from './parts';

export interface EditorValue {
  /** The tidbit. */
  text: string;
  details?: string;
  kind?: Kind;
  category?: string;
  tags?: string[];
  source?: string;
  confidence?: Confidence;
  why?: string;
}

interface Props {
  mode: 'new' | 'revise' | 'succeed';
  initial: EditorValue;
  categories?: string[];
  recentCategories?: string[];
  saveLabel?: string;
  onSave: (v: NewTidbit & { why?: string }) => void | Promise<void>;
  onCancel: () => void;
}

export function TidbitEditor({ mode, initial, categories = [], recentCategories = [], saveLabel, onSave, onCancel }: Props) {
  const [v, setV] = useState<EditorValue>(initial);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<EditorValue>) => setV((cur) => ({ ...cur, ...patch }));

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Auto-grow both fields with their content.
  useEffect(() => {
    for (const [el, min] of [
      [textRef.current, 0],
      [detailsRef.current, 110],
    ] as const) {
      if (!el) continue;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, min)}px`;
    }
  }, [v.text, v.details]);

  const full = mode !== 'revise';
  const showConfidence = !v.kind || KIND_INFO[v.kind].hasConfidence;
  const unchanged =
    mode === 'revise' &&
    v.text.trim() === initial.text.trim() &&
    (v.details ?? '').trim() === (initial.details ?? '').trim() &&
    v.confidence === initial.confidence;
  const canSave = v.text.trim().length > 0 && !unchanged && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      // An empty details string means "no details" (cleared), not "unchanged".
      await onSave({ ...v, details: v.details ?? '', confidence: showConfidence ? v.confidence : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit();
        } else if (e.key === 'Escape') onCancel();
      }}
    >
      <span className="field-label first">Tidbit</span>
      <textarea
        ref={textRef}
        rows={1}
        className="editor-tidbit"
        value={v.text}
        placeholder={mode === 'succeed' ? 'The idea that replaces it' : 'The short version'}
        onChange={(e) => set({ text: e.target.value })}
        onKeyDown={(e) => {
          // The tidbit is one line; Enter moves on to the details.
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            detailsRef.current?.focus();
          }
        }}
        aria-label="Tidbit"
      />
      {v.text.length > TIDBIT_SOFT_LENGTH && <div className="soft-limit">Tidbits work best short — the rest can go in the details.</div>}
      <span className="field-label">Details (optional)</span>
      <textarea
        ref={detailsRef}
        className="editor-details"
        value={v.details ?? ''}
        placeholder="The context, the why, the example — whatever you'll want to remember about it"
        onChange={(e) => set({ details: e.target.value })}
        aria-label="Details"
      />

      {(mode === 'revise' || mode === 'succeed') && (
        <label className="field">
          <span className="field-label">{mode === 'revise' ? 'What changed? (optional)' : 'Why replace the old idea? (optional)'}</span>
          <input value={v.why ?? ''} onChange={(e) => set({ why: e.target.value })} placeholder={mode === 'revise' ? 'e.g. Lost half the crop in the heat wave' : ''} />
        </label>
      )}

      {full && (
        <>
          <div className="field-label">Kind</div>
          <KindChips value={v.kind} onChange={(kind) => set({ kind })} />
        </>
      )}
      {showConfidence && (
        <>
          <div className="field-label">Confidence</div>
          <ConfidenceChips value={v.confidence} onChange={(confidence) => set({ confidence })} />
        </>
      )}
      {full && (
        <>
          <div className="field-label">Category</div>
          <CategoryPicker value={v.category} recent={recentCategories} all={categories} onChange={(category) => set({ category })} />
          <label className="field">
            <span className="field-label">Tags</span>
            <TagsField value={v.tags ?? []} onChange={(tags) => set({ tags })} />
          </label>
          <label className="field">
            <span className="field-label">Source {v.kind === 'quote' ? '(who said it?)' : '(optional)'}</span>
            <input value={v.source ?? ''} onChange={(e) => set({ source: e.target.value })} placeholder={v.kind === 'quote' ? 'Marcus Aurelius, Meditations' : 'A book, a person, a link…'} />
          </label>
        </>
      )}

      <div className="editor-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={!canSave}>
          {saveLabel ?? (mode === 'revise' ? 'Save revision' : 'Save tidbit')}
        </button>
      </div>
    </form>
  );
}
