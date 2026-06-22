import { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import {
  FiCopy, FiExternalLink, FiMoreVertical,
  FiEdit2, FiTrash2, FiChevronDown, FiTrendingUp, FiTrendingDown,
  FiCalendar, FiCheckCircle, FiAlertTriangle, FiZap, FiInfo, FiClock, FiAlertCircle, FiShare2, FiFileText, FiXCircle, FiPlus, FiWifiOff
} from 'react-icons/fi';
import { LuCalculator } from 'react-icons/lu';
import { BsPin, BsPinFill, BsQrCode } from 'react-icons/bs';
import toast from 'react-hot-toast';
import { formatInr, formatDate, formatDateTime, fromNow, getDueTone, getDueCopy } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';
import { Loader } from '../../../shared/components/Loader.jsx';
import { BudgetGoal } from './BudgetGoal.jsx';
import { MeterReadingLog } from './MeterReadingLog.jsx';
import { CostSplitTracker } from './CostSplitTracker.jsx';

import { useNetwork } from '../../../shared/hooks/useNetwork.js';
import { db } from '../../../shared/db/storage.js';

// ── Lazy Components ──────────────────────────────────────────────────────────
const TrendChart = lazy(() => import('./TrendChart.jsx').then(m => ({ default: m.TrendChart })));

// ── Helpers ────────────────────────────────────────────────────────────────────

function TrendBadge({ value, unit = '', percent }) {
  if (value == null) return null;
  const up = value > 0, zero = value === 0;
  const label = zero ? 'Same'
    : `${up ? '+' : ''}${unit === '₹' ? formatInr(Math.abs(value)) : `${Math.abs(value).toLocaleString('en-IN')} ${unit}`}`;    
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono-data px-1.5 py-0.5 rounded-full ${
      zero ? 'bg-surface-container text-text-muted' : up ? 'bg-red-dim text-red' : 'bg-green-dim text-green'
    }`}>
      {!zero && (
        <span className="material-symbols-outlined text-[12px]">
          {up ? 'trending_up' : 'trending_down'}
        </span>
      )}
      {label}{percent != null ? ` (${percent > 0 ? '+' : ''}${Number(percent).toFixed(0)}%)` : ''}
    </span>
  );
}

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonth(m) { if (!m) return '—'; const [y, mo] = m.split('-'); return `${MO[+mo - 1]} ${y}`; }

// ── Accordion section ──────────────────────────────────────────────────────────

function Section({ title, badge, defaultOpen = false, children, isExpanded }) {
  const [open, setOpen] = useState(defaultOpen);
  
  useEffect(() => {
    if (isExpanded === false) {
      const t = setTimeout(() => setOpen(false), 300);
      return () => clearTimeout(t);
    }
  }, [isExpanded]);

  return (
    <div className={`border-b border-border-subtle last:border-none transition-all duration-200 ${open ? 'bg-surface-container-low/10' : ''}`}>
      <button 
        className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-surface-container-low transition-colors duration-150 text-left cursor-pointer" 
        onClick={() => setOpen(v => !v)}
      >
        <span className="font-body-bold text-[13px] text-on-surface">{title}</span>
        <div className="flex items-center gap-2">
          {(typeof badge === 'string' || typeof badge === 'number') ? (
            <span className="font-mono-data text-xs px-2 py-0.5 bg-surface-container-high text-text-secondary rounded">{badge}</span>
          ) : badge}
          <span className={`material-symbols-outlined text-[16px] text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </div>
      </button>
      {open && <div className="p-3 bg-surface-container-low/30 border-t border-border-subtle">{children}</div>}
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────────

export function ServiceCard({ 
  id, service, refreshing, isFlashing, onRefresh, onEdit, onShowQR, onAbout, onDelete, 
  onTogglePin, onPay, onShare, onShareReport, useAccordion, selected, selecting, 
  onToggleSelect, onCalculateBill, cardStyle = 'rich' 
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!useAccordion);
  const [showUpdateInfoHead, setShowUpdateInfoHead] = useState(false);
  const [showUpdateInfoMetrics, setShowUpdateInfoMetrics] = useState(false);
  const { t } = useTranslation();
  const longPressTimer = useRef(null);
  const headUpdateRef = useRef(null);
  const metricsUpdateRef = useRef(null);

  const [meterLogCount, setMeterLogCount] = useState(0);

  useEffect(() => {
    const update = async () => {
      const v = await db.getSetting(`readings_${service.serviceNumber}`);
      if (Array.isArray(v)) {
        const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
        setMeterLogCount(v.filter(r => new Date(r.date).getTime() > cutoff).length);
      } else {
        setMeterLogCount(0);
      }
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [service.serviceNumber]);

  useEffect(() => {
    setIsExpanded(!useAccordion);
  }, [useAccordion, cardStyle]);

  useEffect(() => {
    if (!showUpdateInfoHead && !showUpdateInfoMetrics) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setShowUpdateInfoHead(false);
        setShowUpdateInfoMetrics(false);
      }
    };
    const handleClickOutside = (e) => {
      if (headUpdateRef.current && !headUpdateRef.current.contains(e.target)) {
        setShowUpdateInfoHead(false);
      }
      if (metricsUpdateRef.current && !metricsUpdateRef.current.contains(e.target)) {
        setShowUpdateInfoMetrics(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    const handlePop = () => {
      setShowUpdateInfoHead(false);
      setShowUpdateInfoMetrics(false);
    };
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('popstate', handlePop);
    };
  }, [showUpdateInfoHead, showUpdateInfoMetrics]);

  const status = service.lastStatus || 'UNKNOWN';
  const dueTone = getDueTone(service.lastDueDate, service.isPaid);
  const dueCopy = getDueCopy(service.lastDueDate, service.isPaid);
  const insights = service.insights;
  const breakup = service.billBreakup;

  const currentYearTotalPaid = useMemo(() => {
    if (!service.billHistory?.length) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const paymentsThisYear = service.billHistory.filter(ph => {
      const d = new Date(ph.billDate);
      return d.getFullYear() === currentYear && d.getMonth() <= currentMonth;
    });
    
    if (!paymentsThisYear.length) return null;

    const total = paymentsThisYear.reduce((sum, ph) => sum + Number(ph.billAmount || 0), 0);
    
    let endMonthName = '—';
    if (paymentsThisYear.length > 0) {
      const sorted = [...paymentsThisYear].sort((a, b) => new Date(b.billDate) - new Date(a.billDate));
      endMonthName = new Date(sorted[0].billDate).toLocaleString('en-IN', { month: 'short' });
    }

    return {
      total,
      label: `Jan - ${endMonthName} ${currentYear}`
    };
  }, [service.billHistory]);

  const hasAnyPaymentData = (service.paymentHistory && service.paymentHistory.length > 0) || (service.billHistory && service.billHistory.some(b => b.isPaid));
  const streak = useMemo(() => {
    if (!hasAnyPaymentData) return 0;
    const bh = service.billHistory || [];
    if (bh.length === 0) return 0;
    const sorted = [...bh].sort((a, b) => new Date(b.billDate) - new Date(a.billDate));
    let s = 0;
    for (const b of sorted) {
      const paidOnTime = b.isPaid && b.paidDate && b.dueDate && new Date(b.paidDate) <= new Date(b.dueDate);
      if (paidOnTime) s++;
      else break;
    }
    return s;
  }, [service.billHistory, hasAnyPaymentData]);

  const streakEmoji = hasAnyPaymentData ? (streak >= 3 ? '🔥 ' : streak >= 1 ? '✅ ' : '📊 ') : '';

  async function copyNum() {
    try {
      await navigator.clipboard.writeText(service.serviceNumber);
      toast.success('Service number copied');
    }
    catch (e) { toast.error(`Copy failed: ${e?.message || 'Unknown error'}`); }
  }

  const touchPos = useRef({ x: 0, y: 0 });

  const handlePressStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchPos.current = { x: clientX, y: clientY };

    longPressTimer.current = setTimeout(() => {
      if (onToggleSelect && !selecting) {
        onToggleSelect(service.id);
        if (window.navigator.vibrate) window.navigator.vibrate(50);
      }
    }, 700);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePressMove = (e) => {
    if (!longPressTimer.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = Math.abs(clientX - touchPos.current.x);
    const dy = Math.abs(clientY - touchPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const { isOffline } = useNetwork();

  const handleRefreshClick = (e) => {
    e.stopPropagation();
    if (isOffline) {
      toast('You are offline. Reconnect to refresh.', { icon: <FiWifiOff color="var(--amber)" /> });
      return;
    }
    onRefresh();
  };

  const handlePayClick = (e) => {
    e.stopPropagation();
    if (isOffline) {
      toast('You are offline. Reconnect to pay bill.', { icon: <FiWifiOff color="var(--amber)" /> });
      return;
    }
    onPay();
  };

  const isHistoryError = service.lastError?.includes('APSPDCL history unavailable');

  return (
    <article
      id={id}
      className={`scard bg-surface-card border border-border-medium rounded-xl p-4 flex flex-col gap-3 shadow-sm transition-all duration-200 hover:translate-y-[-1px] relative overflow-visible ${
        selected ? 'border-primary bg-primary-dim/5 ring-1 ring-primary' : ''
      } ${isFlashing ? 'animate-pulse border-amber shadow-[0_0_12px_var(--amber)]' : ''}`}
      onContextMenu={e => { if (longPressTimer.current || selecting) e.preventDefault(); }}
    >
      {selecting && (
        <div
          className="absolute inset-0 z-5 cursor-pointer rounded-xl"
          onClick={e => { e.stopPropagation(); onToggleSelect(service.id); }}
        />
      )}

      {/* ── Header ────────────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center w-full relative z-10"
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onMouseMove={handlePressMove}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchMove={handlePressMove}
      >
        <div className="flex items-center gap-3">
          {selecting && (
            <div className="relative z-10 flex items-center mr-1">
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect(service.id)}
                onClick={e => e.stopPropagation()}
                className="w-[18px] h-[18px] cursor-pointer rounded border-border-medium text-primary focus:ring-primary"
              />
            </div>
          )}
          <div className="flex flex-col items-center gap-1.5">
            {/* Glowing neon status dot */}
            <div className={`relative flex items-center justify-center w-3 h-3 rounded-full ${
              status === 'DUE' ? 'bg-red shadow-[0_0_8px_#e11d48]' : 
              status === 'PAID' ? 'bg-green shadow-[0_0_8px_#059669]' : 
              'bg-text-muted shadow-[0_0_8px_#64748b]'
            }`} />
            {service.pinned && (
              <span className="material-symbols-outlined text-[14px] text-primary rotate-45">pin</span>
            )}        
          </div>
          <div className="flex flex-col">
            <h2 className="font-body-bold text-[14px] text-on-surface truncate max-w-[160px]" title={service.customerName}>
              {service.label || service.customerName || t('untitled')}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono-data text-[11px] text-text-secondary">{service.serviceNumber}</span>
              <button
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-container-low text-text-secondary relative z-10 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); copyNum(); }}
                title={t('copy')}
                aria-label={t('copy')}
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
              </button>
              <button
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-container-low text-text-secondary relative z-10 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                title="Share Status"
                aria-label="Share Status"
              >
                <span className="material-symbols-outlined text-[14px]">share</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-30">
          {cardStyle === 'classic' && (
            <div
              ref={headUpdateRef}
              className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer hover:text-on-surface transition-colors"
              title={formatDateTime(service.lastFetchedAt)}
              onClick={(e) => { e.stopPropagation(); setShowUpdateInfoHead(!showUpdateInfoHead); }}
            >
              <span className="material-symbols-outlined text-[12px]">schedule</span>
              <span>{fromNow(service.lastFetchedAt)}</span>
            </div>
          )}
          {showUpdateInfoHead && cardStyle === 'classic' && (
            <div className="absolute top-7 right-10 bg-inverse-surface text-inverse-on-surface p-2 rounded-lg shadow-lg border border-border-medium z-50 text-[10px] font-mono-data whitespace-nowrap">
               Updated: {formatDateTime(service.lastFetchedAt)}
            </div>
          )}

          <span className={`text-[11px] font-label-caps px-2 py-0.5 rounded-full ${
            status === 'DUE' ? 'bg-badge-due-bg text-badge-due-fg' : 
            status === 'PAID' ? 'bg-badge-paid-bg text-badge-paid-fg' : 
            'bg-surface-container-high text-text-secondary'
          }`}>{t(`filter_${status.toLowerCase()}`, status.replace('_', ' '))}</span>
          
          <div className="relative">
            <button 
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors text-text-secondary cursor-pointer" 
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }} 
              onBlur={() => setTimeout(() => setMenuOpen(false), 200)}
              aria-label={t('more_options', 'More options')}
            >
              <span className="material-symbols-outlined">more_vert</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 bg-surface-card border border-border-medium rounded-xl shadow-lg p-1.5 w-48 z-50 flex flex-col gap-0.5" onMouseDown={e => e.stopPropagation()}>
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-text-secondary hover:bg-surface-container hover:text-on-surface rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onTogglePin(); }}
                >
                  <span className="material-symbols-outlined text-[18px]">{service.pinned ? 'keep_off' : 'keep'}</span>
                  {service.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-text-secondary hover:bg-surface-container hover:text-on-surface rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span> Edit Details
                </button>
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-text-secondary hover:bg-surface-container hover:text-on-surface rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onShowQR?.(service); }}
                >
                  <span className="material-symbols-outlined text-[18px]">qr_code</span> Show QR Code
                </button>
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-text-secondary hover:bg-surface-container hover:text-on-surface rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onCalculateBill?.(service); }}
                >
                  <span className="material-symbols-outlined text-[18px]">calculate</span> {t('calculate_next_bill')}
                </button>
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-text-secondary hover:bg-surface-container hover:text-on-surface rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onShareReport?.(); }}
                >
                  <span className="material-symbols-outlined text-[18px]">description</span> Share Report
                </button>
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-text-secondary hover:bg-surface-container hover:text-on-surface rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onAbout(); }}
                >
                  <span className="material-symbols-outlined text-[18px]">info</span> {t('about_service')}
                </button>
                <div className="h-[1px] bg-border-subtle my-1" />
                <button 
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-body-bold text-red hover:bg-red-dim/10 rounded-lg text-left cursor-pointer"
                  onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span> Move to Trash
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero / Amount ────────────────────────────────────────────────────────────────── */}
      <div 
        className="flex items-center justify-between w-full relative z-10 cursor-pointer py-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <div>
              <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-0.5">{t('amount_due')}</p>
              <h2 className="font-amount-hero text-amount-hero text-on-surface tracking-tight font-black leading-none">
                {status === 'DUE' ? formatInr(service.lastAmountDue) : '₹0'}
              </h2>
            </div>
            <div className="w-6 h-6 rounded-full bg-surface-container border border-border-subtle flex items-center justify-center text-text-secondary transition-all">
              <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 mt-2">
            {insights?.vsLastMonth && (
              <div>
                 <TrendBadge value={insights?.vsLastMonth.amount} unit="₹" percent={insights?.vsLastMonth.amountPct} />
              </div>
            )}
            {dueCopy && !service.isPaid && (
              <span className={`text-[11px] font-body-bold text-${dueTone}`}>
                {dueCopy} ({formatDate(service.lastDueDate)})
              </span>
            )}
            {service.isPaid && (
              <span className="text-green text-[11px] font-body-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span> 
                {t('paid')} <b>{formatInr(service.paidAmount)}</b> on {formatDate(service.paidDate)}  
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {service.isPaid && (
            <button 
              className="px-3 py-1.5 bg-primary-dim/15 hover:bg-primary-dim/30 border border-primary-glow text-primary font-body-bold text-[11px] rounded-full transition-all cursor-pointer" 
              onClick={(e) => { e.stopPropagation(); handlePayClick(e); }}
            >
              Pay more
            </button>
          )}

          {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
            <div 
              className="bg-white border border-border-medium rounded-lg p-1 hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer relative z-10 shadow-sm"
              onClick={(e) => { e.stopPropagation(); onShowQR?.(service); }} 
              title={t('show_qr')}
            >
              <QRCodeSVG value={generateAPSPDCLUpiString(service) || ''} size={42} level="L" includeMargin={false} />
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Metrics ── */}
      {(cardStyle === 'rich' || isExpanded) && (
        <div 
          className={`grid grid-cols-3 gap-2 py-2 border-t border-border-subtle relative z-10 ${
            useAccordion ? 'cursor-pointer' : ''
          }`}
          onClick={useAccordion ? () => setIsExpanded(!isExpanded) : undefined}
        >
          <div className="flex flex-col">
            <span className="font-label-caps text-[9px] text-text-muted uppercase tracking-wider mb-0.5">{t('units')}</span>
            <span className="font-mono-data text-xs text-on-surface font-semibold">
              {service.lastBilledUnits == null ? '—' : Number(service.lastBilledUnits).toLocaleString('en-IN')}
              <span className="text-[10px] text-text-muted ml-0.5">u</span>
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-caps text-[9px] text-text-muted uppercase tracking-wider mb-0.5">{t('bill_date')}</span>
            <span className="font-body-bold text-xs text-on-surface truncate">{formatDate(service.lastBillDate)}</span>
          </div>
          <div 
            ref={metricsUpdateRef} 
            className="flex flex-col cursor-pointer relative"
            onClick={(e) => { e.stopPropagation(); setShowUpdateInfoMetrics(!showUpdateInfoMetrics); }}
          >
            <span className="font-label-caps text-[9px] text-text-muted uppercase tracking-wider mb-0.5">{t('last_updated')}</span>
            <span className="font-body-bold text-xs text-on-surface flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[12px] text-text-muted">schedule</span>
              {fromNow(service.lastFetchedAt)}
            </span>
            {showUpdateInfoMetrics && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface p-2 rounded-lg shadow-lg border border-border-medium z-50 text-[10px] font-mono-data whitespace-nowrap">
                 Updated: {formatDateTime(service.lastFetchedAt)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick History Chips ── */}
      {(cardStyle === 'rich' || isExpanded) && Array.isArray(service.lastThreeAmounts) && service.lastThreeAmounts.length > 0 && (
        <div className="flex gap-2 relative z-10 pt-1">
          {service.lastThreeAmounts.map((b, i) => {
            const date = new Date(b.paidDate || b.billDate);
            const label = `${MO[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
            return (
              <div key={i} className="flex-1 p-2 bg-surface-container-low border border-border-subtle rounded-xl flex flex-col text-center shadow-xs">
                <span className="font-label-caps text-[9px] text-text-muted tracking-wider">{label}</span>
                <b className="font-mono-data text-xs text-on-surface mt-0.5">{formatInr(b.billAmount)}</b>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="flex justify-between items-center w-full pt-2 border-t border-border-subtle relative z-20" onClick={e => e.stopPropagation()}>
        <div>
          <button 
            className="flex items-center gap-1 px-3 py-1.5 bg-surface-card hover:bg-surface-container-low transition-colors border border-border-medium rounded-lg text-xs font-body-bold text-text-secondary cursor-pointer disabled:opacity-50"
            onClick={handleRefreshClick} 
            disabled={refreshing || isOffline}
            title={isOffline ? 'Offline' : ''}
          >
            {refreshing ? (
              <Loader size={12} />
            ) : (
              <span className="material-symbols-outlined text-[16px]">
                {isOffline ? 'wifi_off' : 'sync'}
              </span>
            )}
            <span>{t('refresh')}</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 ? (
            <>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-medium hover:bg-surface-container-low text-text-secondary cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onCalculateBill?.(service); }}
                title="Calculator"
                aria-label="Calculator"
                disabled={refreshing}
              >
                <span className="material-symbols-outlined text-[18px]">calculate</span>
              </button>
              <button 
                className="px-3.5 py-1.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-lg font-body-bold text-xs shadow-sm shadow-primary/10 cursor-pointer disabled:opacity-50"
                onClick={handlePayClick} 
                aria-label={t('pay_now')}
                disabled={isOffline || refreshing}
              >
                {t('pay_now')}
              </button>
            </>
          ) : (
            <>
              <button 
                className="flex items-center gap-1 px-3 py-1.5 bg-surface-card hover:bg-surface-container-low transition-colors border border-border-medium rounded-lg text-xs font-body-bold text-text-secondary cursor-pointer disabled:opacity-50"
                onClick={(e) => { e.stopPropagation(); onShowQR?.(service); }}
                aria-label={t('show_qr')}
                disabled={refreshing}
              >      
                <span className="material-symbols-outlined text-[16px]">qr_code</span>
                <span>QR</span>
              </button>
              <button 
                className="flex items-center gap-1 px-3 py-1.5 bg-surface-card hover:bg-surface-container-low transition-colors border border-border-medium rounded-lg text-xs font-body-bold text-text-secondary cursor-pointer disabled:opacity-50"
                onClick={(e) => { e.stopPropagation(); onCalculateBill?.(service); }}
                aria-label={t('calculate_next_bill')}
                disabled={refreshing}
              >
                <span className="material-symbols-outlined text-[16px]">calculate</span>
                <span>{t('calculate_next_bill')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Expanded Body ── */}
      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[3000px] opacity-100 mt-2' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="flex flex-col gap-0 border border-border-subtle rounded-xl overflow-hidden bg-surface shadow-inner">
          {insights && (
            <Section title="Consumption Insights" defaultOpen={false} isExpanded={isExpanded}>
              <div className="flex flex-col gap-2">
                 {insights.vsLastMonth?.amountPct > 5 && (
                   <div className="p-3 bg-amber-dim/10 border border-amber/20 rounded-xl flex items-start gap-2 text-amber text-xs leading-normal">
                     <span className="material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0">lightbulb</span>
                     <span><b>High bill detected (+{insights.vsLastMonth.amountPct}%).</b> Setting your AC to 24°C instead of 18°C can save up to 24% on cooling costs.</span>
                   </div>
                 )}
                 <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Units Vs Last Month</span>
                    <TrendBadge value={insights.vsLastMonth?.units} unit="u" percent={insights.vsLastMonth?.unitsPct} />        
                 </div>
                 {insights.vsLastMonth?.amount != null && (
                   <div className="flex justify-between items-center text-xs">
                      <span className="text-text-secondary">Amount Vs Last Month</span>
                      <TrendBadge value={insights.vsLastMonth.amount} unit="₹" percent={insights.vsLastMonth.amountPct} />    
                   </div>
                 )}
                 {insights.vsSameMonthLastYear && (
                   <>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-text-secondary">Units Vs Last Year</span>
                        <TrendBadge value={insights.vsSameMonthLastYear.units} unit="u" percent={insights.vsSameMonthLastYear.unitsPct} />
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-text-secondary">Amount Vs Last Year</span>
                        <TrendBadge value={insights.vsSameMonthLastYear.amount} unit="₹" percent={insights.vsSameMonthLastYear.amountPct} />
                     </div>
                   </>
                 )}
                 <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">{t('avg_mo')}</span>
                    <b className="font-mono-data text-on-surface">{formatInr(insights.avgAmount)}</b>
                 </div>
                 {currentYearTotalPaid && (
                   <div className="flex justify-between items-center text-xs">
                      <span className="text-text-secondary">Total Paid ({currentYearTotalPaid.label})</span>
                      <b className="font-mono-data text-on-surface">{formatInr(currentYearTotalPaid.total)}</b>
                   </div>
                 )}
                 <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Avg Units (Last 6m)</span>
                    <b className="font-mono-data text-on-surface">{insights.avgUnits6m?.toLocaleString('en-IN') || '—'} u</b>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">Avg Units (Last 12m)</span>
                    <b className="font-mono-data text-on-surface">{insights.avgUnits12m?.toLocaleString('en-IN') || '—'} u</b>
                 </div>
                 {service.lastBilledUnits > 0 && (
                   <div className="flex justify-between items-center text-xs pt-2 border-t border-dashed border-border-medium mt-1">
                      <span className="font-body-bold text-text-secondary">Effective Rate (This Month)</span>
                      <b className="font-mono-data text-on-surface">₹{((service.lastAmountDue || service.paidAmount || 0) / service.lastBilledUnits).toFixed(2)}/u</b>
                  </div>
                 )}

                 <button 
                   className="flex items-center justify-center gap-1.5 w-full mt-3 py-2 border border-dashed border-primary/40 hover:bg-primary-dim/10 rounded-xl text-xs font-body-bold text-primary transition-all cursor-pointer"
                   onClick={(e) => { e.stopPropagation(); onShareReport?.(); }}
                 >
                   <span className="material-symbols-outlined text-[16px]">description</span>
                   Share Monthly Usage Report
                 </button>
              </div>
            </Section>
          )}

          {breakup && (
            <Section title={t('bill_breakup')} badge={formatInr(breakup.netDue ?? breakup.grossTotal ?? 0)} isExpanded={isExpanded}>
              <BreakupPanel breakup={breakup} isPaid={service.isPaid} paidAmount={service.paidAmount} t={t} />
            </Section>
          )}

          {service.trendData?.length > 0 && (
            <Section title={t('trends')} isExpanded={isExpanded}>
              <TrendPanel data={service.trendData} insights={insights} t={t} />
            </Section>
          )}

          <Section
            title={<span className="flex items-center">{streakEmoji}{t('payment_history')}</span>}
            badge={isHistoryError ? <span className="flex items-center gap-1 text-red text-xs"><span className="material-symbols-outlined text-[14px]">warning</span> Sync Error</span> : `${(service.paymentHistory?.length > 0 ? service.paymentHistory.length : (service.billHistory?.filter(b => b.isPaid).length || 0))}`}
            isExpanded={isExpanded}
          >
            {isHistoryError ? (
              <div className="p-3 bg-red-dim/10 border border-red/20 rounded-xl flex items-center gap-2 text-xs text-red">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                {t('history_unavailable')}
              </div>
            ) : (service.paymentHistory?.length > 0 || service.billHistory?.some(b => b.isPaid)) ? (
               <PaymentsPanel service={service} t={t} />
            ) : (
              <div className="p-5 text-center text-text-muted text-xs">
                <span className="material-symbols-outlined text-[18px] text-text-muted mb-1 block mx-auto">info</span>
                {t('no_records_found')}
              </div>
            )}
          </Section>

          {/* ── Meter Reading Log (Feature 7) ── */}
          <Section 
            title="Meter Reading Log" 
            isExpanded={isExpanded}
            badge={meterLogCount > 0 ? meterLogCount : null}
          >
            <div className="flex flex-col gap-2">
              <MeterReadingLog service={service} />
            </div>
          </Section>

          {/* ── Budget Goal (Feature 3) ── */}
          <Section title="Budget Goal" isExpanded={isExpanded}>
            <div className="flex flex-col gap-2">
              <BudgetGoal service={service} />
            </div>
          </Section>

          {/* ── Cost Split Tracker (Feature 8) ── */}
          <Section title="Split Bill" isExpanded={isExpanded}>
            <div className="flex flex-col gap-2">
              <CostSplitTracker service={service} />
            </div>
          </Section>
        </div>
      </div>
    </article>
  );
}

function BreakupPanel({ breakup, isPaid, paidAmount, t }) {
  const rows = [
    { label: t('energy_charges', 'Energy Charges'), key: 'ec', color: '#6366f1' },
    { label: t('fixed_charges', 'Fixed Charges'), key: 'fixchg', color: '#06b6d4' },
    { label: t('customer_charges', 'Customer Charges'), key: 'cc', color: '#f59e0b' },
    { label: t('electricity_duty', 'Electricity Duty'), key: 'ed', color: '#10b981' },
    { label: t('fuel_surcharge', 'Fuel Surcharge'), key: 'fsa', color: '#8b5cf6' },
  ];
  const total = breakup.grossTotal || 1;
  return (
    <div className="flex flex-col gap-2">
      {/* Visual Weight Bar */}
      <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
        {rows.map(r => {
          const val = breakup[r.key] || 0;
          if (val <= 0) return null;
          return (
            <div 
              key={r.key} 
              className="h-full first:rounded-l-full last:rounded-r-full" 
              style={{ width: `${(val / total) * 100}%`, backgroundColor: r.color }} 
              title={`${r.label}: ${formatInr(val)}`} 
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5 mt-2">
        {rows.map(r => (
          <div key={r.key} className="flex justify-between items-center text-xs">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
            <b className="font-mono-data text-on-surface">{formatInr(breakup[r.key] || 0)}</b>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-border-medium my-2" />
      
      <div className="flex justify-between items-center text-xs">
        <span className="text-text-secondary">{t('gross_total')}</span>
        <b className="font-mono-data text-on-surface">{formatInr(breakup.grossTotal || 0)}</b>
      </div>

      {breakup.isd !== 0 && breakup.isd != null && (
        <div className="flex justify-between items-center text-xs">
          <span className="text-text-secondary">{t('isd')}</span>
          <b className="font-mono-data" style={{ color: breakup.isd < 0 ? 'var(--green)' : 'inherit' }}>{formatInr(breakup.isd)}</b>
        </div>
      )}

      {breakup.arrearsTotal > 0 && (
        <>
          <div className="border-t border-dashed border-border-medium my-1.5" />
          {Array.isArray(breakup.arrears) && breakup.arrears.map((a, i) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1 text-green">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                {a.receiptNo || `Payment ${i + 1}`}
                <small className="text-text-muted ml-1">({formatDate(a.date)})</small>
              </span>
              <b className="font-mono-data text-green">−{formatInr(a.amount)}</b>
            </div>
          ))}
          <div className="flex justify-between items-center text-xs">
            <span className="text-text-secondary">{t('total_arrears')}</span>
            <b className="font-mono-data text-green">−{formatInr(breakup.arrearsTotal)}</b>
          </div>
        </>
      )}

      {isPaid && paidAmount != null && (
        <div className="flex justify-between items-center text-xs">
          <span className="flex items-center gap-1 text-green">
            <span className="material-symbols-outlined text-[14px]">check_circle</span> {t('paid_amount')}
          </span>
          <b className="font-mono-data text-green">−{formatInr(paidAmount)}</b>
        </div>
      )}

      <div className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-surface-container-low mt-2 border border-border-subtle">
        <span className="font-body-bold text-on-surface">{t('net_due')}</span>
        <b className="font-mono-data text-primary text-[14px]">{formatInr(isPaid ? 0 : (breakup.netDue ?? breakup.grossTotal ?? 0))}</b>
      </div>
    </div>
  );
}

function TrendPanel({ data, insights, t }) {
  const [view, setView] = useState('amount');
  const chartData = data.map(d => {
    const [yr, mo] = d.month.split('-');
    return { ...d, label: `${MO[+mo - 1]}'${yr.slice(2)}` };
  });

  const seasonalInsight = useMemo(() => {
    if (!data || data.length < 12) return null;
    let summerSum = 0, summerCount = 0;
    let otherSum = 0, otherCount = 0;
    
    data.forEach(d => {
      const mo = parseInt(d.month.split('-')[1], 10);
      const amt = Number(d.billAmount || 0);
      if (mo >= 4 && mo <= 6) { summerSum += amt; summerCount++; }
      else { otherSum += amt; otherCount++; }
    });
    
    if (summerCount === 0 || otherCount === 0) return null;
    const summerAvg = summerSum / summerCount;
    const otherAvg = otherSum / otherCount;
    
    if (summerAvg > otherAvg * 1.15) {
      const pct = Math.round(((summerAvg - otherAvg) / otherAvg) * 100);
      return { type: 'summer', pct, avg: summerAvg };
    }
    return null;
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-body-bold text-text-muted">{t('18_month_trend')}</span>
        <div className="flex bg-surface-container rounded-full p-0.5 border border-border-medium">
          {['amount', 'units', 'combo'].map(v => (
            <button 
              key={v} 
              className={`px-2.5 py-0.5 text-[10px] font-label-caps rounded-full transition-all duration-150 cursor-pointer ${
                view === v 
                  ? 'bg-white shadow-sm text-primary font-bold' 
                  : 'text-text-muted hover:text-on-surface'
              }`}
              onClick={() => setView(v)}
            >
              {v === 'amount' ? '₹' : v === 'units' ? 'U' : t('both')}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<div className="flex items-center justify-center h-[150px]"><Loader size={16} /></div>}>
        <TrendChart chartData={chartData} view={view} insights={insights} />
      </Suspense>

      {insights && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="p-2 bg-red-dim/10 border border-red/20 rounded-xl flex flex-col text-center">
            <span className="text-[10px] uppercase font-label-caps text-text-muted mb-0.5">{t('highest')}</span>
            <b className="font-mono-data text-red text-xs">{formatInr(insights.maxAmount)}</b>
            <small className="text-[10px] text-text-muted mt-0.5">{fmtMonth(insights.maxAmountMonth)}</small>
          </div>
          <div className="p-2 bg-green-dim/10 border border-green/20 rounded-xl flex flex-col text-center">
            <span className="text-[10px] uppercase font-label-caps text-text-muted mb-0.5">{t('lowest')}</span>
            <b className="font-mono-data text-green text-xs">{formatInr(insights.minAmount)}</b>
            <small className="text-[10px] text-text-muted mt-0.5">{fmtMonth(insights.minAmountMonth)}</small>
          </div>
          {insights.predictedNextBill && (
            <div className="p-2 bg-primary-dim/10 border border-primary/20 rounded-xl flex flex-col text-center">
              <span className="text-[10px] uppercase font-label-caps text-text-muted mb-0.5">{t('next_est')}</span>
              <b className="font-mono-data text-primary text-xs">~{formatInr(insights.predictedNextBill)}</b>
              <small className="text-[10px] text-text-muted mt-0.5">{insights.predictedBasis || 'Seasonal'}</small>
            </div>
          )}
        </div>
      )}

      {seasonalInsight && (
        <div className="p-3 bg-amber-dim/10 border border-amber/20 rounded-xl flex items-start gap-2.5 mt-2">
          <span className="material-symbols-outlined text-amber text-[20px] mt-0.5 flex-shrink-0">light_mode</span>
          <div>
            <h4 className="font-body-bold text-[12px] text-amber">Summer Pattern Detected</h4>
            <p className="text-xs text-on-surface leading-normal mt-0.5">
              Your Apr–Jun bills average <b className="font-mono-data">{formatInr(seasonalInsight.avg)}</b> — which is <b className="text-amber">{seasonalInsight.pct}% higher</b> than the rest of the year.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsPanel({ service, t }) {
  const history = useMemo(() => {
    if (service.paymentHistory && service.paymentHistory.length > 0) {
      return service.paymentHistory.map(p => ({
        date: p.date,
        amount: p.amount,
        receiptNo: p.receiptNo,
        counter: p.counter,
        status: 'paid',
        label: p.counter
      })).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
    }
    
    const bh = (service.billHistory || []).filter(b => b.isPaid);
    if (bh.length > 0) {
      return bh.map(b => ({
        date: b.paidDate || b.billDate,
        amount: b.billAmount,
        receiptNo: b.receiptNumber || '—',
        counter: 'APSPDCL',
        status: 'paid',
        label: b.billDate ? new Date(b.billDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—'
      })).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
    }

    return [];
  }, [service.paymentHistory, service.billHistory]);

  if (history.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {history.map((p, i) => (
        <div key={i} className="flex justify-between items-center gap-3 text-xs p-2 hover:bg-surface-container rounded-lg border border-border-subtle">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-green text-[18px]">check_circle</span>
            <span className="text-[11px] text-text-secondary">{formatDate(p.date)}</span>
          </div>
          <span className="font-mono-data text-[11px] text-text-muted truncate max-w-[100px]" title={p.receiptNo || '—'}>
            {p.receiptNo || '—'}
          </span>
          <span className="font-body-base text-[11px] text-text-muted max-w-[100px] truncate">
            {p.counter || '—'}
          </span>
          <b className="font-mono-data text-on-surface">{formatInr(p.amount)}</b>
        </div>
      ))}
    </div>
  );
}
