import { Component } from 'react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { FiZap, FiGrid, FiSettings, FiMonitor } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import posthog from 'posthog-js';
import { PostHogProvider, usePostHog } from '@posthog/react';
import { ElectricityDashboard } from '../features/electricity/ElectricityDashboard.jsx';
import { useElectricityServices } from '../features/electricity/hooks/useElectricityServices.js';
import { setupPushNotifications, syncPushTokenWithServer } from '../features/electricity/utils/notifications.js';
import { PrivacyPolicy } from '../features/settings/PrivacyPolicy.jsx';
import { PrefixMigration } from '../features/settings/components/PrefixMigration.jsx';
import { SettingsItem } from '../features/settings/components/SettingsItem.jsx';
import { BackupRestore } from '../features/settings/components/BackupRestore.jsx';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Loader } from '../shared/components/Loader.jsx';
import { FiShuffle, FiLayers, FiActivity, FiGlobe, FiLayout, FiBell, FiShield, FiMail, FiWifiOff } from 'react-icons/fi';

import { useNetwork } from '../shared/hooks/useNetwork.js';

// ── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error('[ErrorBoundary]', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="state-box">
          <FiWifiOff size={40} color="var(--red)" />
          <h3>Something went wrong</h3>
          <p>The app encountered an unexpected error.</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Lazy Loaded Components ──────────────────────────────────────────────────
const CalculationSettings = lazy(() => import('../features/electricity/components/CalculationSettings.jsx').then(m => ({ default: m.CalculationSettings })));
const ApplianceCalculator = lazy(() => import('../features/electricity/components/ApplianceCalculator.jsx').then(m => ({ default: m.ApplianceCalculator })));

const OverviewTab = lazy(() => import('../features/electricity/OverviewTab.jsx').then(m => ({ default: m.OverviewTab })));

// ── Loading Fallback ────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="state-box">
    <Loader size={22} />
    <p>Loading...</p>
  </div>
);

// ── PostHog Initialization ──────────────────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, 
    autocapture: false,
    disable_session_recording: true, // Disable heavy recording script
    disable_surveys: true,           // Disable heavy surveys script
  });
}

const NAV = [
  { id: 'electricity', icon: FiZap },
  { id: 'appliances',  icon: FiMonitor },
  { id: 'home',        icon: FiGrid },
  { id: 'settings',    icon: FiSettings },
];

function AppContent() {
  const [activePage, setActivePage] = useState(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/privacy') {
      return 'privacy';
    }
    return 'electricity';
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [density, setDensity] = useState(() => localStorage.getItem('density') || 'comfortable');
  const { t, i18n } = useTranslation();
  const ph = usePostHog();

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const { isOffline } = useNetwork();
  const scrollPositions = useRef({});
  const [globalProgress, setGlobalProgress] = useState(null);
  const electricityContext = useElectricityServices();

  useEffect(() => {
    const handleProgress = (e) => setGlobalProgress(e.detail);
    window.addEventListener('global-progress', handleProgress);
    return () => window.removeEventListener('global-progress', handleProgress);
  }, []);

  // Theme Sync (Standard #12)
  useEffect(() => {
    const applyTheme = (t) => {
      let activeTheme = t;
      if (t === 'system') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', activeTheme);
      
      if (Capacitor.isNativePlatform()) {
        const isDark = activeTheme === 'dark';
        StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        StatusBar.setBackgroundColor({ color: isDark ? '#0f172a' : '#ffffff' });
      }
    };

    applyTheme(theme);
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  // Density Sync (Standard #12)
  useEffect(() => {
    localStorage.setItem('density', density);
  }, [density]);

  const triggerHaptic = async (style = ImpactStyle.Light) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Haptics.impact({ style });
    } catch {
      // ignore haptic failures on unsupported platforms
    }
  };

  useEffect(() => {
    if (ph) {
      ph.capture('$pageview', { page: activePage });
    }
  }, [activePage, ph]);

  const activePageRef = useRef(activePage);
  useEffect(() => { activePageRef.current = activePage; }, [activePage]);

  // ── Capacitor Back Button & App Links ──────────────────────────────────────
  useEffect(() => {
    const handleUrlOpen = (event) => {
      const url = event.url;
      if (url.includes('apvidyuth://action/refresh')) {
        window.dispatchEvent(new CustomEvent('shortcut-refresh-all'));
        if (activePageRef.current !== 'electricity') setActivePage('electricity');
        return;
      }
      if (url.includes('apvidyuth://action/add')) {
        window.dispatchEvent(new CustomEvent('shortcut-add-service'));
        if (activePageRef.current !== 'electricity') setActivePage('electricity');
        return;
      }
      if (url.includes('apvidyuth://action/pay')) {
        window.dispatchEvent(new CustomEvent('shortcut-pay-home'));
        if (activePageRef.current !== 'electricity') setActivePage('electricity');
        return;
      }

      try {
        const parsed = new URL(url);
        if (parsed.hostname === 'ap-vidyuth.vercel.app') {
          const sn = parsed.pathname.replace(/\//g, '').replace(/[^0-9]/g, '');
          if (sn.length === 13) {
            setActivePage('electricity');
            window.dispatchEvent(new CustomEvent('deep-link-service', { detail: { serviceNumber: sn } }));
          } else {
            setActivePage('electricity');
          }
        }
      } catch {}
    };
    const urlHandler = CapApp.addListener('appUrlOpen', handleUrlOpen);

    const lastBackPress = { current: 0 };
    const onBack = async () => {
      const backEvent = new CustomEvent('app-back-button', { detail: { handled: false }, cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.detail.handled) return;

      const curr = activePageRef.current;
      if (['privacy', 'prefix-migration', 'calculation-settings', 'appliances'].includes(curr)) {
        setActivePage(curr === 'appliances' ? 'electricity' : 'settings');
        return;
      }

      if (curr !== 'electricity') {
        setActivePage('electricity');
        return;
      }

      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPress.current = now;
        toast('Press back again to exit', { icon: '👋', duration: 2000 });
      }
    };

    const capHandler = CapApp.addListener('backButton', onBack);
    const popHandler = () => onBack();
    window.addEventListener('popstate', popHandler);

    if (window.history.state !== 'root') {
      window.history.replaceState('root', '');
      window.history.pushState('nav', '');
    }

    return () => {
      urlHandler.then(h => h.remove());
      capHandler.then(h => h.remove());
      window.removeEventListener('popstate', popHandler);
    };
  }, []); // Stable listener

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (['appliances', 'privacy', 'prefix-migration', 'calculation-settings'].includes(activePage)) {
        setActivePage(activePage === 'appliances' ? 'electricity' : 'settings');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [activePage]);

  useEffect(() => {
    if (window.history.state !== 'nav') {
       window.history.pushState('nav', '');
    }
  }, [activePage]);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    if (ph) ph.capture('language_changed', { language: lng });
  };

  const handleNavClick = async (id) => {
    await triggerHaptic();

    if (activePage === id) {
      // If clicking the currently active tab, smooth scroll to top
      const mainEl = document.querySelector('.main');
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Save current scroll before switching
    const mainEl = document.querySelector('.main');
    if (mainEl) scrollPositions.current[activePage] = mainEl.scrollTop;

    if (id === 'settings') {
      setActivePage('settings');
      return;
    }

    setActivePage(id);
  };

  useEffect(() => {
    const mainEl = document.querySelector('.main');
    if (!mainEl) return;
    const saved = scrollPositions.current[activePage];
    mainEl.scrollTop = saved || 0;
  }, [activePage]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowInstallBanner(false);
      return;
    }

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    setShowInstallBanner(false);
    setDeferredPrompt(null);

    if (choiceResult.outcome === 'accepted') {
      localStorage.setItem('pwa_installed', 'true');
      toast.success('App installed successfully');
    } else {
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      localStorage.setItem('pwa_install_snoozed_until', (Date.now() + twoDays).toString());
      toast('Maybe later');
    }
  };

  const handleDismissBanner = () => {
    setShowInstallBanner(false);
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem('pwa_install_snoozed_until', (Date.now() + twoDays).toString());
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      // Don't show if already in standalone mode
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      
      // Don't show if user already installed
      if (localStorage.getItem('pwa_installed') === 'true') return;

      // Check snooze
      const snoozedUntil = localStorage.getItem('pwa_install_snoozed_until');
      if (snoozedUntil && Date.now() < parseInt(snoozedUntil)) return;

      event.preventDefault();
      setDeferredPrompt(event);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  return (
    <div className={`shell ${density === 'compact' ? 'shell--compact' : ''}`}>
      {isOffline && (
        <div style={{ background: 'var(--amber)', color: '#000', padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', zIndex: 10000, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <FiWifiOff size={16} />
          You're offline — showing cached data
        </div>
      )}
      {globalProgress && (
        <div style={{ background: 'var(--blue-dim)', borderBottom: '1px solid var(--blue)', color: 'var(--blue)', padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', zIndex: 10000, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <Loader size={16} />
          {globalProgress}
        </div>
      )}
      {showInstallBanner && (
        <div className="install-banner">
          <span className="install-banner__text">Add AP Vidyuth to your home screen for quick access?</span>
          <div className="install-banner__actions">
            <button className="btn btn--white" onClick={handleInstallClick} aria-label="Install app">Yes</button>
            <button className="btn btn--outline-white" onClick={handleDismissBanner} aria-label="Dismiss install banner">Not now</button>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><FiGrid size={16} /></div>
          <span>AP Vidyuth</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar__item ${activePage === id ? 'sidebar__item--active' : ''}`}
              onClick={() => handleNavClick(id)}
              aria-label={t(id)}
            >
              <Icon size={17} />
              {t(id)}
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">{`v${__APP_VERSION__}`}</div>
      </aside>

      <ErrorBoundary>
        <main className="main">
          <Suspense fallback={<PageLoader />}>
            {activePage === 'electricity' && <ElectricityDashboard onOpenCalcSettings={() => handleNavClick('calculation-settings')} electricityContext={electricityContext} />}
            {activePage === 'calculation-settings' && <CalculationSettings onBack={() => setActivePage('settings')} />}
            {activePage === 'prefix-migration' && <PrefixMigration onBack={() => setActivePage('settings')} />}
            {activePage === 'appliances' && <ApplianceCalculator onBack={() => setActivePage('electricity')} />}
            {activePage === 'home' && <OverviewTab electricityContext={electricityContext} />}
            {activePage === 'privacy' && (
              <PrivacyPolicy onBack={() => setActivePage('settings')} />
            )}
            {activePage === 'settings' && (
              <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
                <div className="page__header page__header--sticky">
                  <div>
                    <h2 className="page__title">{t('settings')}</h2>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Tools & Utilities
                    </h3>
                    <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                      <SettingsItem 
                        icon={FiShuffle} 
                        label={t('prefix_migration')} 
                        description="Batch update service prefixes"
                        onClick={() => setActivePage('prefix-migration')}
                        color="var(--blue)"
                      />
                      <SettingsItem 
                        icon={FiActivity} 
                        label="Slab Configuration" 
                        description="Configure billing rates & slabs"
                        onClick={() => setActivePage('calculation-settings')}
                        color="var(--orange)"
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Preferences
                    </h3>
                    <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="settings-item__icon" style={{ color: 'var(--primary)' }}>
                            <FiLayout size={18} />
                          </div>
                          <span style={{ fontSize: '15px', fontWeight: '600' }}>{t('theme')}</span>
                        </div>
                        <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                          <button className={`seg__btn ${theme === 'system' ? 'seg__btn--active' : ''}`} onClick={() => setTheme('system')}>Auto</button>
                          <button className={`seg__btn ${theme === 'dark' ? 'seg__btn--active' : ''}`} onClick={() => setTheme('dark')}>{t('dark')}</button>
                          <button className={`seg__btn ${theme === 'light' ? 'seg__btn--active' : ''}`} onClick={() => setTheme('light')}>{t('light')}</button>
                        </div>
                      </div>

                      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="settings-item__icon" style={{ color: 'var(--violet)' }}>
                            <FiLayers size={18} />
                          </div>
                          <span style={{ fontSize: '15px', fontWeight: '600' }}>Display Density</span>
                        </div>
                        <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                          <button className={`seg__btn ${density === 'comfortable' ? 'seg__btn--active' : ''}`} onClick={() => setDensity('comfortable')}>Default</button>
                          <button className={`seg__btn ${density === 'compact' ? 'seg__btn--active' : ''}`} onClick={() => setDensity('compact')}>Compact</button>
                        </div>
                      </div>

                      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="settings-item__icon" style={{ color: 'var(--green)' }}>
                            <FiGlobe size={18} />
                          </div>
                          <span style={{ fontSize: '15px', fontWeight: '600' }}>{t('language')}</span>
                        </div>
                        <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                          <button className={`seg__btn ${i18n.language === 'en' ? 'seg__btn--active' : ''}`} onClick={() => changeLanguage('en')}>EN</button>
                          <button className={`seg__btn ${i18n.language === 'te' ? 'seg__btn--active' : ''}`} onClick={() => changeLanguage('te')}>తెలుగు</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Data Management
                    </h3>
                    <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                      <BackupRestore electricityContext={electricityContext} />
                    </div>
                  </div>

                  {Capacitor.getPlatform() !== 'web' && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        System
                      </h3>
                      <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                        <SettingsItem 
                          icon={FiBell} 
                          label="Notifications" 
                          description="Sync push notification token"
                          onClick={async () => {
                            const success = await syncPushTokenWithServer(null, true);
                            if (success) toast.success('Notifications synced!');
                          }}
                          color="var(--purple)"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Support & Legal
                    </h3>
                    <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                      <SettingsItem 
                        icon={FiMail} 
                        label={t('contact_developer')} 
                        description="Report bugs or suggest features"
                        onClick={() => window.location.href = "mailto:mail.akbarmulla@gmail.com?subject=AP Vidyuth App Feedback"}
                        color="var(--primary)"
                      />
                      <SettingsItem 
                        icon={FiShield} 
                        label="Privacy Policy" 
                        description="How we handle your data"
                        onClick={() => setActivePage('privacy')}
                        color="var(--text-2)"
                      />
                    </div>
                  </div>
                </div>

                <footer className="dev-footer" style={{ marginTop: '20px', paddingBottom: '32px', textAlign: 'center' }}>
                  <p className="dev-footer__name">{t('developed_by')} Akbar</p>
                  <span className="dev-footer__tag">{`v${__APP_VERSION__}`}</span>
                </footer>
              </div>
            )}
          </Suspense>
        </main>
      </ErrorBoundary>

      <nav className="bottom-nav">
        {NAV.map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={`bottom-nav__item ${
              activePage === id ||
              (id === 'settings' && ['prefix-migration', 'calculation-settings', 'privacy'].includes(activePage))
                ? 'bottom-nav__item--active'
                : ''
            }`}
            onClick={() => handleNavClick(id)}
            aria-label={t(id)}
          >
            <Icon size={20} />
            <span>{t(id)}</span>
          </button>
        ))}
      </nav>

      <Toaster
        position="bottom-center"
        containerClassName="toast-container"
        containerStyle={{ zIndex: 200000 }}
        toastOptions={{
          success: { duration: 2000 },
          error:   { duration: 4000 },
          duration: 3000, // default for info/loading
          style: {
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '500',
            fontFamily: 'var(--font)',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
      />
      
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export function App() {
  return (
    <PostHogProvider client={posthog}>
      <AppContent />
    </PostHogProvider>
  );
}
