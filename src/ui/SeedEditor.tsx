/**
 * The full editor. Three modes:
 *  - new:     everything (text, title, kind, category, tags, source, confidence)
 *  - revise:  text, confidence and why it changed — a new revision
 *  - succeed: like new, plus why the old idea is being replaced
 */
import { useEffect, useRef, useState } from 'react';
import { KIND_INFO } from '../core/kinds';
import { SOFT_LENGTH, type NewSeed } from '../core/seed';
import type { Confidence, Kind } from '../core/types';
import { CategoryPicker, ConfidenceChips, KindChips, TagsField } from './parts';

export interface EditorValue {
  text: string;
  title?: string;
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
  onSave: (v: NewSeed & { why?: string }) => void | Promise<void>;
  onCancel: () => void;
}

export function SeedEditor({ mode, initial, categories = [], recentCategories = [], saveLabel, onSave, onCancel }: Props) {
  const [v, setV] = useState<EditorValue>(initial);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<EditorValue>) => setV((cur) => ({ ...cur, ...patch }));

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [v.text]);

  const full = mode !== 'revise';
  const showConfidence = !v.kind || KIND_INFO[v.kind].hasConfidence;
  const unchanged = mode === 'revise' && v.text.trim() === initial.text.trim() && v.confidence === initial.confidence;
  const canSave = v.text.trim().length > 0 && !unchanged && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({ ...v, confidence: showConfidence ? v.confidence : undefined });
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
      {full && (
        <input className="editor-title" placeholder="Title (optional)" value={v.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
      )}
      <textarea
        ref={textRef}
        className="editor-text"
        value={v.text}
        placeholder={mode === 'succeed' ? 'The idea that replaces it…' : 'Write it down…'}
        onChange={(e) => set({ text: e.target.value })}
        aria-label="Seed text"
      />
      {v.text.length > SOFT_LENGTH && (
        <div className="soft-limit">Seeds work best short — maybe a title and a summary first line? Long is fine if it needs it.</div>
      )}

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
          {saveLabel ?? (mode === 'revise' ? 'Save revision' : 'Save seed')}
        </button>
      </div>
    </form>
  );
}
