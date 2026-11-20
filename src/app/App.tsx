import { useEffect } from 'react';
import { dueCount } from '../core/review';
import { isUnsorted } from '../core/seed';
import { BankScreen } from '../ui/BankScreen';
import { CaptureScreen } from '../ui/CaptureScreen';
import { Icon, type IconName } from '../ui/parts';
import { ReviewScreen } from '../ui/ReviewScreen';
import { SeedScreen } from '../ui/SeedScreen';
import { SettingsScreen } from '../ui/SettingsScreen';
import { SortScreen } from '../ui/SortScreen';
import { href, useNow, useReviewState, useRoute, useSeeds, useSettings, type Route } from './hooks';

const TABS: Array<{ route: Route; label: string; icon: IconName }> = [
  { route: { name: 'capture' }, label: 'Capture', icon: 'capture' },
  { route: { name: 'sort' }, label: 'Sort', icon: 'sort' },
  { route: { name: 'review' }, label: 'Review', icon: 'review' },
  { route: { name: 'bank' }, label: 'Bank', icon: 'bank' },
  { route: { name: 'settings' }, label: 'Settings', icon: 'settings' },
];

export function App() {
  const route = useRoute();
  const seeds = useSeeds();
  const review = useReviewState();
  const settings = useSettings();
  const now = useNow();

  const badges: Partial<Record<Route['name'], number>> = {};
  if (seeds && review) {
    badges.sort = seeds.filter((s) => s.status === 'active' && isUnsorted(s)).length;
    badges.review = dueCount(seeds, review, now, { size: settings.reviewSize, focus: settings.reviewFocus });
  }
  // App icon badge where supported (installed PWAs).
  const reviewBadge = badges.review;
  useEffect(() => {
    if (reviewBadge === undefined || !('setAppBadge' in navigator)) return;
    void (reviewBadge ? navigator.setAppBadge(reviewBadge) : navigator.clearAppBadge()).catch(() => {});
  }, [reviewBadge]);

  const active = route.name === 'seed' ? 'bank' : route.name;

  return (
    <div className="app">
      <nav className="tabs" aria-label="Main">
        <div className="tabs-brand">
          <Icon name="sprout" size={22} />
        </div>
        {TABS.map((t) => (
          <a key={t.label} href={href(t.route)} className={`tab${active === t.route.name ? ' active' : ''}`} aria-current={active === t.route.name ? 'page' : undefined}>
            <span className="tab-icon">
              <Icon name={t.icon} />
              {!!badges[t.route.name] && <span className="badge">{badges[t.route.name]}</span>}
            </span>
            <span className="tab-label">{t.label}</span>
          </a>
        ))}
      </nav>
      <main className="main">
        {route.name === 'capture' && <CaptureScreen />}
        {route.name === 'sort' && <SortScreen />}
        {route.name === 'review' && <ReviewScreen />}
        {route.name === 'bank' && <BankScreen key={route.category ?? ''} category={route.category} query={route.query} />}
        {route.name === 'seed' && <SeedScreen key={route.id} id={route.id} />}
        {route.name === 'settings' && <SettingsScreen />}
      </main>
    </div>
  );
}
