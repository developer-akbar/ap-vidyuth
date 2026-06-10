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
import { formatInr, generateShareTable } from '../../shared/utils/index.js';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog.jsx';
import { Loader } from '../../shared/components/Loader.jsx';
import { useTranslation } from 'react-i18next';
import { usePostHog } from '@posthog/react';
import { HelpFooter } from './components/CalculationSettings.jsx';

import { NotificationInbox, saveNotificationToHistory } from './components/NotificationInbox.jsx';
import { db } from '../../shared/db/storage.js';
import { importBackupData } from '../../shared/utils/backupRestore.js';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';

import { useNetwork } from '../../shared/hooks/useNetwork.js';
import { Virtuoso } from 'react-virtuoso';

export function ElectricityDashboard({ onOpenCalcSettings, electricityContext }) {
  const isWeb = Capacitor.getPlatform() === 'web';
  const { isOffline } = useNetwork();
  const { services, trash, loading, refreshingIds, actions } = electricityContext;
  const [filters, setFilters] = useState({ query: '', status: '', sort: 'amount' });
  const [cardStyle, setCardStyle] = useState(localStorage.getItem('appearance_card_style') || 'classic'); 
  const [activeView, setActiveView] = useState('active');
  const [dialog, setDialog] = useState({ open: false, service: null });
  const fileInputRef = useRef(null);

  const [inboxOpen, setInboxOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pendingDeepLink = useRef(null);
  const hasHiddenSplash = useRef(false);

  useEffect(() => {
    if (!loading && !hasHiddenSplash.current) {
      hasHiddenSplash.current = true;
      if (Capacitor.isNativePlatform()) {
        SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
      }
    }
  }, [loading]);

  useEffect(() => {
    const mainContainer = document.querySelector('.main');
    if (!mainContainer) return;

    const handleScroll = () => {
      if (mainContainer.scrollTop > 50) {
        mainContainer.classList.add('page--scrolled');
      } else {
        mainContainer.classList.remove('page--scrolled');
      }
    };

    mainContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const updateUnread = async () => {
    const history = await db.getSetting('notification_history') || [];
    const count = history.filter(n => !n.read).length;
    setUnreadCount(count);
    
    // Update App Icon Badge
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { Badge } = await import('@capawesome/capacitor-badge');
        if (count > 0) {
          await Badge.set({ count });
        } else {
          await Badge.clear();
        }
      } catch (e) {
        console.warn('[badge] Failed to update badge', e);
      }
    }
  };

  // Expose to window for push listener
  useEffect(() => {
    window.updateUnread = updateUnread;
    return () => { delete window.updateUnread; };
  }, [services]);

  const selfHealNotifications = async () => {
    if (loading || services.length === 0) return;
    
    const history = await db.getSetting('notification_history') || [];
    const processed = await db.getSetting('processed_notifications') || {}; // { serviceNumber: { amount, type } }
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
          
          // Check if we have ALREADY processed this specific bill amount AND type
          const alreadyProcessed = processed[svc.serviceNumber] === currentKey;
          
          if (!alreadyProcessed) {
            // Also double check history just in case (standard check)
            const inHistory = history.some(n => 
              n.serviceNumber === svc.serviceNumber && 
              n.body.includes(svc.lastAmountDue.toString()) &&
              n.type === type
            );

            if (!inHistory) {
              const title = diffDays < 0 ? 'Bill Overdue' : 'Bill Due Soon';
              const body = diffDays < 0 
                ? `Your bill of ₹${svc.lastAmountDue} for ${svc.serviceNumber} is overdue!`
                : `Your bill of ₹${svc.lastAmountDue} for ${svc.serviceNumber} is due in ${diffDays} days.`;

              await saveNotificationToHistory({
                title,
                body,
                serviceNumber: svc.serviceNumber,
                type,
                read: false
              });
              
              processed[svc.serviceNumber] = currentKey;
              historyUpdated = true;
              processedUpdated = true;
            } else {
              // It's in history but not in our processed log (maybe from a previous version)
              processed[svc.serviceNumber] = currentKey;
              processedUpdated = true;
            }
          }
        }
      }
    }

    if (processedUpdated) {
      await db.setSetting('processed_notifications', processed);
    }
    if (historyUpdated) updateUnread();
  };

  useEffect(() => {
    updateUnread();

    const processDeepLink = async (sn) => {
      if (!sn || loading) return false;
      
      const svc = services.find(s => s.serviceNumber === sn);
      if (svc) {
        console.log('[dashboard] Successfully matched service for deep link:', sn);
        setInboxOpen(false);
        setDialog({ open: false, service: null });
        setAboutDialog({ open: false, service: null });
        flashCard(svc.id);
        if (window.history.replaceState) window.history.replaceState({}, '', '/');
        return true;
      } else {
        console.log('[dashboard] Service not found, opening add dialog for:', sn);
        setDialog({ open: true, service: null, initialServiceNumber: sn });
        if (window.history.replaceState) window.history.replaceState({}, '', '/');
        return true;
      }
    };

    const handleNotif = (e) => {
      console.log('[dashboard] Live notification signal received');
      updateUnread();
      const sn = e.detail?.serviceNumber;
      if (sn) {
        const svc = services.find(s => s.serviceNumber === sn);
        if (svc) actions.refresh(svc.id).catch(() => {});
      }
    };

    const handleDeepLinkSignal = (e) => {
      const sn = e.detail?.serviceNumber;
      console.log('[dashboard] Live deep-link signal received for:', sn);
      if (sn) {
        processDeepLink(sn).then(success => {
          if (!success) {
            console.log('[dashboard] Data not ready, deferring deep link for:', sn);
            pendingDeepLink.current = sn;
          }
        });
      }
    };

    const checkBootAction = async () => {
      // Check web URL for service number
      const path = window.location.pathname;
      if (path.length > 1 && path !== '/privacy') {
        // Handle shortcut deep links: /action/pay, /action/refresh, /action/add
        if (path === '/action/pay' || path.includes('action/pay')) {
          // Pay the pinned (or first) service with a DUE bill
          const pinnedDue = services.find(s => s.pinned && s.lastStatus === 'DUE' && s.lastAmountDue > 0);
          const firstDue = services.find(s => s.lastStatus === 'DUE' && s.lastAmountDue > 0);
          const target = pinnedDue || firstDue;
          if (target) {
            handlePay(target);
            if (window.history.replaceState) window.history.replaceState({}, '', '/');
          }
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
        if (snFromPath.length >= 13) {
          console.log('[dashboard] Web deep link detected:', snFromPath);
          pendingDeepLink.current = snFromPath;
        }
      }

      const pending = await db.getSetting('pending_notification_action');
      if (pending && pending.serviceNumber) {
        if (Date.now() - pending.timestamp < 300000) {
          console.log('[dashboard] Boot check: Processing pending action for:', pending.serviceNumber);
          const success = await processDeepLink(pending.serviceNumber);
          if (success) {
            await db.setSetting('pending_notification_action', null);
            pendingDeepLink.current = null;
          } else {
            pendingDeepLink.current = pending.serviceNumber;
          }
        } else {
          console.log('[dashboard] Boot check: Expiring old action');
          await db.setSetting('pending_notification_action', null);
        }
      } else if (pendingDeepLink.current) {
         processDeepLink(pendingDeepLink.current);
      }
    };

    // Listen for App State changes (Foreground/Background)
    const appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[dashboard] App active, running sync');
        updateUnread();
        selfHealNotifications();
      }
    });

    window.addEventListener('notification-received', handleNotif);
    window.addEventListener('notification-deep-link', handleDeepLinkSignal);

    // Android home-screen shortcut: "Pay Home"
    const handleShortcutPay = () => {
      const pinnedDue = services.find(s => s.pinned && s.lastStatus === 'DUE' && s.lastAmountDue > 0);
      const firstDue  = services.find(s => s.lastStatus === 'DUE' && s.lastAmountDue > 0);
      const target = pinnedDue || firstDue;
      if (target) handlePay(target);
    };
    window.addEventListener('shortcut-pay-home', handleShortcutPay);
    
    if (!loading) {
      if (pendingDeepLink.current) {
        processDeepLink(pendingDeepLink.current);
        pendingDeepLink.current = null;
      }
      checkBootAction();
      if (services.length > 0) selfHealNotifications();
    }

    return () => {
      appStateListener.then(h => h.remove());
      window.removeEventListener('notification-received', handleNotif);
      window.removeEventListener('notification-deep-link', handleDeepLinkSignal);
      window.removeEventListener('shortcut-pay-home', handleShortcutPay);
    };
  }, [loading, services]);

  // Sync unread count when inbox closes or opens
  useEffect(() => {
    if (!isWeb) updateUnread();
  }, [inboxOpen]);

  const handleNotificationAction = (notification) => {
    setInboxOpen(false);
    if (notification.serviceNumber) {
      const svc = services.find(s => s.serviceNumber === notification.serviceNumber);
      if (svc) {
        flashCard(svc.id);
        if (notification.type === 'BILL_OVERDUE' || notification.type === 'BILL_REMINDER') {
          setQrDialog({ open: true, service: svc });
        } else {
          setAboutDialog({ open: true, service: svc });
        }
      }
    }
  };

  const toggleCardStyle = () => {
    const nextStyle = cardStyle === 'classic' ? 'rich' : 'classic';
    setCardStyle(nextStyle);
    localStorage.setItem('appearance_card_style', nextStyle);
  };

  const [aboutDialog, setAboutDialog] = useState({ open: false, service: null });
  const [calculator, setCalculator] = useState({ open: false, service: null });
  const [qrDialog, setQrDialog] = useState({ open: false, service: null });
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [flashingId, setFlashingId] = useState(null);
  const { t } = useTranslation();
  const ph = usePostHog();

  const [bulkResult, setBulkResult] = useState(null);
  const [processingOverlay, setProcessingOverlay] = useState(null);
  const [autoBackupPrompt, setAutoBackupPrompt] = useState(false);
  const [notificationPrompt, setNotificationPrompt] = useState(false);

  useEffect(() => {
    if (!loading && services.length >= 5) {
      Promise.all([
        db.getSetting('has_seen_auto_backup_prompt'),
        db.getSetting('auto_backup_prompt_snoozed_until')
      ]).then(([seen, snoozedUntil]) => {
        if (!seen) {
          const now = Date.now();
          if (!snoozedUntil || now > snoozedUntil) {
            setAutoBackupPrompt(true);
          }
        }
      });
    }

    if (!loading && services.length >= 1) {
      db.getSetting('has_seen_notification_prompt').then(seen => {
        if (!seen && Capacitor.getPlatform() !== 'web') {
          import('@capacitor/push-notifications').then(({ PushNotifications }) => {
             PushNotifications.checkPermissions().then(status => {
                if (status.receive !== 'granted') {
                   setNotificationPrompt(true);
                }
             });
          });
        }
      });
    }
  }, [loading, services.length]);

  const trackBill = async (service, snapshot) => {
    if (!ph || !snapshot || !snapshot.billDate) return;
    
    if (service.lastReportedBillDate !== snapshot.billDate) {
      ph.capture('bill_refreshed', {
        id: service.id,
        circle: snapshot.circleName || service.circleName,
        amount: Number(snapshot.amountDue || 0),
        bill_date: snapshot.billDate
      });
      await actions.update(service.id, { lastReportedBillDate: snapshot.billDate });
    }
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    clearSelection();
  };

  const handleImportFromEmptyState = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setProcessingOverlay('Restoring Data...');
    try {
      await importBackupData(file, electricityContext, t, ph, () => {}, {
        onProgress: (msg) => setProcessingOverlay(msg)
      });
    } finally {
      setProcessingOverlay(null);
      e.target.value = '';
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

  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = useMemo(() => filterServices(services, filters), [services, filters]);
  const currentItems = activeView === 'active' ? visible : trash;
  const allSelected = currentItems.length > 0 && selectedIds.size === currentItems.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentItems.map(s => s.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleCopySelected = async () => {
    const selectedServices = currentItems.filter(s => selectedIds.has(s.id));
    if (selectedServices.length === 0) return;
    
    const text = selectedServices.map(s => {
      const name = s.label || s.customerName || t('untitled');
      return `${name}:${s.serviceNumber}`;
    }).join(', ');

    try {
      await navigator.clipboard.writeText(text);
      const msg = selectedServices.length === 1 ? 'Copied 1 service' : `Copied ${selectedServices.length} services`;
      toast.success(t('copied_count', msg));
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  const handleShareSelected = async () => {
    const selectedServices = currentItems.filter(s => selectedIds.has(s.id));
    if (selectedServices.length === 0) return;

    const monthYear = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
    const sortedServices = [...selectedServices].sort((a, b) => (b.lastAmountDue || 0) - (a.lastAmountDue || 0));
    
    const items = sortedServices.map(s => ({
      name: s.label || s.customerName || t('untitled'),
      amount: s.lastAmountDue || 0,
      units: s.lastBilledUnits || 0
    }));

    const tableText = generateShareTable(items);

    const text = `*Electricity Bill for ${monthYear}*\n\n` +
                 tableText + `\n\n` +
                 `Link: https://my-dashboard-mobile.vercel.app`;

    if (Capacitor.getPlatform() !== 'web') {
      try {
        await Share.share({
          title: 'Electricity Bill Summary',
          text: text,
          dialogTitle: 'Share Summary'
        });
        return;
      } catch (err) {
        console.warn('[share] Native share failed', err);
      }
    }

    if (navigator.share && navigator.canShare && navigator.canShare({ text })) {
      try {
        await navigator.share({ title: 'Electricity Bill Summary', text });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Summary copied to clipboard!');
    } catch {
      toast.error('Sharing failed');
    }
  };

  useEffect(() => {
    clearSelection();
  }, [activeView]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (inboxOpen) {
          setInboxOpen(false);
        } else if (selectedIds.size > 0) {
          clearSelection();
        } else if (bulkResult) {
          setBulkResult(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, bulkResult, inboxOpen]);

  useEffect(() => {
    const handleBack = (e) => {
      if (e.detail?.handled) return;

      if (dialog.open || aboutDialog.open || calculator.open || qrDialog.open || confirmState.open || bulkResult || inboxOpen) {
        setDialog({ open: false, service: null });
        setAboutDialog({ open: false, service: null });
        setCalculator({ open: false, service: null });
        setQrDialog({ open: false, service: null });
        setConfirmState(prev => ({ ...prev, open: false }));
        setBulkResult(null);
        setInboxOpen(false);
        if (e.detail) e.detail.handled = true;
        return;
      }

      // Check for Custom Event detail from App.jsx about appliance calculator
      // Actually, it's better to handle it in App.jsx as I already did.


      if (selectedIds.size > 0) {
        clearSelection();
        if (e.detail) e.detail.handled = true;
        return;
      }

      if (activeView === 'trash') {
        setActiveView('active');
        if (e.detail) e.detail.handled = true;
        return;
      }
    };
    window.addEventListener('app-back-button', handleBack);
    return () => window.removeEventListener('app-back-button', handleBack);
  }, [selectedIds, dialog.open, aboutDialog.open, calculator.open, qrDialog.open, confirmState.open, bulkResult, inboxOpen]);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStart = useRef(0);
  const isPulling = useRef(false);
  const pullThreshold = 80;

  useEffect(() => {
    const container = document.querySelector('.main');
    if (!container) return;

    const handleTouchStart = (e) => {
      if (container.scrollTop <= 0) {
        touchStart.current = e.touches[0].pageY;
        isPulling.current = true;
      } else {
        isPulling.current = false;
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling.current || isRefreshing) return;
      const currentY = e.touches[0].pageY;
      const diff = currentY - touchStart.current;

      if (diff > 0) {
        const dist = Math.min(diff * 0.4, pullThreshold + 20);
        setPullDistance(dist);
        if (dist > 10) {
           if (e.cancelable) e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current || isRefreshing) return;
      const finalDist = pullDistance;
      isPulling.current = false;

      if (finalDist >= pullThreshold) {
        setPullDistance(70);
        setIsRefreshing(true);
        try {
          await actions.reload();
          await handleRefreshAll();
        } catch (e) {
          console.error('[PTR] Refresh process failed', e);
        } finally {
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 500);
        }
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing, actions]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const useAccordion = isMobile ? visible.length > 1 : visible.length > 3;

  const handleCalculateBill = (service) => {
    setCalculator({ open: true, service });
  };

  async function submitService(payload) {
    if (payload.isBulk) {
      const { entries } = payload;
      if (ph) ph.capture('bulk_add_started', { count: entries.length });
      setProcessingOverlay(`Validating ${entries.length} services...`);
      const results = { succeeded: [], failed: [], alreadyExists: [], inTrash: [] };

      for (const entry of entries) {
        const sn = entry.number;
        const inActive = services.find(s => s.serviceNumber === sn);
        const inTrash = trash.find(t => t.serviceNumber === sn);
        
        if (inActive) { results.alreadyExists.push(sn); continue; }
        if (inTrash) { results.inTrash.push(sn); continue; }

        try {
          await actions.add({ isBulk: false, serviceNumber: sn, label: entry.label, pinned: !!entry.pinned });
          results.succeeded.push(sn);
          setProcessingOverlay(`Added ${results.succeeded.length}/${entries.length}...`);
        } catch (e) {
          if (e?.message === 'CANCELLED') {
            setProcessingOverlay(null);
            setBulkResult(results);
            return;
          }
          results.failed.push({ number: sn, error: e?.message || 'Unknown error' });
        }
      }
      setProcessingOverlay(null);
      setBulkResult(results);
      if (activeView !== 'active') setActiveView('active');
      return;
    }

    if (dialog.service) {
      setProcessingOverlay(t('saving', 'Saving...'));
      try {
        await actions.update(dialog.service.id, { label: payload.label });
        toast.success('Updated');
      } catch(e) {
        toast.error(`Update failed: ${e?.message || 'Unknown error'}`);
      } finally {
        setProcessingOverlay(null);
      }
    } else {
      const inTrash = trash.find(t => t.serviceNumber === payload.serviceNumber);
      if (inTrash) {
        setConfirmState({
          open: true,
          title: 'Restore from Trash?',
          description: 'This service is currently in the Trash.\n\nWould you like to restore it instead of adding a new one?',
          isDanger: false,
          onConfirm: async () => {
            setProcessingOverlay(t('saving', 'Restoring...'));
            try {
              await actions.restore(inTrash.id);
              toast.success('Restored');
              setDialog({ open: false, service: null });
              handleViewChange('active');
              flashCard(inTrash.id);
            } catch(e) {
              toast.error(`Restore failed: ${e?.message || 'Unknown error'}`);
            } finally {
              setProcessingOverlay(null);
            }
          }
        });
        return;
      }
      
      const inActive = services.find(s => s.serviceNumber === payload.serviceNumber);
      if (inActive) { toast.error('Service number already exists.'); return; }

      setProcessingOverlay('Validating and fetching bill...');
      try {
        const newService = await actions.add(payload);
        toast.success('Service added');
        setDialog({ open: false, service: null });
        handleViewChange('active');
        if (newService?.id) flashCard(newService.id);
      } catch (e) {
        if (e?.message !== 'CANCELLED') toast.error(`Add failed: ${e?.message || 'Unknown error'}`);
        throw e;
      } finally {
        setProcessingOverlay(null);
      }
    }
  }

  async function handleRefreshAll(options = { skipApi: false, quiet: false }) {
    const currentServices = await actions.reload();
    if (!currentServices.length || options.skipApi) return;
    
    if (!options.quiet) {
      setRefreshingAll(true);
      setProcessingOverlay('Refreshing all services...');
    }

    try {
      const summary = await actions.refreshAll((done, tot) => {
        if (!options.quiet) setProcessingOverlay(`Refreshing ${done} of ${tot} services...`);
      });
      if (summary && !options.quiet) {
        summary.failed === 0 ? toast.success(`All refreshed`) : toast.error(`Refresh failed for ${summary.failed} service(s)`);
      }
    } finally {
      if (!options.quiet) {
        setRefreshingAll(false);
        setProcessingOverlay(null);
      }
    }
  }

  function handlePay(service) {
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
  }

  async function handleShare(service) {
    const isPaid = service.isPaid;
    const name = service.customerName || service.label || 'Consumer';
    const sn = service.serviceNumber;
    const amount = isPaid ? (service.paidAmount || service.lastAmountDue || 0) : service.lastAmountDue;
    const date = isPaid ? service.paidDate : service.lastDueDate;
    const url = `https://my-dashboard-mobile.vercel.app/${sn}`;
    
    let text = '';
    if (isPaid) {
      text = `⚡ *Electricity Bill Payment Receipt*\n\n` +
             `*Service No:* ${sn}\n` +
             `*Name:* ${name}\n` +
             `*Amount Paid:* ₹${amount}\n` +
             `*Date:* ${date ? new Date(date).toLocaleDateString('en-IN') : 'N/A'}\n` +
             `*Status:* ✅ Successfully Paid\n\n` +
             `Link: ${url}\n\n` +
             `Shared via AP Vidyuth`;
    } else {
      text = `⚡ *Electricity Bill Update*\n\n` +
             `*Service No:* ${sn}\n` +
             `*Name:* ${name}\n` +
             `*Amount Due:* ₹${amount}\n` +
             `*Due Date:* ${date ? new Date(date).toLocaleDateString('en-IN') : 'N/A'}\n` +
             `*Status:* ⏳ Pending Payment\n\n` +
             `Please pay your bill to avoid late fees.\n\n` +
             `Link: ${url}\n\n` +
             `Shared via AP Vidyuth`;
    }

    // Try native share first (Capacitor)
    if (Capacitor.getPlatform() !== 'web') {
      try {
        await Share.share({
          title: 'Electricity Bill Status',
          text: text,
          dialogTitle: 'Share Bill Update'
        });
        return;
      } catch (err) {
        console.warn('[share] Native share failed', err);
      }
    }

    // Web fallback
    if (navigator.share && navigator.canShare && navigator.canShare({ text })) {
      try {
        await navigator.share({ title: 'Electricity Bill Status', text });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard. You can now paste and share.');
    } catch {
      toast.error('Sharing failed');
    }
  }

  async function handleShareMonthlyReport(service) {
    const insights = service.insights;
    if (!insights) { toast.error('Not enough data to generate report yet'); return; }
    
    const name = service.customerName || service.label || 'Consumer';
    const sn = service.serviceNumber;
    const trend = insights.vsLastMonth;
    const trendText = trend ? `(${trend.amountPct > 0 ? '📈 +' : '📉 '}${trend.amountPct}% vs last month)` : '';
    const url = `https://my-dashboard-mobile.vercel.app/${sn}`;

    const text = `📊 *Electricity Usage Report — ${new Date().toLocaleString('default', { month: 'long' })}*\n\n` +
                 `*Service:* ${name} (${sn})\n` +
                 `*Usage:* ${service.lastBilledUnits || 0} Units\n` +
                 `*Cost:* ₹${service.lastAmountDue || service.billAmount}\n` +
                 `${trendText}\n\n` +
                 `*Quick Insights:*\n` +
                 `• Monthly Average: ₹${insights.avgAmount}\n` +
                 `• Highest ever: ₹${insights.maxAmount}\n` +
                 `• Efficiency: ₹${insights.avgCostPerUnit}/unit\n\n` +
                 `*Next Est:* ~₹${insights.predictedNextBill || '...'}\n\n` +
                 `Link: ${url}\n\n` +
                 `Shared via AP Vidyuth`;

    if (Capacitor.getPlatform() !== 'web') {
      try {
        await Share.share({
          title: 'Monthly Electricity Report',
          text: text,
          dialogTitle: 'Share Report'
        });
        return;
      } catch (err) {
        console.warn('[share] Report share failed', err);
      }
    }

    if (navigator.share && navigator.canShare && navigator.canShare({ text })) {
      try {
        await navigator.share({ title: 'Monthly Electricity Report', text });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Report copied to clipboard. You can now paste and share.');
    } catch {
      toast.error('Copy failed');
    }
  }

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
              <><button className="btn btn--ghost btn--sm" onClick={() => handleBulkAction('restore')}><Loader size={16} />{!isMobile && <span style={{ marginLeft: '4px' }}>Restore</span>}</button><button className="btn btn--danger btn--sm" onClick={() => handleBulkAction('purge')}><FiTrash2 size={13} />{!isMobile && <span style={{ marginLeft: '4px' }}>Purge</span>}</button></>
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
        {refreshProgress && <div className="refresh-progress"><Loader size={12} /> {refreshProgress.done} / {refreshProgress.total}</div>}
      </header>

      <SummaryBar services={services} />
      
      {activeView === 'active' && services.length > 0 && !loading && (
        <DailyTip />
      )}

      <Toolbar filters={filters} onFiltersChange={setFilters} onAdd={() => setDialog({ open: true, service: null })} onRefreshAll={handleRefreshAll} refreshingAll={refreshingAll} activeView={activeView} onViewChange={handleViewChange} trashCount={trash.length} hasServices={services.length > 0 && !loading} services={services} cardStyle={cardStyle} onToggleCardStyle={toggleCardStyle} />

      <NotificationInbox open={inboxOpen} onClose={() => setInboxOpen(false)} onAction={handleNotificationAction} />

      {activeView === 'active' && (
        <>{loading ? <div className="state-box"><Loader size={22} /><p>{t('loading_services')}</p></div> : visible.length === 0 ? <div className="state-box"><FiZap size={28} /><h3>{t('no_services_found')}</h3><p>{services.length === 0 ? t('add_first_service') : t('no_results_filter')}</p>{services.length === 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}><button className="btn btn--primary" onClick={() => setDialog({ open: true, service: null })}>{t('add_service')}</button><div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Have a backup file?</span><input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleImportFromEmptyState} /><button className="btn btn--ghost btn--sm" onClick={() => fileInputRef.current?.click()}><FiUpload size={14} /> Restore Data</button></div></div>}</div> : 
        visible.length > 50 ? (
          <Virtuoso
            useWindowScroll
            data={visible}
            itemContent={(index, s) => (
              <div style={{ paddingBottom: '16px' }}>
                <ServiceCard key={s.id} id={`service-${s.id}`} service={s} useAccordion={useAccordion} cardStyle={cardStyle} refreshing={refreshingIds.has(s.id)} isFlashing={flashingId === s.id} selected={selectedIds.has(s.id)} selecting={selectedIds.size > 0} onToggleSelect={toggleSelect} onRefresh={async () => { setProcessingOverlay('Refreshing bill...'); try { const updated = await actions.refresh(s.id); toast.success('Refreshed'); if (updated) await trackBill(s, updated); } catch (e) { if (e?.message !== 'CANCELLED') toast.error(`Refresh failed`); } finally { setProcessingOverlay(null); } }} onEdit={() => setDialog({ open: true, service: s })} onAbout={() => setAboutDialog({ open: true, service: s })} onDelete={() => { setConfirmState({ open: true, title: 'Move to Trash?', description: 'This service will be moved to the Trash.', isDanger: true, onConfirm: async () => { const tst = toast.loading('Moving to trash…'); try { await actions.remove(s.id); toast.success('Moved to trash', { id: tst }); clearSelection(); } catch (e) { toast.error(`Failed to move`, { id: tst }); } } }); }} onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })} onCalculateBill={(svc) => handleCalculateBill(svc)} onShowQR={(svc) => setQrDialog({ open: true, service: svc })} onPay={() => handlePay(s)} onShare={() => handleShare(s)} onShareReport={() => handleShareMonthlyReport(s)} />
              </div>
            )}
          />
        ) : (
          <div className="grid">
            {visible.map(s => (
              <ServiceCard key={s.id} id={`service-${s.id}`} service={s} useAccordion={useAccordion} cardStyle={cardStyle} refreshing={refreshingIds.has(s.id)} isFlashing={flashingId === s.id} selected={selectedIds.has(s.id)} selecting={selectedIds.size > 0} onToggleSelect={toggleSelect} onRefresh={async () => { setProcessingOverlay('Refreshing bill...'); try { const updated = await actions.refresh(s.id); toast.success('Refreshed'); if (updated) await trackBill(s, updated); } catch (e) { if (e?.message !== 'CANCELLED') toast.error(`Refresh failed`); } finally { setProcessingOverlay(null); } }} onEdit={() => setDialog({ open: true, service: s })} onAbout={() => setAboutDialog({ open: true, service: s })} onDelete={() => { setConfirmState({ open: true, title: 'Move to Trash?', description: 'This service will be moved to the Trash.', isDanger: true, onConfirm: async () => { const tst = toast.loading('Moving to trash…'); try { await actions.remove(s.id); toast.success('Moved to trash', { id: tst }); clearSelection(); } catch (e) { toast.error(`Failed to move`, { id: tst }); } } }); }} onTogglePin={() => actions.update(s.id, { pinned: !s.pinned })} onCalculateBill={(svc) => handleCalculateBill(svc)} onShowQR={(svc) => setQrDialog({ open: true, service: svc })} onPay={() => handlePay(s)} onShare={() => handleShare(s)} onShareReport={() => handleShareMonthlyReport(s)} />
            ))}
          </div>
        )
        }</>
      )}

      {activeView === 'trash' && <TrashView services={trash} selectedIds={selectedIds} selecting={selectedIds.size > 0} onToggleSelect={toggleSelect} onRestore={id => { setConfirmState({ open: true, title: 'Restore service?', description: 'This service will be restored.', isDanger: false, onConfirm: async () => { const tst = toast.loading('Restoring…'); try { await actions.restore(id); toast.success('Restored', { id: tst }); clearSelection(); handleViewChange('active'); flashCard(id); } catch (e) { toast.error(`Restore failed`, { id: tst }); } } }); }} onDeletePermanent={id => { setConfirmState({ open: true, title: 'Delete permanently?', description: 'This action cannot be undone.', isDanger: true, onConfirm: () => toast.promise(actions.purge(id), { loading: 'Deleting…', success: () => { clearSelection(); return 'Deleted permanently'; }, error: 'Delete failed' }) }); }} />}

      <ServiceDialog open={dialog.open} service={dialog.service} initialServiceNumber={dialog.initialServiceNumber} services={services} onClose={() => setDialog({ open: false, service: null })} onSubmit={submitService} />
      <ServiceAboutDialog open={aboutDialog.open} service={aboutDialog.service} onClose={() => setAboutDialog({ open: false, service: null })} />
      <Suspense fallback={null}>
        <BillCalculator open={calculator.open} service={calculator.service} onClose={() => setCalculator({ open: false, service: null })} />
      </Suspense>
      <QRCodeDialog open={qrDialog.open} service={qrDialog.service} onClose={() => setQrDialog({ open: false, service: null })} onUpdateTime={(id, time) => { actions.update(id, { billTime: time }); setQrDialog(prev => ({ ...prev, service: { ...prev.service, billTime: time } })); }} />
      {bulkResult && createPortal(
        <div className="overlay overlay--center" onClick={() => setBulkResult(null)}>
          <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw' }}>
            <h2 className="dialog__title">Bulk Add Results</h2>
            <div className="dialog__body" style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: '12px' }}>
              {bulkResult.succeeded.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--green)', fontWeight: '700', fontSize: '13px' }}>✅ Added ({bulkResult.succeeded.length})</p>
                  <p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.succeeded.join(', ')}</p>
                </div>
              )}
              {bulkResult.inTrash.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--amber)', fontWeight: '700', fontSize: '13px' }}>⚠️ Skipped ({bulkResult.inTrash.length})</p>
                  <p className="mono-sm" style={{ color: 'var(--text-2)' }}>{bulkResult.inTrash.join(', ')}</p>
                </div>
              )}
              {bulkResult.alreadyExists.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--text-3)', fontWeight: '700', fontSize: '13px' }}>ℹ️ Already Active ({bulkResult.alreadyExists.length})</p>
                </div>
              )}
              {bulkResult.failed.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: 'var(--red)', fontWeight: '700', fontSize: '13px' }}>❌ Failed ({bulkResult.failed.length})</p>
                  {bulkResult.failed.map((f, i) => (
                    <p key={i} className="mono-sm" style={{ color: 'var(--text-2)' }}>{f.number}: {f.error}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="dialog__footer">
              <button className="btn btn--primary" onClick={() => setBulkResult(null)} style={{ width: '100%' }}>Got it</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {processingOverlay && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 150000, background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'var(--bg-2)', padding: '40px 24px', borderRadius: '28px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-hi)', textAlign: 'center', width: '100%', maxWidth: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <Loader size={44} />
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 6px', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>{processingOverlay}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-1)', opacity: 0.7, margin: 0, fontWeight: '600' }}>Please wait, this might take a moment...</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description} isDanger={confirmState.isDanger} onClose={() => setConfirmState(prev => ({ ...prev, open: false }))} onConfirm={confirmState.onConfirm} />
      
      <ConfirmDialog 
        open={autoBackupPrompt} 
        title="Backup Recommended" 
        description="You have saved a lot of services! We recommend taking a backup of your data so you don't lose it if you change devices. Would you like to go to Data Management now?" 
        isDanger={false} 
        confirmText="Go to Backup"
        cancelText="Not Now"
        onClose={() => {
          setAutoBackupPrompt(false);
          // Snooze for 7 days
          db.setSetting('auto_backup_prompt_snoozed_until', Date.now() + 7 * 24 * 60 * 60 * 1000);
        }} 
        onConfirm={() => {
          setAutoBackupPrompt(false);
          db.setSetting('has_seen_auto_backup_prompt', true);
          window.dispatchEvent(new CustomEvent('app-navigate', { detail: { page: 'settings' } }));
        }} 
      />

      <ConfirmDialog 
        open={notificationPrompt} 
        title="Get Bill Alerts" 
        description="We'll notify you when a new bill is generated or if a due date is approaching. Turn on notifications?" 
        isDanger={false} 
        confirmText="Enable Alerts"
        cancelText="Maybe Later"
        onClose={() => {
          setNotificationPrompt(false);
          db.setSetting('has_seen_notification_prompt', true);
        }} 
        onConfirm={() => {
          setNotificationPrompt(false);
          db.setSetting('has_seen_notification_prompt', true);
          import('./utils/notifications.js').then(m => m.setupPushNotifications(true));
        }} 
      />
    </div>
  );
}
