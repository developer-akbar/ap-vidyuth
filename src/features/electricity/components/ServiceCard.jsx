import { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import {
  FiCopy, FiExternalLink, FiMoreVertical,
  FiEdit2, FiTrash2, FiChevronDown, FiTrendingUp, FiTrendingDown,
  FiCalendar, FiCheckCircle, FiAlertTriangle, FiZap, FiInfo, FiClock, FiAlertCircle, FiShare2, FiFileText, FiXCircle
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

// ── Lazy Components ──────────────────────────────────────────────────────────
const TrendChart = lazy(() => import('./TrendChart.jsx').then(m => ({ default: m.TrendChart })));

// ── Helpers ────────────────────────────────────────────────────────────────────

function TrendBadge({ value, unit = '', percent }) {
  if (value == null) return null;
  const up = value > 0, zero = value === 0;
  const label = zero ? 'Same'
    : `${up ? '+' : ''}${unit === '₹' ? formatInr(Math.abs(value)) : `${Math.abs(value).toLocaleString('en-IN')} ${unit}`}`;    
  return (
    <span className={`tbadge tbadge--${zero ? 'flat' : up ? 'up' : 'dn'}`}>
      {!zero && (up ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />)}
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
    <div className={`acc ${open ? 'acc--open' : ''}`}>
      <button className="acc__head" onClick={() => setOpen(v => !v)}>
        <span className="acc__title">{title}</span>
        <div className="acc__right">
          {badge && <span className="acc__badge">{badge}</span>}
          <FiChevronDown size={14} className="acc__chevron" />
        </div>
      </button>
      {open && <div className="acc__body">{children}</div>}
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

    // Only consider bills from the current year up to the current month
    const paymentsThisYear = service.billHistory.filter(ph => {
      const d = new Date(ph.billDate);
      return d.getFullYear() === currentYear && d.getMonth() <= currentMonth;
    });
    
    if (!paymentsThisYear.length) return null;

    const total = paymentsThisYear.reduce((sum, ph) => sum + Number(ph.billAmount || 0), 0);
    
    // Determine the end month for the label
    // Use the latest bill month from history for this year.
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
      className={`scard scard--${status.toLowerCase()} ${menuOpen ? 'scard--menu-open' : ''} ${selected ? 'scard--selected' : ''} ${isFlashing ? 'flash' : ''} ${isExpanded ? 'scard--expanded' : ''}`}
      onContextMenu={e => { if (longPressTimer.current || selecting) e.preventDefault(); }}
      style={{ overflow: 'visible' }}
    >
      {selecting && (
        <div
          className="scard__select-overlay"
          onClick={e => { e.stopPropagation(); onToggleSelect(service.id); }}
          style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'pointer' }}
        />
      )}

      {/* ── Header ────────────────────────────────────────────────────────────────── */}
      <header className="scard__header"
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onMouseMove={handlePressMove}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchMove={handlePressMove}
      >
        <div className="scard__identity">
          {selecting && (
            <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', marginRight: '8px' }}>
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect(service.id)}
                onClick={e => e.stopPropagation()}
                style={{ width: '18px', height: '18px', margin: 0, padding: 0 }}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div className={`scard__status-dot scard__status-dot--${status.toLowerCase()}`} />
            {service.pinned && <BsPinFill size={12} style={{ color: 'var(--primary-hi)', transform: 'rotate(45deg)' }} />}        
          </div>
          <div className="scard__identity-text">
            <h2 className="scard__name" title={service.customerName}>{service.label || service.customerName || t('untitled')}</h2>
            <div className="scard__num-row">
              <span className="scard__num">{service.serviceNumber}</span>
              <button
                className="icon-btn-micro"
                onClick={(e) => { e.stopPropagation(); copyNum(); }}
                title={t('copy')}
                aria-label={t('copy')}
                style={{ position: 'relative', zIndex: 10 }}
              >
                <FiCopy size={12} />
              </button>
              <button
                className="icon-btn-micro"
                onClick={(e) => { e.stopPropagation(); onShare?.(); }}
                title="Share Status"
                aria-label="Share Status"
                style={{ position: 'relative', zIndex: 10, marginLeft: '4px' }}
              >
                <FiShare2 size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="scard__header-right" style={{ position: 'relative', zIndex: 30 }}>
          {cardStyle === 'classic' && (
            <div
              ref={headUpdateRef}
              className="scard__updated-at"
              title={formatDateTime(service.lastFetchedAt)}
              onClick={(e) => { e.stopPropagation(); setShowUpdateInfoHead(!showUpdateInfoHead); }}
              style={{ fontSize: '10px', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <FiClock size={11} /> {fromNow(service.lastFetchedAt)}
            </div>
          )}
          {showUpdateInfoHead && cardStyle === 'classic' && (
            <div className="popover" style={{ position: 'absolute', top: '30px', right: '40px', width: 'max-content', zIndex: 110, padding: '8px 12px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
               Updated: {formatDateTime(service.lastFetchedAt)}
            </div>
          )}

          <span className={`soft-badge soft-badge--${status.toLowerCase()}`}>{t(`filter_${status.toLowerCase()}`, status.replace('_', ' '))}</span>
          <div className="scard__menu-wrap">
            <button 
              className="icon-btn-ghost" 
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }} 
              onBlur={() => setTimeout(() => setMenuOpen(false), 200)}
              aria-label={t('more_options', 'More options')}
            >
              <FiMoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="popover" onMouseDown={e => e.stopPropagation()} style={{ zIndex: 100 }}>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onTogglePin(); }}>
                  {service.pinned ? <BsPinFill size={13} /> : <BsPin size={13} />} {service.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}><FiEdit2 size={13} /> Edit</button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onShowQR?.(service); }}>
                  <BsQrCode size={13} /> Show QR Code
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onCalculateBill?.(service); }}>
                  <LuCalculator size={13} /> {t('calculate_next_bill')}
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onShareReport?.(); }}>
                  <FiFileText size={13} /> Share Report
                </button>
                <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onAbout(); }}><FiInfo size={13} /> {t('about_service')}</button>
                <button className="danger" onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}><FiTrash2 size={13} /> Trash</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero / Amount ────────────────────────────────────────────────────────────────── */}
      <div className="scard__hero-main" onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="scard__hero-content" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <p className="scard__hero-label">{t('amount_due')}</p>
              <div className="scard__hero-val">
                <h2 className="scard__hero-amount">
                  {status === 'DUE' ? formatInr(service.lastAmountDue) : '₹0'}
                </h2>
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '20px', height: '20px', borderRadius: '50%',
              background: 'var(--surface-3)', border: '1px solid var(--border)',
              color: 'var(--text-1)', flexShrink: 0
            }}>
              <FiChevronDown size={22} style={{ transition: 'transform 0.3s ease', transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
            </div>
          </div>
          <div className="scard__hero-meta" style={{ marginTop: '8px' }}>
            {insights?.vsLastMonth && (
              <div style={{marginBottom: '4px'}}>
                 <TrendBadge value={insights?.vsLastMonth.amount} unit="₹" percent={insights?.vsLastMonth.amountPct} />
              </div>
            )}
            {dueCopy && !service.isPaid && <span className={`text-${dueTone}`}>{dueCopy} ({formatDate(service.lastDueDate)})</span>}
            {service.isPaid && (
              <span className="text-green" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FiCheckCircle size={12} /> {t('paid')} <b>{formatInr(service.paidAmount)}</b> on {formatDate(service.paidDate)}  
              </span>
            )}
          </div>
        </div>
        {service.isPaid && (
          <button 
            className="btn-pay-more" 
            onClick={(e) => { e.stopPropagation(); handlePayClick(e); }}
            style={{
              fontSize: '11px', fontWeight: '700', color: 'var(--primary)',
              background: 'var(--primary-dim)', border: '1px solid var(--primary-glow)',
              padding: '6px 10px', borderRadius: '14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            Pay more
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 && (
            <div className="scard__hero-qr" onClick={(e) => { e.stopPropagation(); onShowQR?.(service); }} title={t('show_qr')} style={{ position: 'relative', zIndex: 10 }}>
              <QRCodeSVG value={generateAPSPDCLUpiString(service) || ''} size={44} level="L" includeMargin={false} />
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Metrics (Visible when collapsed in rich mode, or always when expanded) ── */}
      {(cardStyle === 'rich' || isExpanded) && (
        <div className="scard__quick-metrics" onClick={useAccordion ? () => setIsExpanded(!isExpanded) : undefined} style={{ cursor: useAccordion ? 'pointer' : 'default', paddingBottom: (service.lastThreeAmounts?.length > 0) ? '8px' : '14px' }}>
          <div className="qm-item">
            <span className="qm-label">{t('units')}</span>
            <span className="qm-val">
              {service.lastBilledUnits == null ? '—' : Number(service.lastBilledUnits).toLocaleString('en-IN')}
              <span style={{fontSize: '9px', fontWeight: '500', marginLeft:'2px', color: 'var(--text-3)'}}>u</span>
            </span>
          </div>
          <div className="qm-item">
            <span className="qm-label">{t('bill_date')}</span>
            <span className="qm-val">{formatDate(service.lastBillDate)}</span>
          </div>
          <div ref={metricsUpdateRef} className="qm-item" onClick={(e) => { e.stopPropagation(); setShowUpdateInfoMetrics(!showUpdateInfoMetrics); }} style={{ cursor: 'pointer', position: 'relative' }}>
            <span className="qm-label">{t('last_updated')}</span>
            <span className="qm-val" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FiClock size={11} /> {fromNow(service.lastFetchedAt)}
            </span>
            {showUpdateInfoMetrics && (
              <div className="popover" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px', width: 'max-content', zIndex: 110, padding: '8px 12px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                 Updated: {formatDateTime(service.lastFetchedAt)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick History Chips ── */}
      {(cardStyle === 'rich' || isExpanded) && Array.isArray(service.lastThreeAmounts) && service.lastThreeAmounts.length > 0 && (
        <div className="scard__chips" style={{ borderTop: 'none' }}>
          {service.lastThreeAmounts.map((b, i) => {
            const date = new Date(b.paidDate || b.billDate);
            const label = `${MO[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
            return (
              <div key={i} className="chip" style={{ minWidth: 'auto', flex: '1', padding: '4px 8px' }}>
                <span style={{ fontSize: '9px' }}>{label}</span>
                <b style={{ fontSize: '11px' }}>{formatInr(b.billAmount)}</b>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="scard__action-bar" onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 20 }}>
        <div className="scard__action-left">
          <button 
            className="btn-ghost-sm" 
            onClick={handleRefreshClick} 
            disabled={refreshing || isOffline}
            aria-label={t('refresh')}
            style={isOffline ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            title={isOffline ? 'Offline' : ''}
          >
            {refreshing ? <Loader size={14} /> : (isOffline ? <FiWifiOff size={14} /> : <FiClock size={14} />)} {t('refresh')}
          </button>
        </div>
        <div className="scard__action-right">
          {status === 'DUE' && Number(service.lastAmountDue || 0) > 0 ? (
            <>
              <button
                className="btn btn--secondary btn--sm"
                onClick={(e) => { e.stopPropagation(); onCalculateBill?.(service); }}
                title="Calculator"
                aria-label="Calculator"
              >
                <LuCalculator size={14} />
              </button>
              <button 
                className="btn btn--pay btn--sm" 
                onClick={handlePayClick} 
                aria-label={t('pay_now')}
                disabled={isOffline}
                style={isOffline ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                {t('pay_now')}
              </button>
            </>
          ) : (
            <>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={(e) => { e.stopPropagation(); onShowQR?.(service); }}
                aria-label={t('show_qr')}
              >      
                <BsQrCode size={14} /> <span className="hide-mobile-sm" style={{marginLeft:'4px'}}>QR</span>
              </button>
              <button 
                className="btn btn--secondary btn--sm" 
                onClick={(e) => { e.stopPropagation(); onCalculateBill?.(service); }}
                aria-label={t('calculate_next_bill')}
              >
                <LuCalculator size={14} /> <span className="hide-mobile-sm" style={{marginLeft:'4px'}}>{t('calculate_next_bill')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Expanded Body ── */}
      <div className={`scard__body ${isExpanded ? 'scard__body--expanded' : ''}`}>
        <div className="scard__body-inner" key={isExpanded ? 'exp' : 'col'}>
          {insights && (
            <Section title="Consumption Insights" defaultOpen={false} isExpanded={isExpanded}>
              <div style={{ padding: '0 10px' }}>
                 {insights.vsLastMonth?.amountPct > 5 && (
                   <div style={{ margin: '0 0 12px', background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid var(--amber)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                     <FiZap size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                     <span style={{ fontSize: '11px', lineHeight: 1.4 }}><b>High bill detected (+{insights.vsLastMonth.amountPct}%).</b> Setting your AC to 24°C instead of 18°C can save up to 24% on cooling costs.</span>
                   </div>
                 )}
                 <div className="receipt-row">
                    <span className="receipt-row__label">Units Vs Last Month</span>
                    <TrendBadge value={insights.vsLastMonth?.units} unit="u" percent={insights.vsLastMonth?.unitsPct} />        
                 </div>
                 {insights.vsLastMonth?.amount != null && (
                   <div className="receipt-row">
                      <span className="receipt-row__label">Amount Vs Last Month</span>
                      <TrendBadge value={insights.vsLastMonth.amount} unit="₹" percent={insights.vsLastMonth.amountPct} />    
                   </div>
                 )}
                 {insights.vsSameMonthLastYear && (
                   <>
                     <div className="receipt-row">
                        <span className="receipt-row__label">Units Vs Last Year</span>
                        <TrendBadge value={insights.vsSameMonthLastYear.units} unit="u" percent={insights.vsSameMonthLastYear.unitsPct} />
                     </div>
                     <div className="receipt-row">
                        <span className="receipt-row__label">Amount Vs Last Year</span>
                        <TrendBadge value={insights.vsSameMonthLastYear.amount} unit="₹" percent={insights.vsSameMonthLastYear.amountPct} />
                     </div>
                   </>
                 )}
                 <div className="receipt-row">
                    <span className="receipt-row__label">{t('avg_mo')}</span>
                    <b className="receipt-row__val">{formatInr(insights.avgAmount)}</b>
                 </div>
                 {currentYearTotalPaid && (
                   <div className="receipt-row">
                      <span className="receipt-row__label">Total Paid ({currentYearTotalPaid.label})</span>
                      <b className="receipt-row__val">{formatInr(currentYearTotalPaid.total)}</b>
                   </div>
                 )}
                 <div className="receipt-row">
                    <span className="receipt-row__label">Avg Units (Last 6m)</span>
                    <b className="receipt-row__val">{insights.avgUnits6m?.toLocaleString('en-IN') || '—'} u</b>
                 </div>
                 <div className="receipt-row">
                    <span className="receipt-row__label">Avg Units (Last 12m)</span>
                    <b className="receipt-row__val">{insights.avgUnits12m?.toLocaleString('en-IN') || '—'} u</b>
                 </div>
                 {service.lastBilledUnits > 0 && (
                   <div className="receipt-row" style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed var(--border-md)' }}>
                      <span className="receipt-row__label">Effective Rate (This Month)</span>
                      <b className="receipt-row__val">₹{((service.lastAmountDue || service.paidAmount || 0) / service.lastBilledUnits).toFixed(2)}/u</b>
                   </div>
                 )}

                 <button 
                   className="btn btn--ghost btn--sm" 
                   style={{ width: '100%', marginTop: '16px', justifyContent: 'center', border: '1px dashed var(--primary-glow)', color: 'var(--primary-hi)' }}
                   onClick={(e) => { e.stopPropagation(); onShareReport?.(); }}
                 >
                   <FiFileText size={14} style={{ marginRight: '6px' }} />
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
            title={<span style={{ display: 'flex', alignItems: 'center' }}>{streakEmoji}{t('payment_history')}</span>}
            badge={isHistoryError ? <span style={{display:'flex', alignItems:'center', gap: '4px'}}><FiAlertTriangle size={12}/> Sync Error</span> : `${(service.paymentHistory?.length > 0 ? service.paymentHistory.length : (service.billHistory?.filter(b => b.isPaid).length || 0))}`}
            isExpanded={isExpanded}
          >
            {isHistoryError ? (
              <div className="scard__error" style={{ margin: '8px 10px' }}>
                <FiAlertTriangle size={12} />
                {t('history_unavailable')}
              </div>
            ) : (service.paymentHistory?.length > 0 || service.billHistory?.some(b => b.isPaid)) ? (
              <PaymentsPanel service={service} t={t} />
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                <FiInfo size={14} style={{ marginBottom: '4px', display: 'block', margin: '0 auto 4px' }} />
                {t('no_records_found')}
              </div>
            )}
          </Section>

          {/* ── Budget Goal (Feature 3) ── */}
          <Section title="Budget Goal" isExpanded={isExpanded}>
            <div style={{ padding: '0 10px 10px' }}>
              <BudgetGoal service={service} />
            </div>
          </Section>

          {/* ── Meter Reading Log (Feature 7) ── */}
          <Section title="Meter Reading Log" isExpanded={isExpanded}>
            <div style={{ padding: '0 10px 10px' }}>
              <MeterReadingLog service={service} />
            </div>
          </Section>

          {/* ── Cost Split Tracker (Feature 8) ── */}
          <Section title="Split Bill" isExpanded={isExpanded}>
            <div style={{ padding: '0 10px 10px' }}>
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
    <div className="bp">
      <div className="bp__bar">
        {rows.map(r => (
          <div key={r.key} className="bp__seg" style={{ flex: breakup[r.key] / total, background: r.color }} title={r.label} />   
        ))}
      </div>

      {rows.map(r => (
        <div key={r.key} className="receipt-row">
          <span className="receipt-row__label">
            <span className="bp__dot" style={{ background: r.color }} />
            {r.label}
          </span>
          <b className="receipt-row__val">{formatInr(breakup[r.key] || 0)}</b>
        </div>
      ))}

      <div style={{ borderTop: '1px dashed var(--border-md)', margin: '8px 0' }} />
      <div className="receipt-row">
        <span className="receipt-row__label">{t('gross_total')}</span>
        <b className="receipt-row__val">{formatInr(breakup.grossTotal || 0)}</b>
      </div>

      {breakup.isd !== 0 && breakup.isd != null && (
        <div className="receipt-row">
          <span className="receipt-row__label">{t('isd')}</span>
          <b className="receipt-row__val" style={{ color: breakup.isd < 0 ? 'var(--green)' : 'inherit' }}>{formatInr(breakup.isd)}</b>
        </div>
      )}

      {breakup.arrearsTotal > 0 && (
        <>
          <div style={{ borderTop: '1px dashed var(--border-md)', margin: '8px 0' }} />
          {Array.isArray(breakup.arrears) && breakup.arrears.map((a, i) => (
            <div key={i} className="receipt-row">
              <span className="receipt-row__label">
                <FiCheckCircle size={12} color="var(--green)" />
                {a.receiptNo || `Payment ${i + 1}`}
                <small style={{fontWeight:'normal', marginLeft: '4px'}}>({formatDate(a.date)})</small>
              </span>
              <b className="receipt-row__val credit">−{formatInr(a.amount)}</b>
            </div>
          ))}
          <div className="receipt-row">
            <span className="receipt-row__label">{t('total_arrears')}</span>
            <b className="receipt-row__val credit">−{formatInr(breakup.arrearsTotal)}</b>
          </div>
        </>
      )}

      {isPaid && paidAmount != null && (
        <div className="receipt-row">
          <span className="receipt-row__label">
            <FiCheckCircle size={12} color="var(--green)" /> {t('paid_amount')}
          </span>
          <b className="receipt-row__val credit">−{formatInr(paidAmount)}</b>
        </div>
      )}

      <div className="receipt-row receipt-row--net">
        <span className="receipt-row__label">{t('net_due')}</span>
        <b className="receipt-row__val">{formatInr(isPaid ? 0 : (breakup.netDue ?? breakup.grossTotal ?? 0))}</b>
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
    <div className="trend">
      <div className="trend__head">
        <span className="trend__title">{t('18_month_trend')}</span>
        <div className="seg seg--xs">
          {['amount', 'units', 'combo'].map(v => (
            <button key={v} className={`seg__btn ${view === v ? 'seg__btn--active' : ''}`} onClick={() => setView(v)}>
              {v === 'amount' ? '₹' : v === 'units' ? 'U' : t('both')}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<div className="state-box" style={{ height: '150px' }}><Loader size={16} /></div>}>
        <TrendChart chartData={chartData} view={view} insights={insights} />
      </Suspense>

      {insights && (
        <div className="trend__stats">
          <div className="tstat tstat--red">
            <span>{t('highest')}</span>
            <b>{formatInr(insights.maxAmount)}</b>
            <small>{fmtMonth(insights.maxAmountMonth)}</small>
          </div>
          <div className="tstat tstat--green">
            <span>{t('lowest')}</span>
            <b>{formatInr(insights.minAmount)}</b>
            <small>{fmtMonth(insights.minAmountMonth)}</small>
          </div>
          {insights.predictedNextBill && (
            <div className="tstat tstat--blue">
              <span>{t('next_est')}</span>
              <b>~{formatInr(insights.predictedNextBill)}</b>
              <small>{insights.predictedBasis || 'Seasonal'}</small>
            </div>
          )}
        </div>
      )}

      {seasonalInsight && (
        <div style={{ margin: '16px 10px 0', background: 'var(--amber-dim)', border: '1px solid var(--amber)', padding: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '16px' }}>☀️</span>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--amber)' }}>Summer Pattern Detected</h4>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-1)', lineHeight: 1.4 }}>
              Your Apr–Jun bills average <b>{formatInr(seasonalInsight.avg)}</b> — which is <b>{seasonalInsight.pct}% higher</b> than the rest of the year.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsPanel({ service, t }) {
  const history = useMemo(() => {
    // Priority 1: Explicit payment history from APSPDCL (contains receipt numbers, etc.)
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
    
    // Priority 2: Successful items from bill history
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
    <div className="pymt">
      {history.map((p, i) => (
        <div key={i} className="pymt__row">
          <div className="pymt__left">
            <FiCheckCircle size={11} style={{ color: 'var(--green)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px' }}>{formatDate(p.date)}</span>
            </div>
          </div>
          <span className="mono-sm pymt__ref" title={p.receiptNo || '—'}>{p.receiptNo || '—'}</span>
          <span className="mono-sm pymt__counter">{p.counter || '—'}</span>
          <b>{formatInr(p.amount)}</b>
        </div>
      ))}
    </div>
  );
}

