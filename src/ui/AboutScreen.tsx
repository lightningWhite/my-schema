/** What Schema is for, and how it works. Linked from the home screen and Settings. */
import { KIND_INFO } from '../core/kinds';
import { KINDS } from '../core/types';
import { Icon, KindBadge, Logo } from './parts';

export function AboutScreen() {
  return (
    <div className="screen narrow about">
      <header className="screen-header">
        <button className="icon-button" onClick={() => history.back()} aria-label="Back">
          <Icon name="back" />
        </button>
      </header>

      <div className="about-hero">
        <Logo size={48} />
        <h1>Schema</h1>
        <p className="about-lead">Capture the schema that defines you now — and leave room to grow.</p>
      </div>

      <section>
        <h2>Why</h2>
        <p>
          Most of what we learn slips away. We notice something true about ourselves, learn a lesson the hard way, hear a line that lands — and two
          weeks later it's gone, and we're back where we started.
        </p>
        <p>
          Schema is a place to catch those tidbits as they pass, and to be reminded of them, so they become guideposts: things that keep shaping
          how you think and decide, for your own good and for the people around you.
        </p>
      </section>

      <section>
        <h2>Why "schema"</h2>
        <p>
          In psychology, a <em>schema</em> is the framework of beliefs and experience you see the world through. When experience doesn't fit, you
          revise it — that's how a mind grows. In software, a schema is the structure things conform to so they work.
        </p>
        <p>Your personal schema is both: what you've come to understand, written down so your choices can line up with it.</p>
      </section>

      <section>
        <h2>How it works</h2>
        <dl className="about-steps">
          <dt>Capture</dt>
          <dd>
            Type a tidbit and press Enter. That's all it takes. Need more room? Shift+Enter adds details under it — the context, the why, the
            example. Each tidbit starts as a draft.
          </dd>
          <dt>Organize</dt>
          <dd>
            When you have a minute, look over your drafts one at a time: tidy the wording, give it a kind and a category, and mark it done. Or
            discard it — not every passing thought needs keeping.
          </dd>
          <dt>Review</dt>
          <dd>
            A few tidbits come back each day. Mark them <strong>Still true</strong>, <strong>revise</strong> them, or <strong>retire</strong> them.
            The more often you reaffirm one, the less often it returns — but values and practices never drift away entirely.
          </dd>
          <dt>In passing</dt>
          <dd>Past tidbits drift along the bottom of the home screen, in case one catches your eye. No need to do anything with them.</dd>
          <dt>Your schema</dt>
          <dd>Browse everything by category and kind, search it, and see each tidbit's history.</dd>
        </dl>
      </section>

      <section>
        <h2>Tidbits change</h2>
        <p>
          Nothing is overwritten. <strong>Revise</strong> a tidbit when you see the same idea more sharply; the old wording stays in its history,
          with a note on why it changed. If it turns out to be a different kind of thing — you noticed something, then learned it's a fact —
          change its kind, and that's noted too. <strong>Retire</strong> it when you've outgrown it — it goes dormant, or a new idea succeeds it — and
          it stays in your schema as a record of what you used to think. Over time, how your thinking changed becomes part of the story.
        </p>
      </section>

      <section>
        <h2>Kinds of tidbits</h2>
        <ul className="about-kinds">
          {KINDS.map((k) => (
            <li key={k}>
              <KindBadge kind={k} />
              <span>{KIND_INFO[k].hint}</span>
            </li>
          ))}
        </ul>
        <p className="muted">
          A practice is reviewed for whether you still believe it helps, not whether you kept it up. Falling short of something you value is
          normal.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          Your tidbits live on this device. There's no account, no server, no tracking. Export a backup from Settings any time — it's a zip of plain
          Markdown files you can read without the app.
        </p>
        <p className="muted">
          Coming next: syncing to your own private GitHub repository, so your schema is backed up and on every device. Later, optionally, sharing
          some tidbits and planting other people's in yours.
        </p>
      </section>

      <p className="about-foot">
        <a href="#/" className="button primary">
          Add a tidbit
        </a>
      </p>
    </div>
  );
}
