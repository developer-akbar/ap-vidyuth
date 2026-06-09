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
import { setupPushNotifications, syncPushTokenWithServer } from '../features/electricity/utils/notifications.js';
import { PrivacyPolicy } from '../features/settings/PrivacyPolicy.jsx';
import { PrefixMigration } from '../features/settings/components/PrefixMigration.jsx';
import { SettingsItem } from '../features/settings/components/SettingsItem.jsx';
import { BackupRestore } from '../features/settings/components/BackupRestore.jsx';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Loader } from '../shared/components/Loader.jsx';
import { FiShuffle, FiLayers, FiActivity, FiGlobe, FiLayout, FiBell, FiShield, FiMail } from 'react-icons/fi';

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
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const { t, i18n } = useTranslation();
  const ph = usePostHog();

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const scrollPositions = useRef({});

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleNavClick = (id) => {
    const mainEl = document.querySelector('.main');
    if (mainEl) scrollPositions.current[activePage] = mainEl.scrollTop;

    if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
    setActivePage(id);

    // Give React a tick to mount the new component, then restore scroll
    setTimeout(() => {
      const newMainEl = document.querySelector('.main');
      if (newMainEl) {
        newMainEl.scrollTop = scrollPositions.current[id] || 0;
      }
    }, 0);

    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
  };

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'web') {
      SplashScreen.hide();
    }
    setupPushNotifications();

    const handleNavigate = (e) => {
      const page = e.detail?.page;
      if (page) {
         const mainEl = document.querySelector('.main');
         if (mainEl) scrollPositions.current[activePage] = mainEl.scrollTop;
         
         setActivePage(page);
         
         setTimeout(() => {
           const newMainEl = document.querySelector('.main');
           if (newMainEl) newMainEl.scrollTop = scrollPositions.current[page] || 0;
         }, 0);
      }
    };
    window.addEventListener('app-navigate', handleNavigate);
    return () => window.removeEventListener('app-navigate', handleNavigate);
  }, [activePage]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const timer = setTimeout(() => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isCapacitor = window.Capacitor?.getPlatform() !== 'web';
      
      const dismissalTime = localStorage.getItem('pwa_banner_dismissed_at');
      const isInstalled = localStorage.getItem('pwa_installed') === 'true';
      
      let isDismissed = false;
      if (dismissalTime) {
        const hoursPassed = (Date.now() - parseInt(dismissalTime, 10)) / (1000 * 60 * 60 * 24);
        if (hoursPassed < 24) isDismissed = true;
      }

      if (!isStandalone && !isCapacitor && !isDismissed && !isInstalled) {
        setShowInstallBanner(true);
      }
    }, 60000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa_installed', 'true');

    if (!deferredPrompt) {
      toast.success('To add to home screen, use your browser\'s Share > Add to Home Screen menu.');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      if (ph) ph.capture('pwa_installed');
    }
    setDeferredPrompt(null);
  };

  const handleDismissBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa_banner_dismissed_at', Date.now().toString());
    if (ph) ph.capture('pwa_banner_dismissed');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (ph) {
      ph.capture('$pageview', { page: activePage });
    }
  }, [activePage, ph]);

  useEffect(() => {
    const handleUrlOpen = (event) => {
      const url = event.url;
      if (url.includes('apvidyuth://action/refresh')) {
        window.dispatchEvent(new CustomEvent('shortcut-refresh-all'));
        if (activePage !== 'electricity') setActivePage('electricity');
      } else if (url.includes('apvidyuth://action/add')) {
        window.dispatchEvent(new CustomEvent('shortcut-add-service'));
        if (activePage !== 'electricity') setActivePage('electricity');
      } else if (url.includes('apvidyuth://action/pay')) {
        window.dispatchEvent(new CustomEvent('shortcut-pay-home'));
        if (activePage !== 'electricity') setActivePage('electricity');
      }
    };
    
    const urlHandler = CapApp.addListener('appUrlOpen', handleUrlOpen);

    // Esc key: navigate back from sub-pages
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (['appliances', 'privacy', 'prefix-migration', 'calculation-settings'].includes(activePage)) {
        setActivePage(activePage === 'appliances' ? 'electricity' : 'settings');
      }
    };
    window.addEventListener('keydown', handleEsc);
    
    const onBack = async () => {
      const backEvent = new CustomEvent('app-back-button', { detail: { handled: false }, cancelable: true });
      window.dispatchEvent(backEvent);
      
      if (backEvent.detail.handled) return;

      if (['privacy', 'prefix-migration', 'calculation-settings', 'appliances'].includes(activePage)) {
        setActivePage(activePage === 'appliances' ? 'electricity' : 'settings');
        return;
      }

      if (activePage !== 'electricity') {
        setActivePage('electricity');
        return;
      }

      CapApp.exitApp();
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
      window.removeEventListener('keydown', handleEsc);
    };
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

  return (
    <div className="shell">
      {isOffline && (
        <div style={{ background: 'var(--amber)', color: '#000', padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', zIndex: 10000, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <FiWifiOff size={16} />
          You're offline — showing cached data
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
        <div className="sidebar__footer">v1.0.0</div>
      </aside>

      <main className="main">
        <Suspense fallback={<PageLoader />}>
          {activePage === 'electricity' && <ElectricityDashboard onOpenCalcSettings={() => handleNavClick('calculation-settings')} />}
          {activePage === 'calculation-settings' && <CalculationSettings onBack={() => setActivePage('settings')} />}
          {activePage === 'prefix-migration' && <PrefixMigration onBack={() => setActivePage('settings')} />}
          {activePage === 'appliances' && <ApplianceCalculator onBack={() => setActivePage('electricity')} />}
          {activePage === 'home' && <OverviewTab />}
          {activePage === 'privacy' && (
            <PrivacyPolicy onBack={() => setActivePage('settings')} />
          )}
          {activePage === 'settings' && (
            <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg-1)' }}>
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
                        <button className={`seg__btn ${theme === 'dark' ? 'seg__btn--active' : ''}`} onClick={() => setTheme('dark')}>{t('dark')}</button>
                        <button className={`seg__btn ${theme === 'light' ? 'seg__btn--active' : ''}`} onClick={() => setTheme('light')}>{t('light')}</button>
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
                    <BackupRestore />
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
                <span className="dev-footer__tag">v1.0.0</span>
              </footer>
            </div>
          )}
        </Suspense>
      </main>

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
          duration: 3000,
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
