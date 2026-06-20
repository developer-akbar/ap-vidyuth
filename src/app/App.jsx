import { Component } from 'react';
import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Toaster, toast } from 'react-hot-toast';
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
import { ServiceCapModal, RequestAccessForm, RequestSuccessModal } from '../features/electricity/components/ServiceCapModals.jsx';
import { ConfirmDialog } from '../shared/components/ConfirmDialog.jsx';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Loader } from '../shared/components/Loader.jsx';
import { FiZap, FiGrid, FiSettings, FiMonitor, FiUser, FiArrowLeft, FiShuffle, FiLayers, FiActivity, FiGlobe, FiLayout, FiBell, FiShield, FiMail, FiWifiOff } from 'react-icons/fi';

import { useNetwork } from '../shared/hooks/useNetwork.js';
import { db } from '../shared/db/storage.js';

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
    disable_session_recording: true,
    disable_surveys: true,
  });
}

const NAV = [
  { id: 'electricity', icon: FiZap },
  { id: 'home', icon: FiGrid },
  { id: 'appliances', icon: FiMonitor },
  { id: 'settings', icon: FiSettings },
];

function AppContent() {
  const [activePage, setActivePage] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/privacy') return 'privacy';
      if (window.location.pathname === '/admin') return 'admin';
    }
    return 'electricity';
  });
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });
  const [density, setDensity] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('density') || 'comfortable';
    }
    return 'comfortable';
  });

  useEffect(() => {
    Promise.all([
      db.getSetting('theme'),
      db.getSetting('density')
    ]).then(([savedTheme, savedDensity]) => {
      if (savedTheme && savedTheme !== localStorage.getItem('theme')) {
        setTheme(savedTheme);
        localStorage.setItem('theme', savedTheme);
      }
      if (savedDensity && savedDensity !== localStorage.getItem('density')) {
        setDensity(savedDensity);
        localStorage.setItem('density', savedDensity);
      }
    });
  }, []);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    db.setSetting('theme', newTheme);
  };

  const handleDensityChange = (newDensity) => {
    setDensity(newDensity);
    localStorage.setItem('density', newDensity);
    db.setSetting('density', newDensity);
  };

  const { t, i18n } = useTranslation();
  const ph = usePostHog();

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const { isOffline } = useNetwork();
  const scrollPositions = useRef({});
  const [globalProgress, setGlobalProgress] = useState(null);
  const electricityContext = useElectricityServices();

  const [meterLogCount, setMeterLogCount] = useState(0);
  const [capModalOpen, setCapModalOpen] = useState(false);
  const [withdrawFormOpen, setWithdrawFormOpen] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });

  const [userName, setUserName] = useState(() => localStorage.getItem('user_name') || '');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('user_email') || '');
  const [heardFrom, setHeardFrom] = useState(() => localStorage.getItem('user_heard_from') || '');

  // Profile modal trigger
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // User notifications
  const [notifications, setNotifications] = useState([]);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);

  // Admin Dashboard state
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('admin_token') || null);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState({ standard: [], pro: [] });
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const apiPost = async (path, body, headers = {}) => {
    const { apiBase } = await import('../features/electricity/api/servicesApi.js');
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  };

  const apiGet = async (path, headers = {}) => {
    const { apiBase } = await import('../features/electricity/api/servicesApi.js');
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...headers }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  };

  const saveUserInfo = async () => {
    const trimmedName = userName.trim();
    const trimmedEmail = userEmail.trim();

    if (!trimmedName || !trimmedEmail) {
      toast.error('Name and Email are required.');
      return;
    }

    try {
      const { saveProfile } = await import('../features/electricity/api/servicesApi.js');
      const res = await saveProfile(trimmedName, trimmedEmail, heardFrom || null);
      localStorage.setItem('user_name', trimmedName);
      localStorage.setItem('user_email', trimmedEmail);
      if (heardFrom) {
        localStorage.setItem('user_heard_from', heardFrom);
      }
      
      // Update local Pro status if database has a role for this email
      if (res && res.user && res.user.role) {
        const { db } = await import('../shared/db/storage.js');
        const { isSecurePro } = await import('../features/electricity/utils/billing.js');
        if (res.user.role === 'PRO') {
          await db.setSetting('is_pro', isSecurePro('WHITELISTED'));
          await db.setSetting('pro_source', res.user.pro_source || 'admin');
        } else {
          await db.setSetting('is_pro', null);
          await db.setSetting('pro_source', null);
        }
        electricityContext.actions.reload();
      }

      toast.success('User info saved and synced');
      setShowUserInfo(false);
    } catch (err) {
      console.warn('[profile] Profile sync failed, saving locally:', err.message);
      localStorage.setItem('user_name', trimmedName);
      localStorage.setItem('user_email', trimmedEmail);
      if (heardFrom) {
        localStorage.setItem('user_heard_from', heardFrom);
      }
      toast.success('User info saved locally');
      setShowUserInfo(false);
    }
  };

  const handleProfileSave = async (name, email, source) => {
    try {
      const { saveProfile } = await import('../features/electricity/api/servicesApi.js');
      const res = await saveProfile(name, email, source);
      
      localStorage.setItem('user_name', name);
      localStorage.setItem('user_email', email);
      if (source) {
        localStorage.setItem('user_heard_from', source);
      }
      localStorage.setItem('profile_prompt_shown', 'true');
      
      setUserName(name);
      setUserEmail(email);
      setHeardFrom(source || '');
      setProfileModalOpen(false);

      if (res && res.user && res.user.role) {
        const { db } = await import('../shared/db/storage.js');
        const { isSecurePro } = await import('../features/electricity/utils/billing.js');
        if (res.user.role === 'PRO') {
          await db.setSetting('is_pro', isSecurePro('WHITELISTED'));
          await db.setSetting('pro_source', res.user.pro_source || 'admin');
        } else {
          await db.setSetting('is_pro', null);
          await db.setSetting('pro_source', null);
        }
        electricityContext.actions.reload();
      }

      toast.success('Profile created successfully!');
    } catch (err) {
      console.warn('[profile] Sync failed on launch, saving locally:', err.message);
      localStorage.setItem('user_name', name);
      localStorage.setItem('user_email', email);
      if (source) {
        localStorage.setItem('user_heard_from', source);
      }
      localStorage.setItem('profile_prompt_shown', 'true');
      
      setUserName(name);
      setUserEmail(email);
      setHeardFrom(source || '');
      setProfileModalOpen(false);
      toast.success('Profile saved locally!');
    }
  };

  const handleWithdrawPro = () => {
    if (electricityContext.proSource === 'coupon') {
      setConfirmState({
        open: true,
        title: 'Deactivate Pro Access',
        description: 'Are you sure you want to deactivate your Pro access? You will return to standard limits (max 4 services).',
        isDanger: true,
        onConfirm: async () => {
          setConfirmState(prev => ({ ...prev, open: false }));
          const { db } = await import('../shared/db/storage.js');
          await db.setSetting('is_pro', null);
          await db.setSetting('pro_source', null);
          toast.success('Pro access deactivated');
          electricityContext.actions.reload();
        }
      });
    } else {
      setConfirmState({
        open: true,
        title: 'Request Pro Withdrawal',
        description: 'Are you sure you want to request withdrawal of your Pro subscription? You will lose the ability to track unlimited services and revert to the standard limit of max 4 services.',
        isDanger: true,
        onConfirm: () => {
          setConfirmState(prev => ({ ...prev, open: false }));
          setWithdrawFormOpen(true);
        }
      });
    }
  };

  const handleRequestSuccess = (type, email) => {
    setWithdrawFormOpen(false);
    setCapModalOpen(false);
    
    // Refresh user info state in case it was updated in the form
    setUserName(localStorage.getItem('user_name') || '');
    setUserEmail(localStorage.getItem('user_email') || '');

    if (type === 'WITHDRAW') {
      db.setSetting('is_pro', null);
      db.setSetting('pro_source', null);
      electricityContext.actions.reload();
    }
    setSuccessState({ open: true, type, email });
  };

  const loadNotifications = useCallback(async () => {
    try {
      const { fetchNotifications } = await import('../features/electricity/api/servicesApi.js');
      const email = localStorage.getItem('user_email');
      const res = await fetchNotifications(email);
      if (res.ok) {
        setNotifications(res.notifications || []);
      }
    } catch (err) {
      console.error('[notifications] Load failed:', err.message);
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!adminToken) return;
    setIsAdminLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${adminToken}` };
      const statsRes = await apiGet('/admin/stats', headers);
      const usersRes = await apiGet('/admin/users', headers);
      if (statsRes.ok && usersRes.ok) {
        setAdminStats(statsRes.stats);
        setAdminUsers(usersRes);
      }
    } catch (err) {
      console.error('[admin] Fetch failed:', err.message);
      if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        localStorage.removeItem('admin_token');
        setAdminToken(null);
        setAdminStats(null);
        setAdminUsers({ standard: [], pro: [] });
        toast.error('Admin session expired');
      }
    } finally {
      setIsAdminLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (activePage === 'admin' && adminToken) {
      loadAdminData();
    }
  }, [activePage, adminToken, loadAdminData]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const checkProfile = setTimeout(() => {
      const promptShown = localStorage.getItem('profile_prompt_shown') === 'true';
      const savedName = localStorage.getItem('user_name');
      const savedEmail = localStorage.getItem('user_email');
      if (!promptShown && (!savedName || !savedEmail)) {
        setProfileModalOpen(true);
      }
    }, 1500);
    return () => clearTimeout(checkProfile);
  }, []);

  useEffect(() => {
    if (activePage === 'admin') {
      document.title = 'AP Vidyuth - Admin Portal';
      let meta = document.querySelector('meta[name="robots"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'robots';
        document.head.appendChild(meta);
      }
      meta.content = 'noindex,nofollow';
    } else {
      document.title = 'AP Vidyuth';
      const meta = document.querySelector('meta[name="robots"]');
      if (meta) {
        meta.content = 'index,follow';
      }
    }
  }, [activePage]);

  useEffect(() => {
    const updateCount = async () => {
      const activeServices = electricityContext.services.filter(s => !s.isDeleted);
      let total = 0;
      for (const s of activeServices) {
        const key = `readings_${s.serviceNumber}`;
        const v = await db.getSetting(key);
        if (Array.isArray(v)) total += v.length;
      }
      setMeterLogCount(total);
    };
    updateCount();
    const interval = setInterval(updateCount, 10000);
    return () => clearInterval(interval);
  }, [electricityContext.services]);

  useEffect(() => {
    const handleProgress = (e) => setGlobalProgress(e.detail);
    const handleNavigate = (e) => {
      const { page } = e.detail || {};
      if (page) setActivePage(page);
    };
    window.addEventListener('global-progress', handleProgress);
    window.addEventListener('app-navigate', handleNavigate);
    return () => {
      window.removeEventListener('global-progress', handleProgress);
      window.removeEventListener('app-navigate', handleNavigate);
    };
  }, []);

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

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const triggerHaptic = async (style = ImpactStyle.Light) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Haptics.impact({ style });
    } catch { }
  };

  useEffect(() => {
    if (ph) {
      ph.capture('$pageview', { page: activePage });
    }
  }, [activePage, ph]);

  const activePageRef = useRef(activePage);
  useEffect(() => { activePageRef.current = activePage; }, [activePage]);

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
      } catch { }
    };
    const urlHandler = CapApp.addListener('appUrlOpen', handleUrlOpen);

    const lastBackPress = { current: 0 };
    const onBack = async () => {
      const backEvent = new CustomEvent('app-back-button', { detail: { handled: false }, cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.detail.handled) return;

      const curr = activePageRef.current;
      if (['privacy', 'prefix-migration', 'calculation-settings', 'appliances', 'user-profile', 'admin'].includes(curr)) {
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
  }, []);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (['appliances', 'privacy', 'prefix-migration', 'calculation-settings', 'user-profile', 'admin'].includes(activePage)) {
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
      const mainEl = document.querySelector('.main');
      if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const mainEl = document.querySelector('.main');
    if (mainEl) scrollPositions.current[activePage] = mainEl.scrollTop;
    setActivePage(id);
  };

  useEffect(() => {
    const mainEl = document.querySelector('.main');
    if (!mainEl) return;
    const saved = scrollPositions.current[activePage];
    mainEl.scrollTop = saved || 0;
  }, [activePage]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) { setShowInstallBanner(false); return; }
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
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      if (localStorage.getItem('pwa_installed') === 'true') return;
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', overflow: 'hidden' }}>
      {isOffline && (
        <div style={{ flexShrink: 0, width: '100%', background: 'var(--amber)', color: '#000', padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', zIndex: 10000, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <FiWifiOff size={16} />
          You're offline — showing cached data
        </div>
      )}
      {globalProgress && (
        <div style={{ flexShrink: 0, width: '100%', background: 'var(--blue-dim)', borderBottom: '1px solid var(--blue)', color: 'var(--blue)', padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', zIndex: 10000, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <Loader size={16} />
          {globalProgress}
        </div>
      )}
      <div className={`shell ${density === 'compact' ? 'shell--compact' : ''}`} style={{ flex: 1, minHeight: 0 }}>
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
              {activePage === 'privacy' && <PrivacyPolicy onBack={() => setActivePage('settings')} />}
              {activePage === 'user-profile' && (
                <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
                  <div className="page__header page__header--sticky">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button className="btn btn--icon" onClick={() => setActivePage('settings')} aria-label="Back">
                        <FiArrowLeft size={20} />
                      </button>
                      <h2 className="page__title">User Profile</h2>
                    </div>
                  </div>
                  <div className="page__body" style={{ padding: '24px' }}>
                    {(!userName || !userEmail || showUserInfo) ? (
                      <div className="scard" style={{ padding: '24px' }}>
                        <div className="field" style={{ marginBottom: '16px' }}>
                          <label className="field__label">Full Name</label>
                          <input className="field__input" placeholder="Enter your name" value={userName} onChange={e => setUserName(e.target.value)} />
                        </div>
                        <div className="field" style={{ marginBottom: '16px' }}>
                          <label className="field__label">Email Address</label>
                          <input className="field__input" type="email" placeholder="Enter your email" value={userEmail} onChange={e => setUserEmail(e.target.value)} />
                        </div>
                        <div className="field" style={{ marginBottom: '16px' }}>
                          <label className="field__label">How did you hear about AP Vidyuth? (Optional)</label>
                          <select 
                            className="field__input" 
                            value={heardFrom} 
                            onChange={e => setHeardFrom(e.target.value)}
                            style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}
                          >
                            <option value="">Select an option</option>
                            <option value="WhatsApp Groups">WhatsApp Groups</option>
                            <option value="Friends">Friends</option>
                            <option value="APSPDCL Searches">APSPDCL Searches</option>
                            <option value="Social Media">Social Media</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          {userName && userEmail && (
                             <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => setShowUserInfo(false)}>Cancel</button>
                          )}
                          <button className="btn btn--primary" style={{ flex: 1.5 }} onClick={saveUserInfo} disabled={!userName.trim() || !userEmail.trim()}>Save Details</button>
                        </div>
                        <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', lineHeight: '1.4' }}>
                          We use these details only to process Pro requests and provide support. We never share your data.
                        </p>
                      </div>
                    ) : (
                      <div className="scard" style={{ padding: '24px' }}>
                        <div style={{ marginBottom: '20px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 'bold', textTransform: 'uppercase' }}>Saved Name</label>
                          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-1)', marginTop: '4px' }}>{userName}</p>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 'bold', textTransform: 'uppercase' }}>Saved Email</label>
                          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-1)', marginTop: '4px' }}>{userEmail}</p>
                        </div>
                        {heardFrom && (
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 'bold', textTransform: 'uppercase' }}>How you heard about us</label>
                            <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-1)', marginTop: '4px' }}>{heardFrom}</p>
                          </div>
                        )}
                        <button className="btn btn--outline" style={{ width: '100%', borderColor: 'var(--border)' }} onClick={() => setShowUserInfo(true)}>
                          Edit Profile Details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activePage === 'admin' && (
                <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
                  <div className="page__header page__header--sticky">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button className="btn btn--icon" onClick={() => setActivePage('settings')} aria-label="Back">
                          <FiArrowLeft size={20} />
                        </button>
                        <h2 className="page__title">Admin Portal</h2>
                      </div>
                      {adminToken && (
                        <button 
                          className="btn btn--outline" 
                          style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                          onClick={() => {
                            localStorage.removeItem('admin_token');
                            setAdminToken(null);
                            setAdminStats(null);
                            setAdminUsers({ standard: [], pro: [] });
                            toast.success('Logged out');
                          }}
                        >
                          Logout
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="page__body" style={{ padding: '24px' }}>
                    {!adminToken ? (
                      <div className="scard" style={{ maxWidth: '400px', margin: '40px auto 0', padding: '32px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                          <FiShield size={40} color="var(--red)" style={{ marginBottom: '12px' }} />
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Admin Authentication</h3>
                          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-3)' }}>Enter credentials to access dashboard</p>
                        </div>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          if (!adminUsername.trim() || !adminPassword.trim()) return;
                          setIsAdminLoading(true);
                          try {
                            const res = await apiPost('/admin/login', { username: adminUsername, password: adminPassword });
                            if (res.ok && res.token) {
                              localStorage.setItem('admin_token', res.token);
                              setAdminToken(res.token);
                              toast.success('Authenticated successfully');
                              setAdminUsername('');
                              setAdminPassword('');
                            } else {
                              toast.error(res.error || 'Authentication failed');
                            }
                          } catch (err) {
                            toast.error(err.message || 'Login failed');
                          } finally {
                            setIsAdminLoading(false);
                          }
                        }}>
                          <div className="field" style={{ marginBottom: '16px' }}>
                            <label className="field__label">Username</label>
                            <input 
                              className="field__input" 
                              value={adminUsername} 
                              onChange={e => setAdminUsername(e.target.value)} 
                              required 
                            />
                          </div>
                          <div className="field" style={{ marginBottom: '24px' }}>
                            <label className="field__label">Password</label>
                            <input 
                              className="field__input" 
                              type="password" 
                              value={adminPassword} 
                              onChange={e => setAdminPassword(e.target.value)} 
                              required 
                            />
                          </div>
                          <button 
                            className="btn btn--primary" 
                            type="submit" 
                            style={{ width: '100%', background: 'var(--red)', borderColor: 'var(--red)' }}
                            disabled={isAdminLoading}
                          >
                            {isAdminLoading ? 'Authenticating...' : 'Sign In'}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                          <div className="scard" style={{ padding: '20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-3)' }}>Total Users</span>
                            <h2 style={{ fontSize: '28px', fontWeight: '800', margin: '8px 0 0', color: 'var(--text-1)' }}>
                              {adminStats ? adminStats.total : <Loader size={16} />}
                            </h2>
                          </div>
                          <div className="scard" style={{ padding: '20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-3)' }}>Standard Users</span>
                            <h2 style={{ fontSize: '28px', fontWeight: '800', margin: '8px 0 0', color: 'var(--blue)' }}>
                              {adminStats ? adminStats.standard : <Loader size={16} />}
                            </h2>
                          </div>
                          <div className="scard" style={{ padding: '20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-3)' }}>Pro Users</span>
                            <h2 style={{ fontSize: '28px', fontWeight: '800', margin: '8px 0 0', color: 'var(--primary)' }}>
                              {adminStats ? adminStats.pro : <Loader size={16} />}
                            </h2>
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                              Standard Users & Requests
                            </h3>
                            <button 
                              className="btn btn--ghost btn--sm" 
                              onClick={loadAdminData}
                              disabled={isAdminLoading}
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                            >
                              Refresh
                            </button>
                          </div>
                          
                          {isAdminLoading && !adminStats ? (
                            <div style={{ textAlign: 'center', padding: '32px' }}><Loader size={20} /></div>
                          ) : adminUsers.standard.length === 0 ? (
                            <div className="scard" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)' }}>
                              No standard users registered.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {adminUsers.standard.map(user => {
                                const isPending = user.pro_request_status === 'PENDING';
                                return (
                                  <div 
                                    key={user.id} 
                                    className="scard" 
                                    style={{ 
                                      padding: '16px', 
                                      border: isPending ? '1px solid var(--amber)' : '1px solid var(--border)',
                                      background: isPending ? 'rgba(245, 158, 11, 0.04)' : 'var(--surface-1)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' }}>{user.name}</h4>
                                          {isPending && (
                                            <span style={{ background: 'var(--amber-light)', color: 'var(--amber)', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                                              Pending
                                            </span>
                                          )}
                                        </div>
                                        <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--text-2)' }}>{user.email}</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '11px', color: 'var(--text-3)' }}>
                                          <span>Device: <span style={{ fontFamily: 'monospace' }}>{user.device_id || 'N/A'}</span></span>
                                          <span>Last Seen: {user.last_seen_at ? new Date(user.last_seen_at).toLocaleDateString() : 'N/A'}</span>
                                          {user.heard_from && <span>From: {user.heard_from}</span>}
                                        </div>
                                        {isPending && user.pro_request_message && (
                                          <p style={{ margin: '8px 0 0', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-2)', fontStyle: 'italic', borderLeft: '3px solid var(--amber)' }}>
                                            "{user.pro_request_message}"
                                          </p>
                                        )}
                                      </div>
                                      <button 
                                        className="btn btn--primary btn--sm" 
                                        style={{ background: 'var(--primary)', borderColor: 'var(--primary)' }}
                                        onClick={() => {
                                          setConfirmState({
                                            open: true,
                                            title: 'Grant Pro Access',
                                            description: `Grant Pro access to ${user.name} (${user.email})?`,
                                            isDanger: false,
                                            onConfirm: async () => {
                                              setConfirmState(prev => ({ ...prev, open: false }));
                                              try {
                                                const headers = { 'Authorization': `Bearer ${adminToken}` };
                                                const res = await apiPost('/admin/grant', { userId: user.id }, headers);
                                                if (res.ok) {
                                                  toast.success('Pro access granted');
                                                  loadAdminData();
                                                } else {
                                                  toast.error(res.error || 'Failed to grant access');
                                                }
                                              } catch (err) {
                                                toast.error(err.message);
                                              }
                                            }
                                          });
                                        }}
                                      >
                                        Grant Pro
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div>
                          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                            Pro Users
                          </h3>
                          {isAdminLoading && !adminStats ? (
                            <div style={{ textAlign: 'center', padding: '32px' }}><Loader size={20} /></div>
                          ) : adminUsers.pro.length === 0 ? (
                            <div className="scard" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)' }}>
                              No Pro users active.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {adminUsers.pro.map(user => (
                                  <div 
                                    key={user.id} 
                                    className="scard" 
                                    style={{ 
                                      padding: '16px', 
                                      border: '1px solid var(--primary)',
                                      background: 'var(--surface-1)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                                      <div>
                                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' }}>{user.name}</h4>
                                        <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--text-2)' }}>{user.email}</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '11px', color: 'var(--text-3)' }}>
                                          <span>Device: <span style={{ fontFamily: 'monospace' }}>{user.device_id || 'N/A'}</span></span>
                                          <span>Granted: {user.pro_granted_at ? new Date(user.pro_granted_at).toLocaleDateString() : 'N/A'}</span>
                                          <span>Last Seen: {user.last_seen_at ? new Date(user.last_seen_at).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                      </div>
                                      <button 
                                        className="btn btn--outline btn--sm" 
                                        style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                                        onClick={() => {
                                          setConfirmState({
                                            open: true,
                                            title: 'Revoke Pro Access',
                                            description: `Revoke Pro access for ${user.name} (${user.email})?`,
                                            isDanger: true,
                                            onConfirm: async () => {
                                              setConfirmState(prev => ({ ...prev, open: false }));
                                              try {
                                                const headers = { 'Authorization': `Bearer ${adminToken}` };
                                                const res = await apiPost('/admin/revoke', { userId: user.id }, headers);
                                                if (res.ok) {
                                                  toast.success('Pro access revoked');
                                                  loadAdminData();
                                                } else {
                                                  toast.error(res.error || 'Failed to revoke access');
                                                }
                                              } catch (err) {
                                                toast.error(err.message);
                                              }
                                            }
                                          });
                                        }}
                                      >
                                        Revoke Pro
                                      </button>
                                    </div>
                                  </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activePage === 'settings' && (
                <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
                  <div className="page__header page__header--sticky">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <h2 className="page__title">{t('settings')}</h2>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Notification Bell */}
                        <button 
                          className="btn btn--icon" 
                          onClick={async () => {
                            setNotificationsModalOpen(true);
                            const email = localStorage.getItem('user_email');
                            const unreadCount = notifications.filter(n => !n.is_read).length;
                            if (unreadCount > 0) {
                              try {
                                const { markNotificationsAsRead } = await import('../features/electricity/api/servicesApi.js');
                                await markNotificationsAsRead(email);
                                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                              } catch (err) {
                                console.error('[notifications] Mark read failed:', err.message);
                              }
                            }
                          }}
                          style={{ 
                            position: 'relative', 
                            background: 'transparent', 
                            border: 'none', 
                            color: notifications.some(n => !n.is_read) ? 'var(--primary)' : 'var(--text-2)', 
                            padding: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          aria-label="Notifications"
                        >
                          <FiBell size={20} />
                          {notifications.some(n => !n.is_read) && (
                            <span style={{ 
                              position: 'absolute', 
                              top: '2px', 
                              right: '2px', 
                              background: 'var(--red)', 
                              color: 'white', 
                              borderRadius: '50%', 
                              fontSize: '9px', 
                              fontWeight: 'bold', 
                              padding: '1px 5px', 
                              lineHeight: 1 
                            }}>
                              {notifications.filter(n => !n.is_read).length}
                            </span>
                          )}
                        </button>

                        {electricityContext.isPro && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--primary)' }}>
                              <FiZap size={14} fill="currentColor" /> PRO
                            </div>
                            {electricityContext.proSource && (
                              <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 'bold', textTransform: 'uppercase', marginRight: '4px' }}>
                                via {electricityContext.proSource === 'request' ? 'Request Access' : 'Coupon Code'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account & Subscription</h3>
                      <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                        <SettingsItem 
                          icon={FiUser} 
                          label="User Profile" 
                          description={userName ? "View or edit your contact details" : "Set your name and email for Pro access"} 
                          onClick={() => setActivePage('user-profile')} 
                          color="var(--blue)" 
                        />
                        <div style={{ height: '1px', background: 'var(--border)', margin: '0 16px' }} />
                        {!electricityContext.isPro ? (
                          <SettingsItem 
                            icon={FiZap} 
                            label="Request Access" 
                            description="Unlock unlimited services & premium features" 
                            onClick={() => setCapModalOpen(true)} 
                            color="var(--primary)" 
                          />
                        ) : (
                          <SettingsItem 
                            icon={FiZap} 
                            label="Request Withdrawal" 
                            description="Cancel your Pro access and return to standard" 
                            onClick={handleWithdrawPro} 
                            color="var(--text-3)" 
                          />
                        )}
                        {adminToken && (
                          <>
                            <div style={{ height: '1px', background: 'var(--border)', margin: '0 16px' }} />
                            <SettingsItem 
                              icon={FiShield} 
                              label="Administration" 
                              description="Manage users and track dashboard stats" 
                              onClick={() => setActivePage('admin')} 
                              color="var(--red)" 
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tools & Utilities</h3>
                      <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                        <SettingsItem icon={FiShuffle} label={t('prefix_migration')} description="Batch update service prefixes" onClick={() => setActivePage('prefix-migration')} color="var(--blue)" />
                        <SettingsItem icon={FiActivity} label="Slab Configuration" description="Configure billing rates & slabs" onClick={() => setActivePage('calculation-settings')} color="var(--orange)" />
                      </div>
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preferences</h3>
                      <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="settings-item__icon" style={{ color: 'var(--primary)' }}><FiLayout size={18} /></div><span style={{ fontSize: '15px', fontWeight: '600' }}>{t('theme')}</span></div>
                          <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                            <button className={`seg__btn ${theme === 'system' ? 'seg__btn--active' : ''}`} onClick={() => handleThemeChange('system')}>Auto</button>
                            <button className={`seg__btn ${theme === 'dark' ? 'seg__btn--active' : ''}`} onClick={() => handleThemeChange('dark')}>{t('dark')}</button>
                            <button className={`seg__btn ${theme === 'light' ? 'seg__btn--active' : ''}`} onClick={() => handleThemeChange('light')}>{t('light')}</button>
                          </div>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="settings-item__icon" style={{ color: 'var(--violet)' }}><FiLayers size={18} /></div><span style={{ fontSize: '15px', fontWeight: '600' }}>Display Density</span></div>
                          <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                            <button className={`seg__btn ${density === 'comfortable' ? 'seg__btn--active' : ''}`} onClick={() => handleDensityChange('comfortable')}>Default</button>
                            <button className={`seg__btn ${density === 'compact' ? 'seg__btn--active' : ''}`} onClick={() => handleDensityChange('compact')}>Compact</button>
                          </div>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="settings-item__icon" style={{ color: 'var(--green)' }}><FiGlobe size={18} /></div><span style={{ fontSize: '15px', fontWeight: '600' }}>{t('language')}</span></div>
                          <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                            <button className={`seg__btn ${i18n.language === 'en' ? 'seg__btn--active' : ''}`} onClick={() => changeLanguage('en')}>EN</button>
                            <button className={`seg__btn ${i18n.language === 'te' ? 'seg__btn--active' : ''}`} onClick={() => changeLanguage('te')}>తెలుగు</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Management</h3>
                      <div className="scard" style={{ padding: '0', overflow: 'hidden' }}><BackupRestore electricityContext={electricityContext} /></div>
                    </div>
                    {Capacitor.getPlatform() !== 'web' && (
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System</h3>
                        <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                          <SettingsItem icon={FiBell} label="Notifications" description="Sync push notification token" onClick={async () => { const success = await syncPushTokenWithServer(null, true); if (success) toast.success('Notifications synced!'); }} color="var(--purple)" />
                        </div>
                      </div>
                    )}
                    <div>
                      <h3 style={{ marginLeft: '4px', marginBottom: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Support & Legal</h3>
                      <div className="scard" style={{ padding: '0', overflow: 'hidden' }}>
                        <SettingsItem icon={FiMail} label={t('contact_developer')} description="Report bugs or suggest features" onClick={() => window.location.href = "mailto:mail.akbarmulla@gmail.com?subject=AP Vidyuth App Feedback"} color="var(--primary)" />
                        <SettingsItem icon={FiShield} label="Privacy Policy" description="How we handle your data" onClick={() => setActivePage('privacy')} color="var(--text-2)" />
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
            <button key={id} className={`bottom-nav__item ${activePage === id || (id === 'settings' && ['prefix-migration', 'calculation-settings', 'privacy', 'user-profile'].includes(activePage)) ? 'bottom-nav__item--active' : ''}`} onClick={() => handleNavClick(id)} aria-label={t(id)}>
              <Icon size={20} /><span>{t(id)}</span>
            </button>
          ))}
        </nav>
        <Toaster position="bottom-center" visibleToasts={1} containerClassName="toast-container" containerStyle={{ zIndex: 200000 }} toastOptions={{ success: { duration: 2000 }, error: { duration: 4000 }, duration: 3000, style: { background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px', fontWeight: '500', fontFamily: 'var(--font)', boxShadow: 'var(--shadow-lg)' } }} />
        <Analytics /><SpeedInsights />

        <ServiceCapModal 
          open={capModalOpen} 
          serviceCount={electricityContext.services.filter(s => !s.isDeleted).length}
          onClose={() => setCapModalOpen(false)} 
        />
        <RequestAccessForm open={withdrawFormOpen} type="WITHDRAW" onClose={() => setWithdrawFormOpen(false)} onSuccess={handleRequestSuccess} />
        <RequestSuccessModal {...successState} onClose={() => setSuccessState({ open: false, type: '', email: '' })} />
        <ProfileRegistrationModal 
          open={profileModalOpen} 
          onClose={() => setProfileModalOpen(false)} 
          onSave={handleProfileSave} 
        />
        <NotificationsModal 
          open={notificationsModalOpen} 
          notifications={notifications} 
          onClose={() => setNotificationsModalOpen(false)} 
        />
        <ConfirmDialog 
          open={confirmState.open} 
          title={confirmState.title} 
          description={confirmState.description} 
          isDanger={confirmState.isDanger} 
          onClose={() => setConfirmState(prev => ({ ...prev, open: false }))} 
          onConfirm={confirmState.onConfirm} 
        />
      </div>
    </div>
  );
}

export function ProfileRegistrationModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [heardFrom, setHeardFrom] = useState('');

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim() || !email.trim()) return;
    onSave(name.trim(), email.trim(), heardFrom || null);
  };

  const handleSkip = () => {
    localStorage.setItem('profile_prompt_shown', 'true');
    onClose();
  };

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 11000 }}>
      <div className="dialog" role="dialog" style={{ width: '420px', maxWidth: '90vw' }}>
        <div className="dialog__header" style={{ padding: '24px 24px 16px' }}>
          <h2 className="dialog__title">Complete Your Profile</h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.5', marginTop: '8px' }}>
            Set up your profile to enable personalized updates, notification alerts, and seamless Pro access requests.
          </p>
        </div>
        <div className="dialog__body" style={{ padding: '0 24px' }}>
          <div className="field" style={{ marginBottom: '16px' }}>
            <label className="field__label">Full Name *</label>
            <input className="field__input" placeholder="e.g. Akbar Mulla" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: '16px' }}>
            <label className="field__label">Email Address *</label>
            <input className="field__input" type="email" placeholder="e.g. name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: '16px' }}>
            <label className="field__label">How did you hear about AP Vidyuth? (Optional)</label>
            <select 
              className="field__input" 
              value={heardFrom} 
              onChange={e => setHeardFrom(e.target.value)}
              style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}
            >
              <option value="">Select an option</option>
              <option value="WhatsApp Groups">WhatsApp Groups</option>
              <option value="Friends">Friends</option>
              <option value="APSPDCL Searches">APSPDCL Searches</option>
              <option value="Social Media">Social Media</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: '1.4', margin: '12px 0 0' }}>
            Privacy Note: We only use your information for app synchronization and notification alerts. We never sell your data.
          </p>
        </div>
        <div className="dialog__footer" style={{ padding: '20px 24px 24px', display: 'flex', gap: '12px' }}>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={handleSkip}>Skip for Now</button>
          <button className="btn btn--primary" style={{ flex: 1.5 }} onClick={handleSave} disabled={!name.trim() || !email.trim()}>Save details</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function NotificationsModal({ open, notifications, onClose }) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 11000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" style={{ width: '480px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialog__header" style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
          <h2 className="dialog__title">Inbox Notifications</h2>
        </div>
        <div className="dialog__body" style={{ padding: '0 24px 24px', overflowY: 'auto', flex: 1 }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
              <FiBell size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '14px' }}>You're all caught up! No notifications yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notifications.map(n => (
                <div 
                  key={n.id} 
                  style={{ 
                    padding: '16px', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border)', 
                    background: n.is_read ? 'var(--surface-1)' : 'var(--primary-light)',
                    borderColor: n.is_read ? 'var(--border)' : 'var(--primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-1)' }}>{n.title}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                      {new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.4' }}>{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="dialog__footer" style={{ padding: '20px 24px 24px', flexShrink: 0 }}>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function App() {
  return (
    <PostHogProvider client={posthog}>
      <AppContent />
    </PostHogProvider>
  );
}
