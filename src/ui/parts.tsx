import { useId, useState, type ReactNode } from 'react';
import { CONFIDENCE_LABEL, KIND_INFO } from '../core/kinds';
import { currentRevision, displayTitle } from '../core/tidbit';
import { CONFIDENCES, KINDS, type Confidence, type Kind, type Tidbit, type Revision } from '../core/types';
import { href } from '../app/hooks';
import { relativeDate } from './format';

// ---------------------------------------------------------------- icons

const PATHS = {
  capture: 'M12 5v14M5 12h14',
  organize: 'M4 6h16M7 12h10M10 18h4',
  review: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  // Linked nodes, matching the logo.
  schema: 'M8.4 7.6l7.4 1.6M16.2 11.4l-5.4 5.4M7.4 9.8l1.6 5.6M6.5 4.5a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 1 1 0-5.6zM17.5 7.2a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5zM9 15.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  send: 'M5 12h14M13 6l6 6-6 6',
  expand: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
  back: 'M15 18l-6-6 6-6',
  check: 'M5 12l5 5L20 7',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The app mark: linked nodes on an accent tile. Same drawing as public/icon.svg. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <g stroke="var(--accent-ink)" strokeWidth={3} strokeLinecap="round">
        <path d="M20 20L44 26M44 26L26 44M20 20L26 44M44 26L46 46" />
      </g>
      <g fill="var(--accent-ink)">
        <circle cx="20" cy="20" r="6" />
        <circle cx="44" cy="26" r="5" />
        <circle cx="26" cy="44" r="5" />
        <circle cx="46" cy="46" r="3.5" />
      </g>
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
 * path (with autocomplete from every category in the schema).
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

// ---------------------------------------------------------------- tidbits

export function TidbitRow({ tidbit, now }: { tidbit: Tidbit; now: string }) {
  const title = displayTitle(tidbit);
  const cur = currentRevision(tidbit);
  // Under the headline: the details, or (for older tidbits) whatever follows it.
  const rest = cur.details ?? (tidbit.title ? cur.text : cur.text.slice(cur.text.indexOf(title) + title.length).trim());
  return (
    <a className={`tidbit-row status-${tidbit.status}`} href={href({ name: 'tidbit', id: tidbit.id })}>
      <div className="tidbit-row-title">{title}</div>
      {rest && <div className="tidbit-row-text">{rest}</div>}
      <div className="tidbit-row-meta">
        <KindBadge kind={tidbit.kind} />
        {tidbit.category ? <span className="cat">{tidbit.category}</span> : <span className="cat unsorted">Unsorted</span>}
        {tidbit.status !== 'active' && <span className="status-label">{tidbit.status}</span>}
        <span className="when">{relativeDate(tidbit.updated, now)}</span>
      </div>
    </a>
  );
}

export function TidbitText({ text }: { text: string }) {
  return <div className="tidbit-text">{text}</div>;
}

/** A revision as it's read: the tidbit, then its details if it has any. */
export function RevisionBody({ rev, size = 'normal' }: { rev: Revision; size?: 'normal' | 'large' | 'small' }) {
  return (
    <div className={`revision-body ${size}`}>
      <div className="tidbit-headline">{rev.text}</div>
      {rev.details && <div className="tidbit-details">{rev.details}</div>}
    </div>
  );
}

export function Empty({ icon = 'schema', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
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
