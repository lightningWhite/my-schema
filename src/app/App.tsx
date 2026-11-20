import { useEffect } from 'react';
import { dueCount } from '../core/review';
import { isDraft } from '../core/tidbit';
import { SchemaScreen } from '../ui/SchemaScreen';
import { CaptureScreen } from '../ui/CaptureScreen';
import { Icon, Logo, type IconName } from '../ui/parts';
import { ReviewScreen } from '../ui/ReviewScreen';
import { TidbitScreen } from '../ui/TidbitScreen';
import { SettingsScreen } from '../ui/SettingsScreen';
import { OrganizeScreen } from '../ui/OrganizeScreen';
import { AboutScreen } from '../ui/AboutScreen';
import { useTheme } from './theme';
import { href, useNow, useReviewState, useRoute, useTidbits, useSettings, type Route } from './hooks';

const TABS: Array<{ route: Route; label: string; icon: IconName }> = [
  { route: { name: 'capture' }, label: 'Capture', icon: 'capture' },
  { route: { name: 'organize' }, label: 'Organize', icon: 'organize' },
  { route: { name: 'review' }, label: 'Review', icon: 'review' },
  { route: { name: 'schema' }, label: 'Schema', icon: 'schema' },
  { route: { name: 'settings' }, label: 'Settings', icon: 'settings' },
];

export function App() {
  const route = useRoute();
  const tidbits = useTidbits();
  const review = useReviewState();
  const settings = useSettings();
  const now = useNow();
  const [theme, setTheme] = useTheme();

  const badges: Partial<Record<Route['name'], number>> = {};
  if (tidbits && review) {
    badges.organize = tidbits.filter(isDraft).length;
    badges.review = dueCount(tidbits, review, now, { size: settings.reviewSize, focus: settings.reviewFocus });
  }
  // App icon badge where supported (installed PWAs).
  const reviewBadge = badges.review;
  useEffect(() => {
    if (reviewBadge === undefined || !('setAppBadge' in navigator)) return;
    void (reviewBadge ? navigator.setAppBadge(reviewBadge) : navigator.clearAppBadge()).catch(() => {});
  }, [reviewBadge]);

  const active = route.name === 'tidbit' ? 'schema' : route.name;

  return (
    <div className="app">
      <nav className="tabs" aria-label="Main">
        <div className="tabs-brand">
          <Logo size={30} />
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
        {route.name === 'organize' && <OrganizeScreen />}
        {route.name === 'about' && <AboutScreen />}
        {route.name === 'review' && <ReviewScreen />}
        {route.name === 'schema' && <SchemaScreen key={route.category ?? ''} category={route.category} query={route.query} />}
        {route.name === 'tidbit' && <TidbitScreen key={route.id} id={route.id} />}
        {route.name === 'settings' && <SettingsScreen theme={theme} onTheme={setTheme} />}
      </main>
    </div>
  );
}
