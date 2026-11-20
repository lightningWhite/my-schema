/** Retiring a grain: let it go dormant, or replace it with a different idea. */
import { useState } from 'react';
import { dormantGrain, succeedGrain } from '../app/actions';
import type { Grain } from '../core/types';
import { GrainEditor } from './GrainEditor';

export function RetirePanel({ grain, categories, onDone, onCancel }: { grain: Grain; categories: string[]; onDone: (successorId?: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'choose' | 'dormant' | 'succeed'>('choose');
  const [why, setWhy] = useState('');

  if (mode === 'succeed') {
    return (
      <div className="panel">
        <h3>Replace it with a new idea</h3>
        <p className="muted">The old grain stays in your schema, marked as succeeded and linked to the new one.</p>
        <GrainEditor
          mode="succeed"
          initial={{ text: '', kind: grain.kind, category: grain.category, tags: grain.tags }}
          categories={categories}
          saveLabel="Save new idea"
          onCancel={() => setMode('choose')}
          onSave={async ({ why: w, ...input }) => {
            const successor = await succeedGrain(grain.id, input, w);
            onDone(successor.id);
          }}
        />
      </div>
    );
  }

  if (mode === 'dormant') {
    return (
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          await dormantGrain(grain.id, why);
          onDone();
        }}
      >
        <h3>Let it go dormant</h3>
        <p className="muted">You don't hold this anymore and nothing replaces it. It stays in your schema, out of reviews.</p>
        <label className="field">
          <span className="field-label">Why? (optional, but future you will want to know)</span>
          <input autoFocus value={why} onChange={(e) => setWhy(e.target.value)} />
        </label>
        <div className="editor-actions">
          <button type="button" className="button" onClick={() => setMode('choose')}>
            Back
          </button>
          <button type="submit" className="button primary">
            Go dormant
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="panel">
      <h3>Retire this grain</h3>
      <div className="choice-list">
        <button className="choice" onClick={() => setMode('succeed')}>
          <strong>A different idea replaces it</strong>
          <span>Write the new idea now; the two stay linked.</span>
        </button>
        <button className="choice" onClick={() => setMode('dormant')}>
          <strong>I just don't hold it anymore</strong>
          <span>It goes dormant, with a note on why.</span>
        </button>
      </div>
      <div className="editor-actions">
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
