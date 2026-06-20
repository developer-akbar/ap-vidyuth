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
import { FiZap, FiGrid, FiSettings, FiMonitor, FiUser, FiArrowLeft, FiShuffle, FiLayers, FiActivity, FiGlobe, FiLayout, FiBell, FiShield, FiMail, FiWifiOff, FiCopy, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';

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
  const devClickCountRef = useRef(0);
  const [globalProgress, setGlobalProgress] = useState(null);
  const electricityContext = useElectricityServices();

  const [meterLogCount, setMeterLogCount] = useState(0);
  const [capModalOpen, setCapModalOpen] = useState(false);
  const [withdrawFormOpen, setWithdrawFormOpen] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => { } });

  const [userName, setUserName] = useState(() => localStorage.getItem('user_name') || '');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('user_email') || '');
  const [heardFrom, setHeardFrom] = useState(() => localStorage.getItem('user_heard_from') || '');
  const [userToken, setUserToken] = useState(() => localStorage.getItem('ap_vidyuth_token') || null);
  const [resetPasswordState, setResetPasswordState] = useState(null);

  // Profile modal trigger
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // User notifications
  const [notifications, setNotifications] = useState([]);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isDecliningUserId, setIsDecliningUserId] = useState(null);

  // Admin Dashboard state
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('admin_token') || null);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState({ standard: [], pro: [] });
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [expandedUsers, setExpandedUsers] = useState(new Set());

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

  const toggleUserExpanded = (userId) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleCopyDeviceId = (e, deviceId) => {
    e.stopPropagation();
    if (!deviceId) return;
    navigator.clipboard.writeText(deviceId);
    toast.success('Device ID copied to clipboard');
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

  // Handle forgot-password email redirect token detection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const email = params.get('email');
    if (token && email) {
      setResetPasswordState({ token, email });
      setActivePage('reset-password');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Background Postgres sync on mount if authenticated
  useEffect(() => {
    const initSync = async () => {
      const token = localStorage.getItem('ap_vidyuth_token');
      if (token) {
        try {
          const { db } = await import('../shared/db/storage.js');
          await db.syncWithPostgres();
          console.log('[sync] Background sync merge complete on startup');
        } catch (err) {
          console.warn('[sync] Startup sync merge failed:', err.message);
        }
      }
    };
    initSync();
  }, []);

  // Authentication success event listener
  useEffect(() => {
    const handleAuthSuccess = async (e) => {
      const { token, user } = e.detail;
      setUserToken(token);
      setUserName(user.name);
      setUserEmail(user.email);
      setHeardFrom(user.heardFrom || '');

      const { db } = await import('../shared/db/storage.js');
      const { isSecurePro } = await import('../features/electricity/utils/billing.js');
      if (user.role === 'PRO') {
        await db.setSetting('is_pro', isSecurePro('WHITELISTED'));
        await db.setSetting('pro_source', 'admin');
      } else {
        await db.setSetting('is_pro', null);
        await db.setSetting('pro_source', null);
      }
      await db.setSetting('plan_name', user.planName || 'FREE');
      await db.setSetting('service_limit', String(user.serviceLimit || 4));

      try {
        toast.loading('Syncing your data...', { id: 'auth-sync' });
        await db.syncWithPostgres();
        toast.success('Services and readings synchronized!', { id: 'auth-sync' });
      } catch (err) {
        toast.error('Local merge complete. Sync pending: ' + err.message, { id: 'auth-sync' });
      }

      electricityContext.actions.reload();
    };

    window.addEventListener('auth-success', handleAuthSuccess);
    return () => window.removeEventListener('auth-success', handleAuthSuccess);
  }, [electricityContext]);


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
              {activePage === 'electricity' && <ElectricityDashboard onOpenCalcSettings={() => handleNavClick('calculation-settings')} electricityContext={electricityContext} profileModalOpen={profileModalOpen} />}
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
                      <h2 className="page__title">Account & Security</h2>
                    </div>
                  </div>
                  <div className="page__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
                    {!userToken ? (
                      <div className="scard" style={{ padding: '30px', textAlign: 'center', alignItems: 'center' }}>
                        <FiUser size={48} style={{ color: 'var(--primary)', marginBottom: '16px', opacity: 0.8 }} />
                        <h3>Access Your Account</h3>
                        <p style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.5', marginBottom: '24px' }}>
                          Sign in or create a standard profile account to synchronize your tracked services, bills history, and meter reading logs across all your devices.
                        </p>
                        <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => setProfileModalOpen(true)}>
                          Login / Register
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Profile Info */}
                        <div className="scard" style={{ padding: '24px' }}>
                          <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: 'var(--text-1)' }}>Profile Details</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 'bold' }}>Name</div>
                              <div style={{ fontSize: '15px', color: 'var(--text-1)', fontWeight: '500' }}>{userName}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 'bold' }}>Email Address</div>
                              <div style={{ fontSize: '15px', color: 'var(--text-1)', fontWeight: '500' }}>{userEmail}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 'bold', marginBottom: '4px' }}>Subscription Status</div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: electricityContext.isPro ? 'var(--primary)' : 'var(--text-2)', display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: electricityContext.isPro ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)' }}>
                                  {electricityContext.isPro ? 'PRO ACCESS' : 'STANDARD (FREE)'}
                                </div>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-2)', display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                  {electricityContext.planName} Plan ({electricityContext.serviceLimit === 999999 ? 'Unlimited' : `${electricityContext.serviceLimit} Services`})
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Sync Status */}
                        <div className="scard" style={{ padding: '24px' }}>
                          <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: 'var(--text-1)' }}>Data Synchronization</h3>
                          <p style={{ color: 'var(--text-3)', fontSize: '12px', lineHeight: '1.4', margin: '0 0 16px' }}>
                            Your electricity services and meter readings are automatically backed up to Postgres.
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--surface-2)', borderRadius: '8px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>Cloud Status</span>
                            <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></span> Connected
                            </span>
                          </div>
                          <button
                            className="btn btn--outline"
                            style={{ width: '100%', borderColor: 'var(--border)', opacity: isSyncing ? 0.7 : 1 }}
                            disabled={isSyncing}
                            onClick={async () => {
                              setIsSyncing(true);
                              const syncToast = toast.loading('Syncing with PostgreSQL database...');
                              try {
                                const { db } = await import('../shared/db/storage.js');
                                await db.syncWithPostgres();
                                toast.success('Data merge and synchronization complete!', { id: syncToast });
                              } catch (err) {
                                toast.error('Cloud sync failed: ' + err.message, { id: syncToast });
                              } finally {
                                setIsSyncing(false);
                              }
                            }}
                          >
                            {isSyncing ? 'Syncing...' : 'Sync with Database'}
                          </button>
                        </div>

                        {/* Change Password */}
                        <div className="scard" style={{ padding: '24px' }}>
                          <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: 'var(--text-1)' }}>Change Password</h3>
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            const cur = e.target.curPass.value;
                            const next = e.target.newPass.value;
                            const conf = e.target.confPass.value;
                            if (!cur || !next || !conf) {
                              toast.error('All fields are required.');
                              return;
                            }
                            if (next !== conf) {
                              toast.error('New passwords do not match.');
                              return;
                            }
                            if (next.length < 6) {
                              toast.error('New password must be at least 6 characters.');
                              return;
                            }
                            const upToast = toast.loading('Updating security credentials...');
                            try {
                              const { changePassword } = await import('../features/electricity/api/servicesApi.js');
                              await changePassword(cur, next);
                              toast.success('Password changed successfully!', { id: upToast });
                              e.target.reset();
                            } catch (err) {
                              toast.error(err.message || 'Failed to change password.', { id: upToast });
                            }
                          }}>
                            <div className="field" style={{ marginBottom: '12px' }}>
                              <label className="field__label" style={{ fontSize: '11px' }}>Current Password</label>
                              <input className="field__input" type="password" name="curPass" placeholder="Enter current password" required />
                            </div>
                            <div className="field" style={{ marginBottom: '12px' }}>
                              <label className="field__label" style={{ fontSize: '11px' }}>New Password</label>
                              <input className="field__input" type="password" name="newPass" placeholder="Min. 6 characters" required />
                            </div>
                            <div className="field" style={{ marginBottom: '16px' }}>
                              <label className="field__label" style={{ fontSize: '11px' }}>Confirm New Password</label>
                              <input className="field__input" type="password" name="confPass" placeholder="Confirm new password" required />
                            </div>
                            <button type="submit" className="btn btn--primary" style={{ width: '100%' }}>Update Password</button>
                          </form>
                        </div>

                        {/* Sign Out */}
                        <button
                          className="btn btn--outline"
                          style={{ width: '100%', borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent' }}
                          onClick={async () => {
                            localStorage.removeItem('ap_vidyuth_token');
                            localStorage.removeItem('user_name');
                            localStorage.removeItem('user_email');
                            localStorage.removeItem('user_heard_from');
                            setUserToken(null);
                            setUserName('');
                            setUserEmail('');
                            setHeardFrom('');

                            const { db } = await import('../shared/db/storage.js');
                            await db.setSetting('is_pro', null);
                            await db.setSetting('pro_source', null);
                            electricityContext.actions.reload();

                            toast.success('Signed out successfully');
                            setActivePage('settings');
                          }}
                        >
                          Log Out Account
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {activePage === 'reset-password' && resetPasswordState && (
                <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
                  <div className="page__header page__header--sticky">
                    <h2 className="page__title">Reset Account Password</h2>
                  </div>
                  <div className="page__body" style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const newPass = e.target.newPass.value;
                      const confirmPass = e.target.confirmPass.value;
                      if (!newPass || !confirmPass) {
                        toast.error('All fields are required.');
                        return;
                      }
                      if (newPass !== confirmPass) {
                        toast.error('Passwords do not match.');
                        return;
                      }
                      if (newPass.length < 6) {
                        toast.error('Password must be at least 6 characters.');
                        return;
                      }
                      const resetToast = toast.loading('Resetting password...');
                      try {
                        const { resetPassword } = await import('../features/electricity/api/servicesApi.js');
                        await resetPassword(resetPasswordState.email, resetPasswordState.token, newPass);
                        toast.success('Password reset successfully! Please log in.', { id: resetToast });
                        setResetPasswordState(null);
                        setActivePage('settings');
                        setProfileModalOpen(true);
                      } catch (err) {
                        toast.error(err.message || 'Failed to reset password.', { id: resetToast });
                      }
                    }} className="scard" style={{ padding: '24px', width: '400px', maxWidth: '90vw' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
                        Set a new secure password for <strong>{resetPasswordState.email}</strong>.
                      </p>
                      <div className="field" style={{ marginBottom: '14px' }}>
                        <label className="field__label">New Password</label>
                        <input className="field__input" type="password" name="newPass" placeholder="Min. 6 characters" required />
                      </div>
                      <div className="field" style={{ marginBottom: '20px' }}>
                        <label className="field__label">Confirm New Password</label>
                        <input className="field__input" type="password" name="confirmPass" placeholder="Confirm password" required />
                      </div>
                      <button type="submit" className="btn btn--primary" style={{ width: '100%' }}>Update Password</button>
                    </form>
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
                  <div className="page__body">
                    {!adminToken ? (
                      <div className="scard" style={{ maxWidth: '400px', margin: '40px auto 0', padding: '20px' }}>
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
                        {/* Stats Cards Section */}
                        {(() => {
                          const allUsersList = [...(adminUsers.standard || []), ...(adminUsers.pro || [])];
                          const nowMs = Date.now();
                          const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

                          const totalCount = allUsersList.length;
                          const registeredCount = allUsersList.filter(u => u.email).length;
                          const unregisteredCount = allUsersList.filter(u => !u.email).length;
                          const pendingRequestsCount = allUsersList.filter(u => u.pro_request_status === 'PENDING').length;

                          const mauCount = allUsersList.filter(u => u.last_seen_at && new Date(u.last_seen_at).getTime() >= thirtyDaysAgoMs).length;
                          const monthlyRequestsCount = allUsersList.filter(u => u.pro_requested_at && new Date(u.pro_requested_at).getTime() >= thirtyDaysAgoMs).length;

                          // Trend Calculation
                          const getRegistrationTrend = () => {
                            const trend = [];
                            const now = new Date();
                            for (let i = 5; i >= 0; i--) {
                              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                              const monthLabel = d.toLocaleDateString('en-US', { month: 'short' });
                              const yearLabel = d.getFullYear().toString().slice(-2);
                              const label = `${monthLabel} '${yearLabel}`;
                              const count = allUsersList.filter(u => {
                                if (!u.registered_at) return false;
                                const regDate = new Date(u.registered_at);
                                return regDate.getFullYear() === d.getFullYear() && regDate.getMonth() === d.getMonth();
                              }).length;
                              trend.push({ label, count });
                            }
                            return trend;
                          };
                          const registrationTrend = getRegistrationTrend();
                          const maxTrendCount = Math.max(...registrationTrend.map(t => t.count), 1);

                          // Referral Breakdown
                          const getReferralStats = () => {
                            const counts = {};
                            let totalWithReferral = 0;
                            allUsersList.forEach(u => {
                              const source = u.heard_from || 'Direct / Unknown';
                              counts[source] = (counts[source] || 0) + 1;
                              totalWithReferral++;
                            });
                            return Object.entries(counts)
                              .map(([source, count]) => ({
                                source,
                                count,
                                percentage: totalWithReferral > 0 ? Math.round((count / totalWithReferral) * 100) : 0
                              }))
                              .sort((a, b) => b.count - a.count);
                          };
                          const referralStats = getReferralStats();

                          // Search Filter logic
                          const filterBySearch = (u) => {
                            if (!adminSearchQuery) return true;
                            const q = adminSearchQuery.toLowerCase();
                            const nameMatch = u.name ? u.name.toLowerCase().includes(q) : false;
                            const emailMatch = u.email ? u.email.toLowerCase().includes(q) : false;
                            const deviceMatch = u.device_id ? u.device_id.toLowerCase().includes(q) : false;
                            return nameMatch || emailMatch || deviceMatch;
                          };

                          // Filter and sort ASC (oldest first)
                          const pendingRequests = allUsersList
                            .filter(u => u.pro_request_status === 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.pro_requested_at || a.created_at || 0) - new Date(b.pro_requested_at || b.created_at || 0));

                          const freeUsers = allUsersList
                            .filter(u => !u.email)
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.registered_at || a.created_at || 0) - new Date(b.registered_at || b.created_at || 0));

                          const standardUsersOnly = allUsersList
                            .filter(u => u.email && (u.plan_name || 'FREE').toUpperCase() === 'FREE' && u.pro_request_status !== 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.registered_at || a.created_at || 0) - new Date(b.registered_at || b.created_at || 0));

                          const bronzeUsers = allUsersList
                            .filter(u => u.email && (u.plan_name || '').toUpperCase() === 'BRONZE' && u.pro_request_status !== 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.pro_granted_at || a.registered_at || 0) - new Date(b.pro_granted_at || b.registered_at || 0));

                          const silverUsers = allUsersList
                            .filter(u => u.email && (u.plan_name || '').toUpperCase() === 'SILVER' && u.pro_request_status !== 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.pro_granted_at || a.registered_at || 0) - new Date(b.pro_granted_at || b.registered_at || 0));

                          const goldUsers = allUsersList
                            .filter(u => u.email && (u.plan_name || '').toUpperCase() === 'GOLD' && u.pro_request_status !== 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.pro_granted_at || a.registered_at || 0) - new Date(b.pro_granted_at || b.registered_at || 0));

                          const platinumUsers = allUsersList
                            .filter(u => u.email && (u.plan_name || '').toUpperCase() === 'PLATINUM' && u.pro_request_status !== 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.pro_granted_at || a.registered_at || 0) - new Date(b.pro_granted_at || b.registered_at || 0));

                          const diamondUsers = allUsersList
                            .filter(u => u.email && (u.plan_name || '').toUpperCase() === 'DIAMOND' && u.pro_request_status !== 'PENDING')
                            .filter(filterBySearch)
                            .sort((a, b) => new Date(a.pro_granted_at || a.registered_at || 0) - new Date(b.pro_granted_at || b.registered_at || 0));

                          // Row Render Helper
                          const formatDateTime = (dtStr) => {
                            if (!dtStr) return 'N/A';
                            const d = new Date(dtStr);
                            if (isNaN(d.getTime())) return 'N/A';
                            return d.toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          };

                          const renderUserRow = (user, type) => {
                            const isExpanded = expandedUsers.has(user.id);
                            const currentPlan = user.plan_name || 'FREE';
                            let subtitleText = '';

                            if (type === 'PENDING') {
                              subtitleText = `${user.email || 'Anonymous'} • Requested: ${formatDateTime(user.pro_requested_at)}`;
                            } else if (type === 'FREE') {
                              subtitleText = `Device: ${user.device_id ? user.device_id.substring(0, 8) + '...' : 'Unknown'} • Active: ${formatDateTime(user.last_seen_at || user.created_at)}`;
                            } else if (type === 'STANDARD') {
                              subtitleText = `${user.email || 'Anonymous'} • Registered: ${formatDateTime(user.registered_at || user.created_at)}`;
                            } else {
                              subtitleText = `${user.email || 'Anonymous'} • Granted: ${formatDateTime(user.pro_granted_at || user.registered_at)}`;
                            }

                            const selectElement = (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                <select
                                  defaultValue={currentPlan}
                                  id={`plan-select-${user.id}`}
                                  style={{
                                    background: 'var(--surface-2)',
                                    color: 'var(--text-1)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                  onChange={(e) => {
                                    const saveBtn = document.getElementById(`save-plan-${user.id}`);
                                    if (saveBtn) {
                                      if (e.target.value !== currentPlan) {
                                        saveBtn.style.display = 'inline-flex';
                                      } else {
                                        saveBtn.style.display = 'none';
                                      }
                                    }
                                  }}
                                >
                                  <option value="FREE">FREE (4)</option>
                                  <option value="BRONZE">BRONZE (8)</option>
                                  <option value="SILVER">SILVER (16)</option>
                                  <option value="GOLD">GOLD (32)</option>
                                  <option value="PLATINUM">PLATINUM (64)</option>
                                  <option value="DIAMOND">DIAMOND (∞)</option>
                                </select>
                                <button
                                  id={`save-plan-${user.id}`}
                                  className="btn btn--primary btn--xs"
                                  style={{ display: 'none', fontSize: '11px', padding: '0 8px', height: '24px' }}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const selectVal = document.getElementById(`plan-select-${user.id}`).value;
                                    setConfirmState({
                                      open: true,
                                      title: 'Update Plan',
                                      description: `Change plan for ${user.name || 'Anonymous User'} (${user.email || 'No email'}) to ${selectVal}?`,
                                      isDanger: selectVal === 'FREE',
                                      onConfirm: async () => {
                                        setConfirmState(prev => ({ ...prev, open: false }));
                                        try {
                                          const headers = { 'Authorization': `Bearer ${adminToken}` };
                                          const res = await apiPost('/admin/grant', { userId: user.id, planName: selectVal }, headers);
                                          if (res.ok) {
                                            toast.success(`Plan updated to ${selectVal}`);
                                            loadAdminData();
                                          } else {
                                            toast.error(res.error || 'Failed to update plan');
                                          }
                                        } catch (err) {
                                          toast.error(err.message);
                                        }
                                      }
                                    });
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            );

                            return (
                              <div
                                key={user.id}
                                onClick={() => toggleUserExpanded(user.id)}
                                style={{
                                  padding: '10px 14px',
                                  borderBottom: '1px solid var(--border)',
                                  cursor: 'pointer',
                                  background: isExpanded ? 'var(--surface-2)' : 'var(--surface-1)',
                                  transition: 'background 0.2s',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '12px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                                      <span
                                        style={{
                                          fontWeight: '600',
                                          fontSize: '14px',
                                          color: 'var(--text-1)',
                                          textOverflow: 'ellipsis',
                                          overflow: 'hidden',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {user.name || (type === 'FREE' ? 'Anonymous Device' : 'Anonymous User')}
                                      </span>
                                      <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 6px', borderRadius: '10px', background: currentPlan === 'FREE' ? 'var(--surface-2)' : 'rgba(99,102,241,0.15)', color: currentPlan === 'FREE' ? 'var(--text-3)' : 'var(--primary)', border: '1px solid var(--border)', textTransform: 'uppercase', flexShrink: 0 }}>
                                        {currentPlan}
                                      </span>
                                      {user.requested_plan && (
                                        <span style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', fontSize: '9px', fontWeight: '800', padding: '1px 6px', borderRadius: '10px', textTransform: 'uppercase', flexShrink: 0 }}>
                                          Req: {user.requested_plan}
                                        </span>
                                      )}
                                      {type === 'PENDING' && (
                                        <span
                                          style={{
                                            background: 'var(--amber-dim)',
                                            color: 'var(--amber)',
                                            fontSize: '9px',
                                            fontWeight: '800',
                                            padding: '1px 6px',
                                            borderRadius: '10px',
                                            textTransform: 'uppercase',
                                            flexShrink: 0
                                          }}
                                        >
                                          Pending
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        color: 'var(--text-3)',
                                        textOverflow: 'ellipsis',
                                        overflow: 'hidden',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {subtitleText}
                                    </span>
                                  </div>
                                  <div style={{ flexShrink: 0 }}>
                                    {selectElement}
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      marginTop: '8px',
                                      padding: '10px',
                                      borderRadius: '8px',
                                      background: 'var(--surface-3)',
                                      border: '1px solid var(--border)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '8px',
                                      fontSize: '12px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span>
                                        <strong>Device ID:</strong>{' '}
                                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', wordBreak: 'break-all' }}>
                                          {user.device_id || 'N/A'}
                                        </span>
                                      </span>
                                      {user.device_id && (
                                        <button
                                          onClick={(e) => handleCopyDeviceId(e, user.device_id)}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            color: 'var(--primary)',
                                            padding: '4px',
                                            borderRadius: '4px'
                                          }}
                                          title="Copy Device ID"
                                          aria-label="Copy Device ID"
                                        >
                                          <FiCopy size={13} />
                                        </button>
                                      )}
                                    </div>
                                    <div>
                                      <strong>Active Plan:</strong> {user.plan_name || 'FREE'} (Limit: {user.service_limit === 999999 ? 'Unlimited' : user.service_limit})
                                    </div>
                                    {user.requested_plan && (
                                      <div>
                                        <strong>Requested Plan:</strong> {user.requested_plan}
                                      </div>
                                    )}
                                    {user.heard_from && (
                                      <div>
                                        <strong>Referral Keyword:</strong> {user.heard_from}
                                      </div>
                                    )}
                                    <div>
                                      <strong>Registered/Discovered At:</strong> {formatDateTime(user.registered_at || user.created_at)}
                                    </div>
                                    <div>
                                      <strong>Last Seen:</strong> {formatDateTime(user.last_seen_at)}
                                    </div>
                                    {type === 'PENDING' && user.pro_request_message && (
                                      <div
                                        style={{
                                          marginTop: '4px',
                                          padding: '8px',
                                          background: 'var(--surface-1)',
                                          borderRadius: '6px',
                                          fontStyle: 'italic',
                                          borderLeft: '3px solid var(--amber)',
                                          color: 'var(--text-2)'
                                        }}
                                      >
                                        "{user.pro_request_message}"
                                      </div>
                                    )}
                                    {type === 'PENDING' && (
                                      <div 
                                        style={{ 
                                          marginTop: '12px', 
                                          paddingTop: '10px', 
                                          borderTop: '1px solid var(--border)',
                                          display: 'flex', 
                                          flexDirection: 'column', 
                                          gap: '6px' 
                                        }}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-2)' }}>
                                          Decline Reason (shared with user):
                                        </label>
                                        <textarea
                                          id={`decline-reason-${user.id}`}
                                          placeholder="e.g. Please enter a valid name and company email address..."
                                          className="field__input"
                                          style={{ 
                                            width: '100%', 
                                            height: '56px', 
                                            padding: '6px 8px', 
                                            fontSize: '12px', 
                                            resize: 'vertical',
                                            borderRadius: '6px',
                                            background: 'var(--surface-1)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-1)'
                                          }}
                                        />
                                        <button
                                          className="btn btn--xs"
                                          style={{ 
                                            background: 'var(--red)', 
                                            color: 'white', 
                                            border: 'none', 
                                            alignSelf: 'flex-start',
                                            padding: '4px 12px',
                                            fontSize: '11px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            fontWeight: '600',
                                            opacity: isDecliningUserId === user.id ? 0.7 : 1
                                          }}
                                          disabled={isDecliningUserId === user.id}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const reasonVal = document.getElementById(`decline-reason-${user.id}`).value;
                                            setConfirmState({
                                              open: true,
                                              title: 'Decline Request',
                                              description: `Decline pro access request for ${user.name || 'Anonymous User'}?`,
                                              isDanger: true,
                                              onConfirm: async () => {
                                                setConfirmState(prev => ({ ...prev, open: false }));
                                                setIsDecliningUserId(user.id);
                                                try {
                                                  const headers = { 'Authorization': `Bearer ${adminToken}` };
                                                  const res = await apiPost('/admin/decline', { userId: user.id, reason: reasonVal }, headers);
                                                  if (res.ok) {
                                                    toast.success('Request declined and email sent.');
                                                    loadAdminData();
                                                  } else {
                                                    toast.error(res.error || 'Failed to decline request');
                                                  }
                                                } catch (err) {
                                                  toast.error(err.message);
                                                } finally {
                                                  setIsDecliningUserId(null);
                                                }
                                              }
                                            });
                                          }}
                                        >
                                          {isDecliningUserId === user.id ? 'Declining in progress' : 'Decline Access'}
                                        </button>
                                      </div>
                                    )}
                                    {user.decline_reason && (
                                      <div
                                        style={{
                                          marginTop: '4px',
                                          padding: '8px',
                                          background: 'rgba(239, 68, 68, 0.05)',
                                          borderRadius: '6px',
                                          borderLeft: '3px solid var(--red)',
                                          color: 'var(--text-2)'
                                        }}
                                      >
                                        <strong>Previous Decline Reason:</strong> "{user.decline_reason}"
                                      </div>
                                    )}
                                    {user.pro_granted_at && (
                                      <div>
                                        <strong>Pro Granted At:</strong> {formatDateTime(user.pro_granted_at)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          };

                          const renderUserSection = (title, count, list, type, emptyText) => {
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div className="scard" style={{ overflow: 'hidden', padding: 0, border: '1px solid var(--border)' }}>
                                  <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.05em' }}>
                                      {title} ({count})
                                    </h4>
                                  </div>
                                  {isAdminLoading && !allUsersList.length ? (
                                    <div style={{ textAlign: 'center', padding: '24px' }}><Loader size={16} /></div>
                                  ) : list.length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                                      {adminSearchQuery ? 'No matching users.' : emptyText}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      {list.map(user => renderUserRow(user, type))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          };

                          return (
                            <>
                              {/* Grid containing redesigned stats cards */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                                <div className="scard" style={{ padding: '12px 14px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>Registered Users</span>
                                  <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', color: 'var(--text-1)' }}>
                                    {isAdminLoading ? <Loader size={12} /> : registeredCount}
                                  </h2>
                                </div>
                                <div className="scard" style={{ padding: '12px 14px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>Unregistered Users</span>
                                  <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', color: 'var(--text-2)' }}>
                                    {isAdminLoading ? <Loader size={12} /> : unregisteredCount}
                                  </h2>
                                </div>
                                <div className="scard" style={{ padding: '12px 14px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>Active (MAU)</span>
                                  <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', color: 'var(--green)' }}>
                                    {isAdminLoading ? <Loader size={12} /> : mauCount}
                                  </h2>
                                  {totalCount > 0 && (
                                    <span style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '2px' }}>
                                      {Math.round((mauCount / totalCount) * 100)}% of total
                                    </span>
                                  )}
                                </div>
                                <div className="scard" style={{ padding: '12px 14px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px', border: pendingRequestsCount > 0 ? '1px solid var(--amber)' : '1px solid var(--border)' }}>
                                  <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>Pending Requests</span>
                                  <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0', color: pendingRequestsCount > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
                                    {isAdminLoading ? <Loader size={12} /> : pendingRequestsCount}
                                  </h2>
                                  {monthlyRequestsCount > 0 && (
                                    <span style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '2px' }}>
                                      +{monthlyRequestsCount} in 30d
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Grid containing trends and referrals */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                                {/* Registration Trends (Last 6 Months) */}
                                <div className="scard" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                                    Registration Trend (Last 6 Months)
                                  </h4>
                                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '110px', paddingTop: '10px', position: 'relative' }}>
                                    {registrationTrend.map((t, idx) => {
                                      const barHeight = (t.count / maxTrendCount) * 80; // scale to max 80%
                                      return (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '6px' }}>
                                          <span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-2)' }}>
                                            {t.count > 0 ? t.count : ''}
                                          </span>
                                          <div
                                            style={{
                                              width: '24px',
                                              height: `${Math.max(barHeight, 2)}px`,
                                              background: 'linear-gradient(180deg, var(--primary) 0%, var(--primary-hi) 100%)',
                                              borderRadius: '4px 4px 0 0',
                                              transition: 'height 0.3s ease',
                                              minHeight: '2px'
                                            }}
                                          />
                                          <span style={{ fontSize: '9px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                                            {t.label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Referral Keywords Distribution */}
                                <div className="scard" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                                    Referral Channels (`heard_from`)
                                  </h4>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '110px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {referralStats.length === 0 ? (
                                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-3)', fontSize: '12px' }}>No registration metadata.</div>
                                    ) : (
                                      referralStats.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '600' }}>
                                            <span style={{ color: 'var(--text-2)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                                              {item.source}
                                            </span>
                                            <span style={{ color: 'var(--text-3)' }}>
                                              {item.count} ({item.percentage}%)
                                            </span>
                                          </div>
                                          <div style={{ background: 'var(--surface-2)', height: '5px', borderRadius: '3px', overflow: 'hidden', width: '100%' }}>
                                            <div
                                              style={{
                                                background: idx % 2 === 0 ? 'var(--blue)' : 'var(--primary)',
                                                width: `${item.percentage}%`,
                                                height: '100%',
                                                borderRadius: '3px',
                                                transition: 'width 0.3s ease'
                                              }}
                                            />
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Search & Actions Header */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                                    Users List & Access Controls
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

                                {/* Modern Search box */}
                                <div style={{ position: 'relative', width: '100%' }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '0 12px',
                                    height: '38px',
                                    background: 'var(--surface-2)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    color: 'var(--text-2)',
                                    transition: 'all 0.2s'
                                  }}>
                                    <span style={{ fontSize: '14px' }}>🔍</span>
                                    <input
                                      type="text"
                                      placeholder="Search standard, pending, or pro users (Name, Email, Device ID)..."
                                      value={adminSearchQuery}
                                      onChange={e => setAdminSearchQuery(e.target.value)}
                                      style={{
                                        flex: 1,
                                        background: 'none',
                                        border: 'none',
                                        outline: 'none',
                                        color: 'var(--text-1)',
                                        fontSize: '13px'
                                      }}
                                    />
                                    {adminSearchQuery && (
                                      <button
                                        onClick={() => setAdminSearchQuery('')}
                                        style={{
                                          fontSize: '13px',
                                          color: 'var(--text-3)',
                                          cursor: 'pointer',
                                          padding: '4px'
                                        }}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Categorized Listings */}
                              {renderUserSection("Pending Requests", pendingRequests.length, pendingRequests, "PENDING", "No pending requests.")}
                              {renderUserSection("Free Users (Unregistered)", freeUsers.length, freeUsers, "FREE", "No unregistered devices.")}
                              {renderUserSection("Standard Users (Registered)", standardUsersOnly.length, standardUsersOnly, "STANDARD", "No registered standard users.")}
                              {renderUserSection("Bronze Plan Users", bronzeUsers.length, bronzeUsers, "BRONZE", "No users on Bronze plan.")}
                              {renderUserSection("Silver Plan Users", silverUsers.length, silverUsers, "SILVER", "No users on Silver plan.")}
                              {renderUserSection("Gold Plan Users", goldUsers.length, goldUsers, "GOLD", "No users on Gold plan.")}
                              {renderUserSection("Platinum Plan Users", platinumUsers.length, platinumUsers, "PLATINUM", "No users on Platinum plan.")}
                              {renderUserSection("Diamond Plan Users", diamondUsers.length, diamondUsers, "DIAMOND", "No users on Diamond plan.")}
                            </>
                          );
                        })()}
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
                          label={userToken ? "Account & Security" : "User Profile"}
                          description={userToken ? `Logged in as ${userEmail}` : (userName ? "View profile details" : "Register or Log in to sync details")}
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
                        <SettingsItem icon={FiMail} label={t('contact_developer')} description="Report bugs or suggest features" onClick={() => window.location.href = "mailto:mail.developer.akbar@gmail.com?subject=AP Vidyuth App Feedback"} color="var(--primary)" />
                        <SettingsItem icon={FiShield} label="Privacy Policy" description="How we handle your data" onClick={() => setActivePage('privacy')} color="var(--text-2)" />
                      </div>
                    </div>
                  </div>
                  <footer 
                    className="dev-footer" 
                    style={{ marginTop: '20px', paddingBottom: '32px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => {
                      devClickCountRef.current += 1;
                      if (devClickCountRef.current >= 7) {
                        devClickCountRef.current = 0;
                        setActivePage('admin');
                        toast.success('Entering Administration Portal...');
                      } else if (devClickCountRef.current >= 3) {
                        toast.info(`Tap ${7 - devClickCountRef.current} more times for Admin access`, { id: 'dev-toast' });
                      }
                    }}
                  >
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
          onSkip={() => {
            localStorage.setItem('profile_prompt_shown', 'true');
            setProfileModalOpen(false);
          }}
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

export function ProfileRegistrationModal({ open, onClose, defaultTab = 'login', onSkip }) {
  const [tab, setTab] = useState(defaultTab); // 'login' | 'register' | 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [heardFrom, setHeardFrom] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleEsc);
      setError('');
      setForgotSuccess('');
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { loginUser } = await import('../features/electricity/api/servicesApi.js');
      const res = await loginUser(email.trim(), password);

      localStorage.setItem('ap_vidyuth_token', res.token);
      localStorage.setItem('user_name', res.user.name);
      localStorage.setItem('user_email', res.user.email);
      if (res.user.heardFrom) localStorage.setItem('user_heard_from', res.user.heardFrom);
      localStorage.setItem('profile_prompt_shown', 'true');

      // Dispatch event to notify parent state
      window.dispatchEvent(new CustomEvent('auth-success', { detail: res }));
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email, and password are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { registerUser } = await import('../features/electricity/api/servicesApi.js');
      const res = await registerUser(name.trim(), email.trim(), password, heardFrom || null);

      localStorage.setItem('ap_vidyuth_token', res.token);
      localStorage.setItem('user_name', res.user.name);
      localStorage.setItem('user_email', res.user.email);
      if (res.user.heardFrom) localStorage.setItem('user_heard_from', res.user.heardFrom);
      localStorage.setItem('profile_prompt_shown', 'true');

      window.dispatchEvent(new CustomEvent('auth-success', { detail: res }));
      onClose();
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { forgotPassword } = await import('../features/electricity/api/servicesApi.js');
      const res = await forgotPassword(email.trim());
      setForgotSuccess(res.message || 'If registered, we have sent a reset password link.');
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 11000 }}>
      <div className="dialog" role="dialog" style={{ width: '420px', maxWidth: '90vw', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        {/* Tabs Header */}
        {tab !== 'forgot' && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '4px' }}>
            <button
              onClick={() => { setTab('login'); setError(''); }}
              style={{
                flex: 1, padding: '14px', background: 'none', border: 'none',
                color: tab === 'login' ? 'var(--primary)' : 'var(--text-3)',
                fontWeight: '600', fontSize: '14px', cursor: 'pointer',
                borderBottom: tab === 'login' ? '2px solid var(--primary)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('register'); setError(''); }}
              style={{
                flex: 1, padding: '14px', background: 'none', border: 'none',
                color: tab === 'register' ? 'var(--primary)' : 'var(--text-3)',
                fontWeight: '600', fontSize: '14px', cursor: 'pointer',
                borderBottom: tab === 'register' ? '2px solid var(--primary)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        <div className="dialog__header" style={{ padding: '24px 24px 12px' }}>
          {tab === 'forgot' && (
            <h2 className="dialog__title" style={{ fontSize: '18px', fontWeight: '700' }}>Reset Password</h2>
          )}
          <p style={{ color: 'var(--text-2)', fontSize: '12px', lineHeight: '1.5', margin: '4px 0 0' }}>
            {tab === 'login' && 'Sign in to access your services and sync reading data across devices.'}
            {tab === 'register' && 'Create an account to store and automatically backup your bills.'}
            {tab === 'forgot' && 'Enter your email address to receive a secure password reset link.'}
          </p>
        </div>

        {error && (
          <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{error}</span>
          </div>
        )}

        {forgotSuccess && (
          <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', color: 'var(--green, #22c55e)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{forgotSuccess}</span>
          </div>
        )}

        <div className="dialog__body" style={{ padding: '0 24px' }}>
          {tab === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)' }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <FiMail style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-3)' }} size={16} />
                  <input className="field__input" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ paddingLeft: '36px' }} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0 }}>Password</label>
                  <button type="button" onClick={() => { setTab('forgot'); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}>Forgot Password?</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <FiLock style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-3)' }} size={16} />
                  <input className="field__input" type={showPassword ? "text" : "password"} placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingLeft: '36px', paddingRight: '36px' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '12px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', marginBottom: '16px' }}>
                <button type="button" className="btn btn--ghost" style={{ flex: 1 }} onClick={onSkip || (() => { localStorage.setItem('profile_prompt_shown', 'true'); onClose(); })}>Skip</button>
                <button type="submit" className="btn btn--primary" style={{ flex: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center' }} disabled={loading}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </button>
              </div>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister}>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <FiUser style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-3)' }} size={16} />
                  <input className="field__input" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} style={{ paddingLeft: '36px' }} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)' }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <FiMail style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-3)' }} size={16} />
                  <input className="field__input" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ paddingLeft: '36px' }} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)' }}>Password (Min. 6 chars)</label>
                <div style={{ position: 'relative' }}>
                  <FiLock style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-3)' }} size={16} />
                  <input className="field__input" type={showPassword ? "text" : "password"} placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingLeft: '36px', paddingRight: '36px' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '12px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)' }}>How did you hear about us? (Optional)</label>
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
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', marginBottom: '16px' }}>
                <button type="button" className="btn btn--ghost" style={{ flex: 1 }} onClick={onSkip || (() => { localStorage.setItem('profile_prompt_shown', 'true'); onClose(); })}>Skip</button>
                <button type="submit" className="btn btn--primary" style={{ flex: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center' }} disabled={loading}>
                  {loading ? 'Creating...' : 'Register'}
                </button>
              </div>
            </form>
          )}

          {tab === 'forgot' && (
            <form onSubmit={handleForgot}>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field__label" style={{ fontSize: '11px', color: 'var(--text-3)' }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <FiMail style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-3)' }} size={16} />
                  <input className="field__input" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ paddingLeft: '36px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', marginBottom: '16px', gap: '12px' }}>
                <button type="button" className="btn btn--ghost" style={{ flex: 1 }} onClick={() => { setTab('login'); setError(''); setForgotSuccess(''); }}>Back to Sign In</button>
                <button type="submit" className="btn btn--primary" style={{ flex: 1.5 }} disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          )}
        </div>
        <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '12px' }}>
          <p style={{ fontSize: '10px', color: 'var(--text-3)', lineHeight: '1.4', margin: 0, textAlign: 'center' }}>
            Privacy Guarantee: We secure your data and credentials with top-tier hashing. We never sell or share profile details.
          </p>
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
