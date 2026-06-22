import { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { FiRefreshCw, FiZap, FiArrowDown, FiTrash2, FiCheckSquare, FiSquare, FiCopy, FiSettings, FiDownload, FiUpload, FiClock, FiEye, FiLayout, FiBell, FiShare2, FiFileText } from 'react-icons/fi';
import { ServiceCard } from './components/ServiceCard.jsx';
import { ServiceDialog } from './components/ServiceDialog.jsx';
import { ServiceAboutDialog } from './components/ServiceAboutDialog.jsx';
import { QRCodeDialog } from './components/QRCodeDialog.jsx';

// ── Lazy Loaded Components ──────────────────────────────────────────────────
const BillCalculator = lazy(() => import('./components/BillCalculator.jsx').then(m => ({ default: m.BillCalculator })));
import { SummaryBar } from './components/SummaryBar.jsx';
import { DailyTip } from './components/DailyTip.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { TrashView } from './components/TrashView.jsx';
import { filterServices } from './utils/filters.js';
import { 
  formatInr, 
  generateShareTable, 
  formatIndianCurrency, 
  formatShareDate, 
  generatePlainShareTable,
  SERVICE_CAP
} from '../../shared/utils/index.js';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog.jsx';
import { Loader } from '../../shared/components/Loader.jsx';
import { useTranslation } from 'react-i18next';
import { usePostHog } from '@posthog/react';
import { HelpFooter } from './components/CalculationSettings.jsx';
import { ServiceCapModal, MandatoryCleanupModal, ServiceSelectionModal } from './components/ServiceCapModals.jsx';

import { NotificationInbox, saveNotificationToHistory } from './components/NotificationInbox.jsx';
import { db } from '../../shared/db/storage.js';
import { importBackupData, parseBackupFile } from '../../shared/utils/backupRestore.js';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';

import { useNetwork } from '../../shared/hooks/useNetwork.js';
import { Virtuoso } from 'react-virtuoso';

export function ElectricityDashboard({ onOpenCalcSettings, electricityContext, profileModalOpen }) {
  const isWeb = Capacitor.getPlatform() === 'web';
  const { t } = useTranslation();
  const { isOffline } = useNetwork({
    onReconnect: () => toast.success(t('back_online'), { duration: 2000 })
  });
  const { services, trash, loading, refreshingIds, actions, isPro, serviceLimit = 4 } = electricityContext;
  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [cardStyle, setCardStyle] = useState(localStorage.getItem('appearance_card_style') || 'classic'); 
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const fileInputRef = useRef(null);

  const [inboxOpen, setInboxOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pendingDeepLink = useRef(null);
  const hasHiddenSplash = useRef(false);

  const [aboutDialog, setAboutDialog] = useState({ open: false, service: null });
  const [calculator, setCalculator] = useState({ open: false, service: null });
  const [qrDialog, setQrDialog] = useState({ open: false, service: null });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [flashingId, setFlashingId] = useState(null);
  const ph = usePostHog();

  const [bulkResult, setBulkResult] = useState(null);
  const [autoBackupPrompt, setAutoBackupPrompt] = useState(false);
  const [notificationPrompt, setNotificationPrompt] = useState(false);

  const [capModalOpen, setCapModalOpen] = useState(false);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [selectionModal, setSelectionModal] = useState({ open: false, entries: [], meta: null, type: 'restore' });

  // ── Core Internal Functions ───────────────────────────────────────────────
  
  const updateUnread = async () => {
    const history = await db.getSetting('notification_history') || [];
    const count = history.filter(n => !n.read).length;
    setUnreadCount(count);
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { Badge } = await import('@capawesome/capacitor-badge');
        if (count > 0) await Badge.set({ count });
        else await Badge.clear();
      } catch (e) { console.warn('[badge] Sync failed', e); }
    }
  };

  const trackBill = async (service, snapshot) => {
    if (!ph || !snapshot || !snapshot.billDate) return;
    if (service.lastReportedBillDate !== snapshot.billDate) {
      ph.capture('bill_refreshed', { id: service.id, circle: snapshot.circleName || service.circleName, amount: Number(snapshot.amountDue || 0), bill_date: snapshot.billDate });
      await actions.update(service.id, { lastReportedBillDate: snapshot.billDate });
    }
  };

  const flashCard = (id) => {
    setFlashingId(id);
    setTimeout(() => {
      const el = document.getElementById(`service-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    setTimeout(() => setFlashingId(null), 4000);
  };

  const handlePay = (service) => {
    setConfirmState({
      open: true,
      title: 'Redirecting to BillDesk',
      description: 'You will be redirected to the APSPDCL official website to pay your bill.',
      isDanger: false,
      onConfirm: async () => {
        try { await navigator.clipboard.writeText(service.serviceNumber); toast.success('Copied'); } catch {}
        window.open('https://payments.billdesk.com/MercOnline/SPDCLController', '_blank', 'noopener,noreferrer');
      }
    });
  };

  const handleRefreshAll = async (options = { skipApi: false, quiet: false, automated: false }) => {
    const currentServices = await actions.reload();
    if (!currentServices.length) return;

    if (options.automated) {
      const lastRefreshStr = await db.getSetting('last_auto_refresh_date');
      const todayStr = new Date().toISOString().slice(0, 10);
      if (lastRefreshStr === todayStr) return;
      await db.setSetting('last_auto_refresh_date', todayStr);
    }
    
    if (options.skipApi) return;
    
    setRefreshingAll(true);
    const total = currentServices.length;
    let done = 0;
    let failed = 0;

    window.dispatchEvent(new CustomEvent('global-progress', { detail: `Refreshing ${total} services...` }));

    try {
      for (const s of currentServices) {
        try { await actions.refresh(s.id); } 
        catch (e) { failed++; console.warn(`[refresh-all] Failed for ${s.serviceNumber}`, e); }
        done++;
        window.dispatchEvent(new CustomEvent('global-progress', { detail: `Refreshing ${done}/${total} services...` }));
      }
      if (!options.quiet) {
        failed === 0 ? toast.success(`All refreshed`) : toast.error(`Refresh failed for ${failed} service(s)`);
      }
    } finally {
      setRefreshingAll(false);
      window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
    }
  };

  const processDeepLink = async (sn) => {
    if (!sn || loading) return false;
    const svc = services.find(s => s.serviceNumber === sn);
    if (svc) {
      setInboxOpen(false); setDialog({ open: false, service: null }); setAboutDialog({ open: false, service: null });
      flashCard(svc.id);
      if (window.history.replaceState) window.history.replaceState({}, '', '/');
      return true;
    } else {
      if (services.length >= serviceLimit) {
        setCapModalOpen(true);
        if (window.history.replaceState) window.history.replaceState({}, '', '/');
        return false;
      }
      setDialog({ open: true, service: null, initialServiceNumber: sn });
      if (window.history.replaceState) window.history.replaceState({}, '', '/');
      return true;
    }
  };

  const checkBootAction = async () => {
    const path = window.location.pathname;
    if (path.length > 1 && path !== '/privacy') {
      if (path === '/action/pay' || path.includes('action/pay')) {
        const pinnedDue = services.find(s => s.pinned && s.lastStatus === 'DUE' && s.lastAmountDue > 0);
        const firstDue = services.find(s => s.lastStatus === 'DUE' && s.lastAmountDue > 0);
        const target = pinnedDue || firstDue;
        if (target) { handlePay(target); if (window.history.replaceState) window.history.replaceState({}, '', '/'); }
        return;
      }
      if (path === '/action/refresh' || path.includes('action/refresh')) {
        handleRefreshAll();
        if (window.history.replaceState) window.history.replaceState({}, '', '/');
        return;
      }
      if (path === '/action/add' || path.includes('action/add')) {
        setDialog({ open: true, service: null });
        if (window.history.replaceState) window.history.replaceState({}, '', '/');
        return;
      }
      const snFromPath = path.substring(1).replace(/[^0-9]/g, '');
      if (snFromPath.length >= 13) pendingDeepLink.current = snFromPath;
    }
    const pending = await db.getSetting('pending_notification_action');
    if (pending && pending.serviceNumber) {
      if (Date.now() - pending.timestamp < 300000) {
        const success = await processDeepLink(pending.serviceNumber);
        if (success) { await db.setSetting('pending_notification_action', null); pendingDeepLink.current = null; }
        else pendingDeepLink.current = pending.serviceNumber;
      } else await db.setSetting('pending_notification_action', null);
    } else if (pendingDeepLink.current) processDeepLink(pendingDeepLink.current);
  };

  const handleNotif = (e) => {
    updateUnread();
    const sn = e.detail?.serviceNumber;
    if (sn) {
      const svc = services.find(s => s.serviceNumber === sn);
      if (svc) actions.refresh(svc.id).catch(() => {});
    }
  };

  const handleDeepLinkSignal = (e) => {
    const sn = e.detail?.serviceNumber;
    if (sn) processDeepLink(sn).then(success => { if (!success) pendingDeepLink.current = sn; });
  };

  const handleHttpsDeepLink = (e) => {
    const sn = e.detail?.serviceNumber;
    if (!sn) return;
    if (!loading) processDeepLink(sn); else pendingDeepLink.current = sn;
  };

  const handleShortcutPay = () => {
    const pinnedDue = services.find(s => s.pinned && s.lastStatus === 'DUE' && s.lastAmountDue > 0);
    const firstDue  = services.find(s => s.lastStatus === 'DUE' && s.lastAmountDue > 0);
    const target = pinnedDue || firstDue;
    if (target) handlePay(target);
  };

  const selfHealNotifications = async () => {
    if (loading || services.length === 0) return;
    const history = await db.getSetting('notification_history') || [];
    const processed = await db.getSetting('processed_notifications') || {}; 
    let historyUpdated = false;
    let processedUpdated = false;

    for (const svc of services) {
      if (!svc.isPaid && svc.lastAmountDue > 0) {
        const dueDate = svc.lastDueDate ? new Date(svc.lastDueDate) : null;
        if (!dueDate) continue;
        const now = new Date();
        const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        if (diffDays <= 4) {
          const type = diffDays < 0 ? 'BILL_OVERDUE' : 'BILL_REMINDER';
          const currentKey = `${svc.lastAmountDue}_${type}`;
          if (processed[svc.serviceNumber] !== currentKey) {
            const inHistory = history.some(n => n.serviceNumber === svc.serviceNumber && n.body.includes(svc.lastAmountDue.toString()) && n.type === type);
            if (!inHistory) {
              const title = diffDays < 0 ? 'Bill Overdue' : 'Bill Due Soon';
              const body = diffDays < 0 ? `Your bill of ₹${svc.lastAmountDue} for ${svc.serviceNumber} is overdue!` : `Your bill of ₹${svc.lastAmountDue} for ${svc.serviceNumber} is due in ${diffDays} days.`;
              await saveNotificationToHistory({ title, body, serviceNumber: svc.serviceNumber, type, read: false });
              processed[svc.serviceNumber] = currentKey; historyUpdated = true; processedUpdated = true;
            } else { processed[svc.serviceNumber] = currentKey; processedUpdated = true; }
          }
        }
      }
    }
    if (processedUpdated) await db.setSetting('processed_notifications', processed);
    if (historyUpdated) updateUnread();
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && !hasHiddenSplash.current) {
      hasHiddenSplash.current = true;
      if (Capacitor.isNativePlatform()) SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
    }
  }, [loading]);

  useEffect(() => {
    const mainContainer = document.querySelector('.main');
    if (!mainContainer) return;
    const handleScroll = () => {
      if (mainContainer.scrollTop > 50) mainContainer.classList.add('page--scrolled');
      else mainContainer.classList.remove('page--scrolled');
    };
    mainContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainContainer.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    updateUnread();
    const appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) { updateUnread(); selfHealNotifications(); } });
    window.addEventListener('notification-received', handleNotif);
    window.addEventListener('notification-deep-link', handleDeepLinkSignal);
    window.addEventListener('deep-link-service', handleHttpsDeepLink);
    window.addEventListener('shortcut-pay-home', handleShortcutPay);
    return () => {
      appStateListener.then(h => h.remove());
      window.removeEventListener('notification-received', handleNotif);
      window.removeEventListener('notification-deep-link', handleDeepLinkSignal);
      window.removeEventListener('deep-link-service', handleHttpsDeepLink);
      window.removeEventListener('shortcut-pay-home', handleShortcutPay);
    };
  }, [loading]); 

  useEffect(() => {
    const init = async () => {
      await handleRefreshAll({ automated: true, quiet: true });
      if (pendingDeepLink.current) { processDeepLink(pendingDeepLink.current); pendingDeepLink.current = null; }
      checkBootAction();
      if (services.length > 0) selfHealNotifications();
    };
    if (!loading) init();
  }, [loading]);

  useEffect(() => {
    const isProfilePending = typeof window !== 'undefined' && 
                             !localStorage.getItem('profile_prompt_shown') && 
                             (!localStorage.getItem('user_name') || !localStorage.getItem('user_email'));
                             
    if (!loading && services.length > serviceLimit && !profileModalOpen && !isProfilePending) {
      setCleanupModalOpen(true);
    }
  }, [loading, services.length, serviceLimit, profileModalOpen]);

  useEffect(() => { if (!isWeb) updateUnread(); }, [inboxOpen]);

  // ── Interaction Handlers ──────────────────────────────────────────────────

  const handleNotificationAction = (notification) => {
    setInboxOpen(false);
    if (notification.serviceNumber) {
      const svc = services.find(s => s.serviceNumber === notification.serviceNumber);
      if (svc) {
        flashCard(svc.id);
        if (notification.type === 'BILL_OVERDUE' || notification.type === 'BILL_REMINDER') setQrDialog({ open: true, service: svc });
        else setAboutDialog({ open: true, service: svc });
      }
    }
  };

  const toggleCardStyle = () => {
    const nextStyle = cardStyle === 'classic' ? 'rich' : 'classic';
    setCardStyle(nextStyle);
    localStorage.setItem('appearance_card_style', nextStyle);
  };

  const handleViewChange = (view) => { setActiveView(view); clearSelection(); };

  const handleImportFromEmptyState = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { entries, meta } = await parseBackupFile(file);
      setSelectionModal({ open: true, entries, meta, type: 'restore' });
    } catch (err) {
      toast.error('Failed to read backup file');
    } finally {
      e.target.value = '';
    }
  };

  const executeBulkAdd = async (toAdd) => {
    if (ph) ph.capture('bulk_add_started', { count: toAdd.length });
    setIsProcessing(true);
    window.dispatchEvent(new CustomEvent('global-progress', { detail: `Validating ${toAdd.length} services...` }));
    const results = { succeeded: [], failed: [], alreadyExists: [], inTrash: [] };
    for (const entry of toAdd) {
      const sn = entry.number;
      const inActive = services.find(s => s.serviceNumber === sn);
      const inTrash = trash.find(t => t.serviceNumber === sn);
      if (inActive) { results.alreadyExists.push(sn); continue; }
      if (inTrash) { results.inTrash.push(sn); continue; }
      try {
        await actions.add({ isBulk: false, serviceNumber: sn, label: entry.label, pinned: !!entry.pinned });
        results.succeeded.push(sn);
        window.dispatchEvent(new CustomEvent('global-progress', { detail: `Added ${results.succeeded.length}/${toAdd.length}...` }));
      } catch (e) {
        if (e?.message === 'CANCELLED') { setIsProcessing(false); window.dispatchEvent(new CustomEvent('global-progress', { detail: null })); setBulkResult(results); return; }
        results.failed.push({ number: sn, error: e?.message || 'Unknown error' });
      }
    }
    setIsProcessing(false); window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
    setBulkResult(results); if (activeView !== 'active') setActiveView('active');
  };

  const executeImport = async (selectedEntries, meta) => {
    window.dispatchEvent(new CustomEvent('global-progress', { detail: 'Restoring Data...' }));
    try {
      await importBackupData(selectedEntries, meta, { ...electricityContext, isPro }, t, ph, () => {}, { 
        onProgress: (msg) => window.dispatchEvent(new CustomEvent('global-progress', { detail: msg })) 
      });
    } finally {
      window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
    }
  };

  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleSelect = (id) => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const visible = useMemo(() => filterServices(services, filters), [services, filters]);
  const currentItems = activeView === 'active' ? visible : trash;
  const allSelected = currentItems.length > 0 && selectedIds.size === currentItems.length;
  const toggleSelectAll = () => { if (allSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(currentItems.map(s => s.id))); };
  const clearSelection = () => setSelectedIds(new Set());

  const handleCopySelected = async () => {
    const selectedServices = currentItems.filter(s => selectedIds.has(s.id));
    if (selectedServices.length === 0) return;
    const text = selectedServices.map(s => { const name = s.label || s.customerName || t('untitled'); return `${name}:${s.serviceNumber}`; }).join(', ');
    try { await navigator.clipboard.writeText(text); toast.success(t('copied_count', `Copied ${selectedServices.length} services`)); } catch (e) { toast.error('Failed to copy'); }
  };

  const handleShareSelected = async () => {
    const selectedServices = currentItems.filter(s => selectedIds.has(s.id));
    if (selectedServices.length === 0) return;
    const monthYear = new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const items = [...selectedServices].sort((a, b) => (b.lastAmountDue || 0) - (a.lastAmountDue || 0)).map(s => ({ name: s.label || s.customerName || t('untitled'), amount: s.lastAmountDue || 0, units: s.lastBilledUnits || 0 }));
    const text = `⚡ *Electricity Bill — ${monthYear}*\n\n` + generatePlainShareTable(items) + `\n\n` + `https://ap-vidyuth.vercel.app\n` + `_Shared via AP Vidyuth_`;
    if (Capacitor.getPlatform() !== 'web') { try { await Share.share({ title: 'Electricity Bill Summary', text: text, dialogTitle: 'Share Summary' }); return; } catch (err) {} }
    if (navigator.share && navigator.canShare && navigator.canShare({ text })) { try { await navigator.share({ title: 'Electricity Bill Summary', text }); return; } catch (err) {} }
    try { await navigator.clipboard.writeText(text); toast.success('Summary copied!'); } catch { toast.error('Sharing failed'); }
  };

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') { if (inboxOpen) setInboxOpen(false); else if (selectedIds.size > 0) clearSelection(); else if (bulkResult) setBulkResult(null); } };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, bulkResult, inboxOpen]);

  useEffect(() => {
    const handleBack = (e) => {
      if (e.detail?.handled) return;
      if (dialog.open || aboutDialog.open || calculator.open || qrDialog.open || confirmState.open || bulkResult || inboxOpen) {
        setDialog({ open: false, service: null }); setAboutDialog({ open: false, service: null }); setCalculator({ open: false, service: null }); setQrDialog({ open: false, service: null }); setConfirmState(prev => ({ ...prev, open: false })); setBulkResult(null); setInboxOpen(false);
        if (e.detail) e.detail.handled = true; return;
      }
      if (selectedIds.size > 0) { clearSelection(); if (e.detail) e.detail.handled = true; return; }
      if (activeView === 'trash') { setActiveView('active'); if (e.detail) e.detail.handled = true; return; }
    };
    window.addEventListener('app-back-button', handleBack); return () => window.removeEventListener('app-back-button', handleBack);
  }, [selectedIds, dialog.open, aboutDialog.open, calculator.open, qrDialog.open, confirmState.open, bulkResult, inboxOpen]);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStart = useRef(0);
  const isPulling = useRef(false);
  const pullThreshold = 80;

  useEffect(() => {
    const container = document.querySelector('.main');
    if (!container) return;
    const handleTouchStart = (e) => { if (container.scrollTop <= 0) { touchStart.current = e.touches[0].pageY; isPulling.current = true; } else isPulling.current = false; };
    const handleTouchMove = (e) => { if (!isPulling.current || isRefreshing) return; const currentY = e.touches[0].pageY; const diff = currentY - touchStart.current; if (diff > 0) { const dist = Math.min(diff * 0.4, pullThreshold + 20); setPullDistance(dist); if (dist > 10 && e.cancelable) e.preventDefault(); } };
    const handleTouchEnd = async () => {
      if (!isPulling.current || isRefreshing) return;
      const finalDist = pullDistance;
      isPulling.current = false;
      if (finalDist >= pullThreshold) {
        setPullDistance(70);
        setIsRefreshing(true);
        try {
          await actions.reload();
        } catch (e) {}
        finally {
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 500);
        }
      } else setPullDistance(0);
    };
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    return () => { container.removeEventListener('touchstart', handleTouchStart); container.removeEventListener('touchmove', handleTouchMove); container.removeEventListener('touchend', handleTouchEnd); };
  }, [pullDistance, isRefreshing, actions]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  useEffect(() => { const handleResize = () => setIsMobile(window.innerWidth <= 700); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
  const useAccordion = isMobile ? visible.length > 1 : visible.length > 3;

  async function submitService(payload) {
    if (payload.isBulk) {
      const { entries } = payload;
      if (isPro) {
        executeBulkAdd(entries);
        return;
      }
      const totalAfter = services.length + entries.length;
      
      if (totalAfter > serviceLimit) {
        setSelectionModal({ open: true, entries, type: 'bulk' });
        return;
      }
      
      executeBulkAdd(entries);
      return;
    }
    if (dialog.service) {
      setIsProcessing(true); window.dispatchEvent(new CustomEvent('global-progress', { detail: t('saving', 'Saving...') }));
      try { await actions.update(dialog.service.id, { label: payload.label }); toast.success('Updated'); } catch(e) { toast.error(`Update failed: ${e?.message || 'Unknown error'}`); }
      finally { setIsProcessing(false); window.dispatchEvent(new CustomEvent('global-progress', { detail: null })); }
    } else {
      if (services.length >= serviceLimit) {
        setCapModalOpen(true);
        return;
      }
      const inTrash = trash.find(t => t.serviceNumber === payload.serviceNumber);
      if (inTrash) {
        setConfirmState({ open: true, title: 'Restore from Trash?', description: 'This service is currently in the Trash.\n\nWould you like to restore it instead of adding a new one?', isDanger: false,
          onConfirm: async () => {
            setIsProcessing(true); window.dispatchEvent(new CustomEvent('global-progress', { detail: t('saving', 'Restoring...') }));
            try { await actions.restore(inTrash.id); toast.success('Restored'); setDialog({ open: false, service: null }); handleViewChange('active'); flashCard(inTrash.id); }
            catch(e) { toast.error(`Restore failed: ${e?.message || 'Unknown error'}`); }
            finally { setIsProcessing(false); window.dispatchEvent(new CustomEvent('global-progress', { detail: null })); }
          }
        }); return;
      }
      const inActive = services.find(s => s.serviceNumber === payload.serviceNumber);
      if (inActive) { toast.error('Service number already exists.'); return; }
      setIsProcessing(true); window.dispatchEvent(new CustomEvent('global-progress', { detail: 'Validating and fetching bill...' }));
      try { const newService = await actions.add(payload); toast.success('Service added'); setDialog({ open: false, service: null }); handleViewChange('active'); if (newService?.id) flashCard(newService.id); }
      catch (e) { if (e?.message !== 'CANCELLED') toast.error(`Add failed: ${e?.message || 'Unknown error'}`); throw e; }
      finally { setIsProcessing(false); window.dispatchEvent(new CustomEvent('global-progress', { detail: null })); }
    }
  }

  const handleBulkAction = async (action) => {
    const ids = Array.from(selectedIds); if (ids.length === 0) return;
    const actionText = action === 'trash' ? 'move to trash' : action === 'restore' ? 'restore' : 'permanently delete';
    const isDanger = action === 'trash' || action === 'purge';

    if (action === 'restore' && (services.length + ids.length) > serviceLimit) {
      setCapModalOpen(true);
      return;
    }

    setConfirmState({ open: true, title: `${action.charAt(0).toUpperCase() + action.slice(1)} ${ids.length} services?`, description: `Are you sure you want to ${actionText} the selected services?`, isDanger,
      onConfirm: async () => {
        const tst = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing...`);
        try {
          if (action === 'trash') await actions.bulkRemove(ids); else if (action === 'restore') await actions.bulkRestore(ids); else if (action === 'purge') await actions.bulkPurge(ids);
          toast.success(`Action completed`, { id: tst }); clearSelection(); if (action === 'restore' && activeView !== 'active') setActiveView('active');
        } catch (e) { toast.error(`Action failed`, { id: tst }); }
      }
    });
  };

  const handleCalculateBill = (service) => {
    setCalculator({ open: true, service });
  };

  const handleShare = async (service) => {
    const isPaid = service.isPaid; const name = service.customerName || service.label || 'Consumer'; const sn = service.serviceNumber; const amount = isPaid ? (service.paidAmount || service.lastAmountDue || 0) : service.lastAmountDue; const date = isPaid ? service.paidDate : service.lastDueDate; const url = `https://ap-vidyuth.vercel.app/${sn}`;
    let text = isPaid ? `⚡ *Electricity Bill — Payment Receipt*\n\n*Service:* ${name}\n*SC No:* ${sn}\n*Amount Paid:* ${formatIndianCurrency(amount)}\n*Paid On:* ${formatShareDate(date)}\n*Status:* ✅ Successfully Paid\n\n${url}\n_Shared via AP Vidyuth_` : `⚡ *Electricity Bill — Amount Due*\n\n*Service:* ${name}\n*SC No:* ${sn}\n*Amount Due:* ${formatIndianCurrency(amount)}\n*Due Date:* ${formatShareDate(date)}\n*Status:* ⏳ Payment Pending\n\nLate payment may attract additional charges.\n\n${url}\n_Shared via AP Vidyuth_`;
    if (Capacitor.getPlatform() !== 'web') { try { await Share.share({ title: 'Electricity Bill Status', text, dialogTitle: 'Share Bill Update' }); return; } catch (err) {} }
    if (navigator.share && navigator.canShare && navigator.canShare({ text })) { try { await navigator.share({ title: 'Electricity Bill Status', text }); return; } catch (err) {} }
    try { await navigator.clipboard.writeText(text); toast.success('Copied to clipboard. You can now paste and share.'); } catch { toast.error('Sharing failed'); }
  };

  const handleShareMonthlyReport = async (service) => {
    const insights = service.insights; if (!insights) { toast.error('Not enough data to generate report yet'); return; }
    const name = service.customerName || service.label || 'Consumer'; const sn = service.serviceNumber; const trend = insights.vsLastMonth; const trendText = trend ? `${trend.unitsPct > 0 ? '📈 +' : '📉 '}${Math.round(Math.abs(trend.unitsPct))}% vs last month` : ''; const url = `https://ap-vidyuth.vercel.app/${sn}`; const monthYear = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    let text = `📊 *Electricity Usage — ${monthYear}*\n\n*Service:* ${name} (${sn})\n*Units Used:* ${service.lastBilledUnits || 0} units  ${trendText}\n*Amount:* ${formatIndianCurrency(service.lastAmountDue || service.billAmount)}\n\n*Insights:*\n- Avg monthly spend: ${formatIndianCurrency(insights.avgAmount)}\n- Highest on record: ${formatIndianCurrency(insights.maxAmount)}\n- Cost per unit: ₹${Number(insights.avgCostPerUnit || 0).toFixed(2)}\n`;
    if (insights.predictedNextBill) text += `\n*Next bill estimate:* ~${formatIndianCurrency(insights.predictedNextBill)}\n`;
    text += `\n${url}\n_Shared via AP Vidyuth_`;
    if (Capacitor.getPlatform() !== 'web') { try { await Share.share({ title: 'Monthly Electricity Report', text, dialogTitle: 'Share Report' }); return; } catch (err) {} }
    if (navigator.share && navigator.canShare && navigator.canShare({ text })) { try { await navigator.share({ title: 'Monthly Electricity Report', text }); return; } catch (err) {} }
    try { await navigator.clipboard.writeText(text); toast.success('Report copied to clipboard. You can now paste and share.'); } catch { toast.error('Copy failed'); }
  };

  const refreshingAny = refreshingAll || isProcessing || refreshingIds.size > 0;

  return (
    <div className="page">
      <div className={`ptr ${pullDistance > 0 || isRefreshing ? 'ptr--visible' : ''} ${isRefreshing ? 'ptr--refreshing' : ''} ${pullDistance >= pullThreshold ? 'ptr--ready' : ''}`} style={{ transform: `translateY(${pullDistance - 70}px)` }}>
        <div className="ptr__icon" style={{ transform: `rotate(${pullDistance * 3}deg)` }}><Loader size={18} /></div>
        <span className="ptr__label">{isRefreshing ? 'Refreshing...' : (pullDistance >= pullThreshold ? 'Release to refresh' : 'Pull down to refresh')}</span>
      </div>

      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <div className="selection-bar__left">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span>{selectedIds.size} selected</span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Total: {formatInr(currentItems.filter(s => selectedIds.has(s.id)).reduce((acc, s) => acc + Number(s.lastAmountDue || 0), 0))}</span>
            </div>
          </div>
          <div className="selection-bar__actions">
            <button className="btn btn--ghost btn--sm" onClick={handleShareSelected} title="Share Selected"><FiShare2 size={16} />{!isMobile && <span style={{ marginLeft: '4px' }}>Share</span>}</button>
            <button className="btn btn--ghost btn--sm" onClick={handleCopySelected} title="Copy Selected"><FiCopy size={16} />{!isMobile && <span style={{ marginLeft: '4px' }}>Copy</span>}</button>
            {activeView === 'active' ? (
              <button className="btn btn--danger btn--sm" onClick={() => handleBulkAction('trash')}><FiTrash2 size={16} />{!isMobile && <span style={{ marginLeft: '4px' }}>Trash</span>}</button>
            ) : (
              <><button className="btn btn--ghost btn--sm" onClick={() => handleBulkAction('restore')}><FiRefreshCw size={16} />{!isMobile && <span style={{ marginLeft: '4px' }}>Restore</span>}</button><button className="btn btn--danger btn--sm" onClick={() => handleBulkAction('purge')}><FiTrash2 size={13} />{!isMobile && <span style={{ marginLeft: '4px' }}>Purge</span>}</button></>
            )}
            <button className="btn btn--ghost btn--sm" onClick={clearSelection} style={{ marginLeft: '4px' }}>Cancel</button>
          </div>
        </div>
      )}

      <header className="page__header page__header--sticky">
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="page__eyebrow"><FiZap size={12} /> APSPDCL</p>
            <div className="page__title-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="page__title" style={{ margin: 0 }}>AP Vidyuth</h1>
              {isPro && (
                <span style={{ background: 'var(--primary)', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: '900', letterSpacing: '0.5px' }}>PRO</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {!isWeb && (
              <div className="header-alert-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <button className="icon-btn" onClick={() => setInboxOpen(true)} title="Notifications" style={{ width: '40px', height: '40px', position: 'relative' }}>
                  <FiBell size={20} style={{ color: unreadCount > 0 ? 'var(--primary)' : 'var(--text-3)' }} />
                  {unreadCount > 0 && <span className="header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
                <span className="header-alert-label" style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase' }}>Alerts</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <SummaryBar services={services} />
      {activeView === 'active' && services.length > 0 && !loading && <DailyTip />}

      <Toolbar filters={filters} onFiltersChange={setFilters} onAdd={() => {
        if (services.length >= serviceLimit) setCapModalOpen(true);
        else setDialog({ open: true, service: null });
      }}
 onRefreshAll={() => handleRefreshAll()} refreshingAll={refreshingAny} activeView={activeView} onViewChange={handleViewChange} trashCount={trash.length} hasServices={services.length > 0 && !loading} services={services} cardStyle={cardStyle} onToggleCardStyle={toggleCardStyle} />

      <NotificationInbox open={inboxOpen} onClose={() => setInboxOpen(false)} onAction={handleNotificationAction} />
      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} isDanger={confirmState.isDanger} onClose={() => setConfirmState(prev => ({ ...prev, open: false }))} onConfirm={confirmState.onConfirm} />

      {activeView === 'active' && (
        <>{loading ? <div className="state-box"><Loader size={22} /><p>{t('loading_services')}</p></div> : visible.length === 0 ? <div className="state-box"><FiZap size={28} /><h3>{t('no_services_found')}</h3><p>{services.length === 0 ? t('add_first_service') : t('no_results_filter')}</p>{services.length === 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}><button className="btn btn--primary" onClick={() => setDialog({ open: true, service: null })}>{t('add_service')}</button><div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Have a backup file?</span><input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleImportFromEmptyState} /><button className="btn btn--ghost btn--sm" onClick={() => fileInputRef.current?.click()}><FiUpload size={14} /> Restore Data</button></div></div>}</div> : 
        visible.length > 50 ? (
          <Virtuoso useWindowScroll data={visible} itemContent={(index, s) => (
              <div style={{ paddingBottom: '16px' }}>
                <ServiceCard key={s.id} id={`service-${s.id}`} service={s} useAccordion={useAccordion} cardStyle={cardStyle} refreshing={refreshingIds.has(s.id)} isFlashing={flashingId === s.id} selected={selectedIds.has(s.id)} selecting={selectedIds.size > 0} onToggleSelect={toggleSelect} onRefresh={async () => { window.dispatchEvent(new CustomEvent('global-progress', { detail: 'Refreshing bill...' })); try { const updated = await actions.refresh(s.id); toast.success('Refreshed'); if (updated) await trackBill(s, updated); } catch (e) { if (e?.message !== 'CANCELLED') toast.error(`Refresh failed`); } finally { window.dispatchEvent(new CustomEvent('global-progress', { detail: null })); } }} onEdit={() => setDialog({ open: true, service: s })} onAbout={() => setAboutDialog({ open: true, service: s })} onDelete={() => { setConfirmState({ open: true, title: 'Move to Trash?', description: 'This service will be moved to the Trash.', isDanger: true, onConfirm: async () => { const tst = toast.loading('Moving to trash…'); try { await actions.remove(s.id); toast.success('Moved to trash', { id: tst }); clearSelection(); } catch (e) { toast.error(`Failed to move`, { id: tst }); } } }); }} onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })} onCalculateBill={(svc) => handleCalculateBill(svc)} onShowQR={(svc) => setQrDialog({ open: true, service: svc })} onPay={() => handlePay(s)} onShare={() => handleShare(s)} onShareReport={() => handleShareMonthlyReport(s)} />
              </div>
            )}
          />
        ) : (
          <div className="grid">
            {visible.map(s => (
              <ServiceCard key={s.id} id={`service-${s.id}`} service={s} useAccordion={useAccordion} cardStyle={cardStyle} refreshing={refreshingIds.has(s.id)} isFlashing={flashingId === s.id} selected={selectedIds.has(s.id)} selecting={selectedIds.size > 0} onToggleSelect={toggleSelect} onRefresh={async () => { window.dispatchEvent(new CustomEvent('global-progress', { detail: 'Refreshing bill...' })); try { const updated = await actions.refresh(s.id); toast.success('Refreshed'); if (updated) await trackBill(s, updated); } catch (e) { if (e?.message !== 'CANCELLED') toast.error(`Refresh failed`); } finally { window.dispatchEvent(new CustomEvent('global-progress', { detail: null })); } }} onEdit={() => setDialog({ open: true, service: s })} onAbout={() => setAboutDialog({ open: true, service: s })} onDelete={() => { setConfirmState({ open: true, title: 'Move to Trash?', description: 'This service will be moved to the Trash.', isDanger: true, onConfirm: async () => { const tst = toast.loading('Moving to trash…'); try { await actions.remove(s.id); toast.success('Moved to trash', { id: tst }); clearSelection(); } catch (e) { toast.error(`Failed to move`, { id: tst }); } } }); }} onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })} onCalculateBill={(svc) => handleCalculateBill(svc)} onShowQR={(svc) => setQrDialog({ open: true, service: svc })} onPay={() => handlePay(s)} onShare={() => handleShare(s)} onShareReport={() => handleShareMonthlyReport(s)} />
            ))}
          </div>
        )
        }</>
      )}

      {activeView === 'trash' && <TrashView services={trash} selectedIds={selectedIds} selecting={selectedIds.size > 0} onToggleSelect={toggleSelect} onRestore={id => { 
        if (services.length >= serviceLimit) {
          setCapModalOpen(true);
          return;
        }
        setConfirmState({ open: true, title: 'Restore service?', description: 'This service will be restored.', isDanger: false, onConfirm: async () => { const tst = toast.loading('Restoring…'); try { await actions.restore(id); toast.success('Restored', { id: tst }); clearSelection(); handleViewChange('active'); flashCard(id); } catch (e) { toast.error(`Restore failed`, { id: tst }); } } }); 
      }} onDeletePermanent={id => { setConfirmState({ open: true, title: 'Delete permanently?', description: 'This action cannot be undone.', isDanger: true, onConfirm: () => toast.promise(actions.purge(id), { loading: 'Deleting…', success: () => { clearSelection(); return 'Deleted permanently'; }, error: 'Delete failed' }) }); }} />}

      <ServiceDialog open={dialog.open} service={dialog.service} initialServiceNumber={dialog.initialServiceNumber} services={services} onClose={() => setDialog({ open: false, service: null })} onSubmit={submitService} />
      <ServiceAboutDialog open={aboutDialog.open} service={aboutDialog.service} onClose={() => setAboutDialog({ open: false, service: null })} />
      <Suspense fallback={null}>
        <BillCalculator open={calculator.open} service={calculator.service} onClose={() => setCalculator({ open: false, service: null })} />
      </Suspense>
      <QRCodeDialog open={qrDialog.open} service={qrDialog.service} onClose={() => setQrDialog({ open: false, service: null })} onSave={async (id, patch) => { await actions.update(id, patch); setQrDialog(prev => ({ ...prev, service: { ...prev.service, ...patch } })); }} />
      {bulkResult && createPortal(<div className="overlay overlay--center" onClick={() => setBulkResult(null)}><div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw' }}><h2 className="dialog__title">Bulk Add Results</h2><div className="dialog__body" style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: '12px' }}>{bulkResult.succeeded.length > 0 && (<div style={{ marginBottom: '12px' }}><p style={{ color: 'var(--green)', fontWeight: '700', fontSize: '13px' }}>✅ Added ({bulkResult.succeeded.length})</p><p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.succeeded.join(', ')}</p></div>)}{bulkResult.inTrash.length > 0 && (<div style={{ marginBottom: '12px' }}><p style={{ color: 'var(--amber)', fontWeight: '700', fontSize: '13px' }}>⚠️ Skipped ({bulkResult.inTrash.length})</p><p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.inTrash.join(', ')}</p></div>)}{bulkResult.alreadyExists.length > 0 && (<div style={{ marginBottom: '12px' }}><p style={{ color: 'var(--text-3)', fontWeight: '700', fontSize: '13px' }}>ℹ️ Already Active ({bulkResult.alreadyExists.length})</p></div>)}{bulkResult.failed.length > 0 && (<div style={{ marginBottom: '12px' }}><p style={{ color: 'var(--red)', fontWeight: '700', fontSize: '13px' }}>❌ Failed ({bulkResult.failed.length})</p>{bulkResult.failed.map((f, i) => (<p key={i} className="mono-sm" style={{ color: 'var(--text-2)' }}>{f.number}: {f.error}</p>))}</div>)}</div><div className="dialog__footer"><button className="btn btn--primary" onClick={() => setBulkResult(null)} style={{ width: '100%' }}>Got it</button></div></div></div>, document.body)}
      
      <ConfirmDialog open={autoBackupPrompt} title="Backup Recommended" description="You have saved a lot of services! We recommend taking a backup of your data so you don't lose it if you change devices. Would you like to go to Data Management now?" isDanger={false} confirmText="Go to Backup" cancelText="Not Now" onClose={() => { setAutoBackupPrompt(false); db.setSetting('auto_backup_prompt_snoozed_until', Date.now() + 7 * 24 * 60 * 60 * 1000); }} onConfirm={() => { setAutoBackupPrompt(false); db.setSetting('has_seen_auto_backup_prompt', true); window.dispatchEvent(new CustomEvent('app-navigate', { detail: { page: 'settings' } })); }} />
      <ConfirmDialog open={notificationPrompt} title="Get Bill Alerts" description="We'll notify you when a new bill is generated or if a due date is approaching. Turn on notifications?" isDanger={false} confirmText="Enable Alerts" cancelText="Maybe Later" onClose={() => { setNotificationPrompt(false); db.setSetting('has_seen_notification_prompt', true); }} onConfirm={() => { setNotificationPrompt(false); db.setSetting('has_seen_notification_prompt', true); import('./utils/notifications.js').then(m => m.setupPushNotifications(true)); }} />

      <ServiceCapModal open={capModalOpen} serviceCount={services.length} limit={serviceLimit} onClose={() => setCapModalOpen(false)} />
      {cleanupModalOpen && (
        <MandatoryCleanupModal 
          services={services} 
          limit={serviceLimit}
          onConfirm={async (keepIds, deleteIds) => {
            const tst = toast.loading('Cleaning up...');
            try {
              await actions.bulkRemove(deleteIds);
              setCleanupModalOpen(false);
              toast.success('Cleaned up!', { id: tst });
            } catch (e) {
              toast.error('Cleanup failed', { id: tst });
            }
          }} 
        />
      )}

      <ServiceSelectionModal 
        open={selectionModal.open}
        entries={selectionModal.entries}
        isPro={isPro}
        currentCount={services.length}
        limit={serviceLimit}
        title={selectionModal.type === 'bulk' ? 'Select Services to Add' : 'Select Services to Restore'}
        onClose={() => setSelectionModal({ open: false, entries: [], meta: null, type: 'restore' })}
        onConfirm={(selected) => {
          if (selectionModal.type === 'bulk') {
            executeBulkAdd(selected);
          } else {
            executeImport(selected, selectionModal.meta);
          }
        }}
      />
    </div>
  );
}
