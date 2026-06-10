import { useMemo, useState } from 'react';
import { FiGrid, FiZap, FiBarChart2, FiAward, FiShare2, FiCalendar, FiTrendingUp, FiStar } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { formatInr, generateShareTable } from '../../shared/utils/index.js';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { Loader } from '../../shared/components/Loader.jsx';

export function OverviewTab({ electricityContext }) {
  const { t } = useTranslation();
  const { services, loading } = electricityContext;
  const [showYearReview, setShowYearReview] = useState(false);

  const activeServices = useMemo(() => services.filter(s => !s.isDeleted), [services]);

  const overviewData = useMemo(() => {
    if (activeServices.length === 0) return null;

    let totalDue = 0;
    let totalUnitsThisMonth = 0;
    let totalSpentThisYear = 0;
    let totalUnitsThisYear = 0;
    
    const currentYear = new Date().getFullYear();

    const comparisons = activeServices.map(s => {
      const units = s.lastBilledUnits || 0;
      const amt = s.lastAmountDue || s.paidAmount || 0;
      const rate = units > 0 ? amt / units : 0;
      
      totalDue += (s.lastStatus === 'DUE' ? (s.lastAmountDue || 0) : 0);
      totalUnitsThisMonth += units;

      // Calculate year totals
      if (s.paymentHistory) {
        s.paymentHistory.forEach(ph => {
          if (new Date(ph.date).getFullYear() === currentYear) {
            totalSpentThisYear += Number(ph.amount);
          }
        });
      }
      if (s.trendData) {
        s.trendData.forEach(td => {
          if (parseInt(td.month.split('-')[0]) === currentYear) {
            totalUnitsThisYear += Number(td.billedUnits || 0);
          }
        });
      }

      return {
        id: s.id,
        name: s.label || s.customerName || t('untitled'),
        units,
        amount: amt,
        rate
      };
    });

    // Sort comparisons by effective rate
    comparisons.sort((a, b) => a.rate - b.rate);

    return { totalDue, totalUnitsThisMonth, totalSpentThisYear, totalUnitsThisYear, comparisons, currentYear };
  }, [activeServices, t]);

  const handleShareSummary = async () => {
    if (!overviewData) return;
    
    const monthYear = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
    const sortedByAmount = [...overviewData.comparisons].sort((a, b) => b.amount - a.amount);
    
    const tableText = generateShareTable(sortedByAmount);
    
    const text = `*Electricity Bill for ${monthYear}*\n\n` +
                 tableText + `\n\n` +
                 `Link: https://ap-vidyuth.vercel.app`;

    if (Capacitor.getPlatform() !== 'web') {
      try {
        await Share.share({ title: 'My Electricity Summary', text });
        return;
      } catch (e) { }
    }
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Electricity Summary', text });
        return;
      } catch (e) {}
    }
    
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Summary copied to clipboard!');
    } catch(e) {
      toast.error('Failed to copy');
    }
  };

  if (loading) {
    return <div className="page"><div className="state-box"><Loader size={22} /><p>Loading Overview...</p></div></div>;
  }

  if (activeServices.length === 0) {
    return (
      <div className="page" style={{ padding: '24px' }}>
        <div className="state-box">
          <FiGrid size={28} />
          <h3>No services</h3>
          <p>Add some electricity services to see your overview.</p>
        </div>
      </div>
    );
  }

  const { totalDue, totalUnitsThisMonth, totalSpentThisYear, totalUnitsThisYear, comparisons, currentYear } = overviewData;

  const maxAmount = Math.max(...comparisons.map(c => c.amount), 1);

  return (
    <div className="page">
      <div className="page__header page__header--sticky">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h2 className="page__title">Overview</h2>
            <p>Your electricity at a glance</p>
          </div>
          <button className="icon-btn-ghost" onClick={handleShareSummary} title="Share Summary">
            <FiShare2 size={20} />
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div className="scard" style={{ padding: '16px', background: 'var(--primary-dim)', border: '1px solid var(--primary-glow)' }}>
            <p style={{ fontSize: '11px', color: 'var(--primary)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Total Spent ({currentYear})</p>
            <h2 style={{ fontSize: '24px', color: 'var(--text-1)' }}>{formatInr(totalSpentThisYear)}</h2>
          </div>
          <div className="scard" style={{ padding: '16px', background: 'var(--surface-2)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Total Units ({currentYear})</p>
            <h2 style={{ fontSize: '24px', color: 'var(--text-1)' }}>{totalUnitsThisYear.toLocaleString('en-IN')} <span style={{fontSize:'14px', fontWeight:400}}>u</span></h2>
          </div>
        </div>

        <h3 style={{ fontSize: '15px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiBarChart2 color="var(--primary)" /> Compare Services (This Month)
        </h3>

        <div className="scard" style={{ padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {comparisons.map((c, i) => (
              <div key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'flex-end' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {i === 0 && comparisons.length > 1 && <FiAward color="var(--amber)" size={14} title="Most Efficient" />}
                      {c.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{c.units} units • ₹{c.rate.toFixed(2)}/u</span>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{formatInr(c.amount)}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(c.amount / maxAmount) * 100}%`, height: '100%', background: i === 0 ? 'var(--green)' : 'var(--primary)', borderRadius: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Year-in-Review (Feature 11) ── */}
        <YearInReview activeServices={activeServices} currentYear={currentYear} />
      </div>
    </div>
  );
}

const MO_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function YearInReview({ activeServices, currentYear }) {
  const [open, setOpen] = useState(false);

  const reviewData = useMemo(() => {
    let totalSpent = 0;
    let totalUnits = 0;
    let monthlyMap = {};
    let onTimePaid = 0, totalBills = 0;
    let bestService = null;
    let bestRate = Infinity;

    activeServices.forEach(s => {
      let serviceUnits = 0;
      let serviceAmount = 0;

      (s.trendData || []).forEach(td => {
        const year = parseInt(td.month.split('-')[0], 10);
        if (year === currentYear) {
          const units = Number(td.billedUnits || 0);
          const amt = Number(td.billAmount || 0);
          totalSpent += amt;
          totalUnits += units;
          serviceUnits += units;
          serviceAmount += amt;
          if (!monthlyMap[td.month]) monthlyMap[td.month] = { units: 0, amount: 0 };
          monthlyMap[td.month].units += units;
          monthlyMap[td.month].amount += amt;
        }
      });

      (s.paymentHistory || []).forEach(ph => {
        if (new Date(ph.date).getFullYear() === currentYear) {
          totalBills++;
          // We count them as paid (they appear in payment history)
          onTimePaid++;
        }
      });

      const rate = serviceUnits > 0 ? serviceAmount / serviceUnits : Infinity;
      if (rate < bestRate && serviceUnits > 0) {
        bestRate = rate;
        bestService = s.label || s.customerName || s.serviceNumber;
      }
    });

    const months = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b));
    const maxMonth = months.reduce((best, cur) => (!best || cur[1].amount > best[1].amount) ? cur : best, null);
    const minMonth = months.reduce((best, cur) => (!best || cur[1].amount < best[1].amount) ? cur : best, null);

    const fmtMo = key => {
      if (!key) return '—';
      const [yr, mo] = key.split('-');
      return `${MO_SHORT[parseInt(mo, 10) - 1]} ${yr}`;
    };

    return { totalSpent, totalUnits, onTimePaid, totalBills, bestService, bestRate, maxMonth, minMonth, fmtMo, months };
  }, [activeServices, currentYear]);

  const handleShareReview = async () => {
    const { totalSpent, totalUnits, maxMonth, minMonth, fmtMo, bestService } = reviewData;
    const text =
      `⚡ My ${currentYear} Electricity Summary\n\n` +
      `💰 Total Spent: ${formatInr(totalSpent)}\n` +
      `🔌 Total Units: ${totalUnits.toLocaleString('en-IN')} u\n` +
      `📈 Highest: ${fmtMo(maxMonth?.[0])} — ${formatInr(maxMonth?.[1]?.amount || 0)}\n` +
      `📉 Lowest: ${fmtMo(minMonth?.[0])} — ${formatInr(minMonth?.[1]?.amount || 0)}\n` +
      (bestService ? `🏆 Most Efficient: ${bestService}\n` : '') +
      `\nTracked via AP Vidyuth`;

    if (Capacitor.getPlatform() !== 'web') {
      try { await Share.share({ title: `My ${currentYear} Electricity Summary`, text }); return; } catch (e) {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: `My ${currentYear} Electricity Summary`, text }); return; } catch (e) {}
    }
    try { await navigator.clipboard.writeText(text); toast.success('Summary copied!'); } catch (e) { toast.error('Copy failed'); }
  };

  const hasData = reviewData.totalSpent > 0;

  return (
    <div style={{ marginBottom: '24px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '14px 16px',
          background: open ? 'var(--primary-dim)' : 'var(--surface-2)',
          border: `1px solid ${open ? 'var(--primary-glow)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginBottom: open ? '0' : undefined
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FiCalendar size={16} style={{ color: 'var(--primary)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-1)' }}>{currentYear} Year in Review</div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              {hasData ? `${formatInr(reviewData.totalSpent)} · ${reviewData.totalUnits.toLocaleString('en-IN')} units` : 'No data yet'}
            </div>
          </div>
        </div>
        <FiStar size={16} style={{ color: open ? 'var(--primary)' : 'var(--text-3)' }} />
      </button>

      {open && hasData && (
        <div style={{ padding: '16px', background: 'var(--surface-2)', border: '1px solid var(--primary-glow)', borderTop: 'none', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: `Total Spent`, val: formatInr(reviewData.totalSpent), color: 'var(--primary)' },
              { label: 'Total Units', val: `${reviewData.totalUnits.toLocaleString('en-IN')} u`, color: 'var(--text-1)' },
              { label: 'Highest', val: `${reviewData.fmtMo(reviewData.maxMonth?.[0])}`, sub: formatInr(reviewData.maxMonth?.[1]?.amount || 0), color: 'var(--red, #ef4444)' },
              { label: 'Lowest', val: `${reviewData.fmtMo(reviewData.minMonth?.[0])}`, sub: formatInr(reviewData.minMonth?.[1]?.amount || 0), color: 'var(--green, #22c55e)' },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={{ padding: '12px', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color }}>{val}</div>
                {sub && <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>{sub}</div>}
              </div>
            ))}
          </div>
          {reviewData.bestService && (
            <div style={{ padding: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid var(--green, #22c55e)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-1)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiAward size={14} style={{ color: 'var(--amber, #f59e0b)' }} />
              <span>Most efficient: <b>{reviewData.bestService}</b> (₹{reviewData.bestRate.toFixed(2)}/unit)</span>
            </div>
          )}
          <button
            onClick={handleShareReview}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '13px', cursor: 'pointer', justifyContent: 'center' }}
          >
            <FiShare2 size={14} /> Share {currentYear} Summary
          </button>
        </div>
      )}
    </div>
  );
}
