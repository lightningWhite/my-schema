/**
 * Style (Focus / Reflect) and appearance (system / light / dark). A per-device
 * preference, so it lives in localStorage rather than the schema itself, and
 * is applied by an inline script in index.html before first paint (no flash).
 * Keep the key and attribute names in sync with that script.
 */
import { useEffect, useState } from 'react';

export type Style = 'focus' | 'reflect';
export type Appearance = 'system' | 'light' | 'dark';
export interface Theme {
  style: Style;
  appearance: Appearance;
}

const KEY = 'schema.theme';
export const DEFAULT_THEME: Theme = { style: 'focus', appearance: 'system' };

export function loadTheme(): Theme {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Theme>;
    return {
      style: raw.style === 'reflect' ? 'reflect' : 'focus',
      appearance: raw.appearance === 'light' || raw.appearance === 'dark' ? raw.appearance : 'system',
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  root.dataset.style = t.style;
  if (t.appearance === 'system') delete root.dataset.theme;
  else root.dataset.theme = t.appearance;
  // Match the browser chrome to the page background.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState(loadTheme);
  useEffect(() => {
    applyTheme(theme);
    if (theme.appearance !== 'system') return;
    // Follow the system as it changes (e.g. automatic dark mode at night).
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme(theme);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  const update = (t: Theme) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
    } catch {
      // Private mode or storage blocked: the choice lasts for this visit only.
    }
    setTheme(t);
  };
  return [theme, update];
}
