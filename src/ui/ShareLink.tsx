/**
 * "Share Schema": the phone's own share menu where there is one, otherwise
 * copy the link. Shares the app's address only, never anything from the
 * person's schema.
 */
import { useState } from 'react';

const TEXT = 'Schema: a free, private place to keep what you notice, learn and come to believe — and be reminded of it.';

export function ShareLink() {
  const [copied, setCopied] = useState(false);
  const url = location.origin + location.pathname;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Schema', text: TEXT, url });
        return;
      } catch (e) {
        // Closing the share menu isn't an error; anything else falls back to copying.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link to share Schema:', url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button type="button" className="footer-link" onClick={() => void share()}>
      {copied ? 'Link copied' : 'Share Schema'}
    </button>
  );
}
