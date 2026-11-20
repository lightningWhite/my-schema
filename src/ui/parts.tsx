import { useId, useState, type ReactNode } from 'react';
import { CONFIDENCE_LABEL, KIND_INFO } from '../core/kinds';
import { currentRevision, displayTitle } from '../core/seed';
import { CONFIDENCES, KINDS, type Confidence, type Kind, type Seed } from '../core/types';
import { href } from '../app/hooks';
import { relativeDate } from './format';

// ---------------------------------------------------------------- icons

const PATHS = {
  capture: 'M12 5v14M5 12h14',
  sort: 'M4 6h16M7 12h10M10 18h4',
  review: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  bank: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  send: 'M5 12h14M13 6l6 6-6 6',
  expand: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
  back: 'M15 18l-6-6 6-6',
  check: 'M5 12l5 5L20 7',
  close: 'M6 6l12 12M18 6L6 18',
  sprout: 'M12 21v-9M12 12c0-4-3-7-8-7 0 5 3 7 8 7zM12 10c0-3 2-6 7-6 0 4-2 6-7 6z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------- chips

export function Chip(props: { selected?: boolean; onClick?: () => void; children: ReactNode; title?: string; muted?: boolean }) {
  return (
    <button
      type="button"
      className={`chip${props.selected ? ' selected' : ''}${props.muted ? ' muted' : ''}`}
      aria-pressed={props.selected}
      onClick={props.onClick}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

export function KindBadge({ kind }: { kind?: Kind }) {
  if (!kind) return null;
  return <span className={`kind-badge kind-${kind}`}>{KIND_INFO[kind].label}</span>;
}

export function KindChips({ value, onChange }: { value?: Kind; onChange: (k: Kind | undefined) => void }) {
  return (
    <div className="chips" role="group" aria-label="Kind">
      {KINDS.map((k) => (
        <Chip key={k} selected={value === k} title={KIND_INFO[k].hint} onClick={() => onChange(value === k ? undefined : k)}>
          {KIND_INFO[k].label}
        </Chip>
      ))}
    </div>
  );
}

export function ConfidenceChips({ value, onChange }: { value?: Confidence; onChange: (c: Confidence | undefined) => void }) {
  return (
    <div className="chips" role="group" aria-label="Confidence">
      {CONFIDENCES.map((c) => (
        <Chip key={c} selected={value === c} onClick={() => onChange(value === c ? undefined : c)}>
          {CONFIDENCE_LABEL[c]}
        </Chip>
      ))}
    </div>
  );
}

/**
 * Recent categories as one-tap chips, plus a field for a new or existing
 * path (with autocomplete from every category in the bank).
 */
export function CategoryPicker(props: {
  value?: string;
  recent: string[];
  all: string[];
  suggestion?: string;
  onChange: (c: string | undefined) => void;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const options = [...new Set([...(props.suggestion ? [props.suggestion] : []), ...(props.value ? [props.value] : []), ...props.recent])];
  const submit = () => {
    const v = draft.trim();
    if (v) props.onChange(v);
    setDraft('');
  };
  return (
    <div className="chips" role="group" aria-label="Category">
      {options.map((c) => (
        <Chip key={c} selected={props.value === c} onClick={() => props.onChange(props.value === c ? undefined : c)}>
          {c}
        </Chip>
      ))}
      <input
        className="chip-input"
        list={listId}
        placeholder={options.length ? 'Other…' : 'Category, e.g. Garden/Tomatoes'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        onBlur={submit}
        aria-label="New category"
      />
      <datalist id={listId}>
        {props.all.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

export function TagsField({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      value={text}
      placeholder="tags, comma separated"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split(',').filter((t) => t.trim()))}
      aria-label="Tags"
    />
  );
}

// ---------------------------------------------------------------- seeds

export function SeedRow({ seed, now }: { seed: Seed; now: string }) {
  const title = displayTitle(seed);
  const text = currentRevision(seed).text;
  const rest = seed.title ? text : text.slice(text.indexOf(title) + title.length).trim();
  return (
    <a className={`seed-row status-${seed.status}`} href={href({ name: 'seed', id: seed.id })}>
      <div className="seed-row-title">{title}</div>
      {rest && <div className="seed-row-text">{rest}</div>}
      <div className="seed-row-meta">
        <KindBadge kind={seed.kind} />
        {seed.category ? <span className="cat">{seed.category}</span> : <span className="cat unsorted">Unsorted</span>}
        {seed.status !== 'active' && <span className="status-label">{seed.status}</span>}
        <span className="when">{relativeDate(seed.updated, now)}</span>
      </div>
    </a>
  );
}

export function SeedText({ text }: { text: string }) {
  return <div className="seed-text">{text}</div>;
}

export function Empty({ icon = 'sprout', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={32} />
      </div>
      <h2>{title}</h2>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}
