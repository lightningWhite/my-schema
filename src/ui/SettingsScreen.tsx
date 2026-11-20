import { useEffect, useRef, useState } from 'react';
import { exportZip, importFiles, saveSettings } from '../app/actions';
import { useGrains, useSettings } from '../app/hooks';
import { allCategories } from '../core/categories';
import type { Appearance, Style, Theme } from '../app/theme';
import { plural } from './format';

const STYLES: Array<{ id: Style; name: string; hint: string }> = [
  { id: 'focus', name: 'Focus', hint: 'Cool and crisp. For thinking in systems.' },
  { id: 'reflect', name: 'Reflect', hint: 'Warm and soft. For journaling and reflection.' },
];
const APPEARANCES: Array<{ id: Appearance; name: string }> = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

export function SettingsScreen({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const settings = useSettings();
  const grains = useGrains() ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const doExport = async () => {
    const blob = await exportZip();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Settings</h1>
      </header>

      <section className="settings-section">
        <h2>Style</h2>
        <div className="style-options" role="radiogroup" aria-label="Style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={theme.style === s.id}
              className={`style-option ${s.id}${theme.style === s.id ? ' selected' : ''}`}
              onClick={() => onTheme({ ...theme, style: s.id })}
            >
              <strong>{s.name}</strong>
              <span>{s.hint}</span>
            </button>
          ))}
        </div>
        <div className="field inline">
          <span>Appearance</span>
          <div className="segmented" role="radiogroup" aria-label="Appearance">
            {APPEARANCES.map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={theme.appearance === a.id}
                className={theme.appearance === a.id ? 'selected' : ''}
                onClick={() => onTheme({ ...theme, appearance: a.id })}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Review</h2>
        <label className="field inline">
          <span>Grains per day</span>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.reviewSize}
            onChange={(e) => void saveSettings({ ...settings, reviewSize: Math.max(1, Math.min(50, Number(e.target.value) || 5)) })}
          />
        </label>
        <label className="field inline">
          <span>Focus on</span>
          <select value={settings.reviewFocus ?? ''} onChange={(e) => void saveSettings({ ...settings, reviewFocus: e.target.value || undefined })}>
            <option value="">Everything</option>
            {allCategories(grains).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="settings-section">
        <h2>Your data</h2>
        <p className="muted">
          Your {plural(grains.length, 'grain')} live on this device only, until GitHub sync arrives. Export now and then to keep a backup — the zip
          holds one readable Markdown file per grain.
        </p>
        {persisted === false && (
          <p className="warning">
            This browser may clear the schema if the device runs low on space.{' '}
            <button className="link-button" onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}>
              Ask it to keep the data
            </button>
            {' '}(installing Schema to your home screen also helps).
          </p>
        )}
        <div className="button-row">
          <button className="button primary" onClick={() => void doExport()} disabled={!grains.length}>
            Export schema (.zip)
          </button>
          <button className="button" onClick={() => fileRef.current?.click()}>
            Import…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.md"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (!files.length) return;
              try {
                const r = await importFiles(files);
                setMessage(
                  `Imported: ${plural(r.added, 'new grain')}, ${plural(r.merged, 'grain')} merged with what was here.` +
                    (r.errors.length ? ` ${plural(r.errors.length, 'file')} couldn't be read: ${r.errors.map((x) => x.path).join(', ')}` : ''),
                );
              } catch (err) {
                setMessage(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </div>
        <p className="muted small">Importing merges: nothing already here is overwritten, and histories are combined.</p>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="settings-section">
        <h2>About</h2>
        <p className="muted">
          What Schema is for and how it works. <a href="#/about">Read about Schema</a>
        </p>
      </section>

      <section className="settings-section">
        <h2>Coming next</h2>
        <ul className="muted">
          <li>Sync to a private GitHub repo, so your schema is backed up and on every device.</li>
          <li>Publishing grains to a public schema, and planting other people's grains in yours.</li>
        </ul>
      </section>
    </div>
  );
}
