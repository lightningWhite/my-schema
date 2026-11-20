import { useEffect, useRef, useState } from 'react';
import { exportZip, importFiles, saveSettings } from '../app/actions';
import { useSeeds, useSettings } from '../app/hooks';
import { allCategories } from '../core/categories';
import { plural } from './format';

export function SettingsScreen() {
  const settings = useSettings();
  const seeds = useSeeds() ?? [];
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
    a.download = `seedbank-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Settings</h1>
      </header>

      <section className="settings-section">
        <h2>Review</h2>
        <label className="field inline">
          <span>Seeds per day</span>
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
            {allCategories(seeds).map((c) => (
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
          Your {plural(seeds.length, 'seed')} live on this device only, until GitHub sync arrives. Export now and then to keep a backup — the zip
          holds one readable Markdown file per seed.
        </p>
        {persisted === false && (
          <p className="warning">
            This browser may clear the bank if the device runs low on space.{' '}
            <button className="link-button" onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}>
              Ask it to keep the data
            </button>
            {' '}(installing Seedbank to your home screen also helps).
          </p>
        )}
        <div className="button-row">
          <button className="button primary" onClick={() => void doExport()} disabled={!seeds.length}>
            Export bank (.zip)
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
                  `Imported: ${plural(r.added, 'new seed')}, ${plural(r.merged, 'seed')} merged with what was here.` +
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
        <h2>Coming next</h2>
        <ul className="muted">
          <li>Sync to a private GitHub repo, so your bank is backed up and on every device.</li>
          <li>Publishing seeds to a public bank, and planting other people's seeds in yours.</li>
        </ul>
      </section>
    </div>
  );
}
