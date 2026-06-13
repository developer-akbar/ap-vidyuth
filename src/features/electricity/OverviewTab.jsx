import { useMemo, useState, useEffect, useRef } from 'react';
import {
  FiGrid, FiZap, FiShare2, FiAlertCircle, FiClock,
  FiTrendingUp, FiTrendingDown, FiMinus, FiCalendar,
  FiCheckCircle, FiAlertTriangle, FiTarget, FiBarChart2,
  FiChevronDown,
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatInr, generateShareTable } from '../../shared/utils/index.js';
import { db } from '../../shared/db/storage.js';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { Loader } from '../../shared/components/Loader.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────
const MO_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMoKey(key) {
  if (!key) return '—';
  const [, mo] = key.split('-');
  return MO_SHORT[parseInt(mo, 10) - 1];
}

function fmtMoKeyFull(key) {
  if (!key) return '—';
  const [yr, mo] = key.split('-');
  return `${MO_SHORT[parseInt(mo, 10) - 1]} ${yr}`;
}

function fmtK(v) {
  if (v === 0) return '0';
  if (v >= 100000) {
    const val = (v / 100000).toFixed(1);
    return `₹${val.endsWith('.0') ? val.slice(0, -2) : val}L`;
  }
  if (v >= 1000) {
    const val = (v / 1000).toFixed(1);
    return `₹${val.endsWith('.0') ? val.slice(0, -2) : val}k`;
  }
  return `₹${v}`;
}

// ─── Delta badge ─────────────────────────────────────────────────────────────
function Delta({ current, previous, unit = '' }) {
  if (!previous || previous === 0) return null;
  const diff = current - previous;
  const pct  = Math.round(Math.abs(diff / previous) * 100);
  if (pct === 0) return <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>Same as last month</span>;
  const up = diff > 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: '0.6875rem', fontWeight: 700,
      color: up ? 'var(--red)' : 'var(--green)',
    }}>
      {up ? <FiTrendingUp size={11} /> : <FiTrendingDown size={11} />}
      {up ? '+' : '−'}{pct}% vs last month
      {unit ? ` (${unit})` : ''}
    </span>
  );
}

// ─── Aggregate chart tooltip ──────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctip">
      <p className="ctip__label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: 0, fontSize: '0.75rem' }}>
          {p.name === 'amount' ? formatInr(p.value) : `${p.value} u`}
        </p>
      ))}
    </div>
  );
}

// ─── Aggregate trend chart (all services combined) ────────────────────────────
function AggregateTrendChart({ activeServices }) {
  const [view, setView] = useState('amount');

  const { chartData, avgAmount, avgUnits } = useMemo(() => {
    // Build a map of month → { amount, units }
    const map = {};
    activeServices.forEach(s => {
      (s.trendData || []).forEach(td => {
        if (!map[td.month]) map[td.month] = { amount: 0, units: 0 };
        map[td.month].amount += Number(td.billAmount || 0);
        map[td.month].units  += Number(td.billedUnits || 0);
      });
    });
    const entries = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12); // last 12 months

    if (entries.length === 0) return { chartData: [], avgAmount: 0, avgUnits: 0 };

    const data = entries.map(([month, v]) => ({
      month,
      label: fmtMoKey(month),
      amount: Math.round(v.amount),
      units:  Math.round(v.units),
    }));

    const avgAmount = Math.round(data.reduce((s, d) => s + d.amount, 0) / data.length);
    const avgUnits  = Math.round(data.reduce((s, d) => s + d.units,  0) / data.length);

    return { chartData: data, avgAmount, avgUnits };
  }, [activeServices]);

  if (chartData.length < 2) return null;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const isCurrentBar = (d) => d.month === currentMonth;

  return (
    <div className="scard" style={{ padding: '16px', marginBottom: 16 }}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
          Household Trend{activeServices.length > 1 ? ` — ${activeServices.length} services` : ''}
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {['amount', 'units'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${view === v ? 'var(--primary)' : 'var(--border-md)'}`,
              background: view === v ? 'var(--primary-dim)' : 'transparent',
              color: view === v ? 'var(--primary)' : 'var(--text-3)',
            }}>
              {v === 'amount' ? '₹ Bill' : '⚡ Units'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barSize={14}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={view === 'amount' ? fmtK : v => v}
            tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={40}
          />
          <Tooltip content={<ChartTip />} />
          <ReferenceLine
            y={view === 'amount' ? avgAmount : avgUnits}
            stroke="var(--text-3)" strokeDasharray="3 3"
            label={{ value: 'avg', fontSize: 8, fill: 'var(--text-3)', position: 'insideTopRight' }}
          />
          <Bar dataKey={view} name={view} radius={[3, 3, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill={isCurrentBar(d) ? 'var(--amber)' : 'var(--primary)'}
                fillOpacity={isCurrentBar(d) ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Average annotation */}
      <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: 6, textAlign: 'right' }}>
        12-mo avg: {view === 'amount' ? formatInr(avgAmount) : `${avgUnits} units`}
        {' · '}
        <span style={{ color: 'var(--amber)', fontWeight: 600 }}>■</span> = current month
      </p>
    </div>
  );
}

// ─── Attention cards ──────────────────────────────────────────────────────────
function AttentionSection({ activeServices }) {
  const items = useMemo(() => {
    const now = new Date();
    const results = [];

    activeServices.forEach(s => {
      const name = s.label || s.customerName || s.serviceNumber;

      // Overdue
      if (s.lastStatus === 'DUE' && s.lastDueDate) {
        const due = new Date(s.lastDueDate);
        const daysOverdue = Math.floor((now - due) / 86400000);
        if (daysOverdue > 0) {
          results.push({
            id: s.id, priority: 1, icon: <FiAlertCircle size={15} />, color: 'var(--red)',
            bg: 'var(--red-dim)',
            text: `${name} — overdue by ${daysOverdue}d`,
            sub: `${formatInr(s.lastAmountDue)} due since ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
          });
          return;
        }
        // Due within 3 days
        const daysTil = Math.ceil((due - now) / 86400000);
        if (daysTil <= 3) {
          results.push({
            id: s.id, priority: 2, icon: <FiClock size={15} />, color: 'var(--amber)',
            bg: 'var(--amber-dim)',
            text: `${name} — due ${daysTil === 0 ? 'today' : daysTil === 1 ? 'tomorrow' : `in ${daysTil}d`}`,
            sub: formatInr(s.lastAmountDue),
          });
          return;
        }
      }

      // Spike detection: current vs previous month >25%
      const trend = (s.trendData || []).slice().sort((a, b) => b.month.localeCompare(a.month));
      if (trend.length >= 2) {
        const curr = Number(trend[0].billedUnits || 0);
        const prev = Number(trend[1].billedUnits || 0);
        if (prev > 0 && curr > 0) {
          const rise = ((curr - prev) / prev) * 100;
          if (rise >= 25) {
            results.push({
              id: `${s.id}_spike`, priority: 3, icon: <FiTrendingUp size={15} />, color: 'var(--violet)',
              bg: 'var(--violet-dim)',
              text: `${name} — usage spike +${Math.round(rise)}%`,
              sub: `${prev} → ${curr} units vs last month`,
            });
          }
        }
      }

      // Stale data: not refreshed in 7+ days
      if (s.lastFetchedAt) {
        const staleDays = Math.floor((now - new Date(s.lastFetchedAt)) / 86400000);
        if (staleDays >= 7) {
          results.push({
            id: `${s.id}_stale`, priority: 4, icon: <FiAlertTriangle size={15} />, color: 'var(--text-3)',
            bg: 'var(--surface-3)',
            text: `${name} — data is ${staleDays}d old`,
            sub: 'Pull to refresh for latest bill',
          });
        }
      }
    });

    return results.sort((a, b) => a.priority - b.priority).slice(0, 5);
  }, [activeServices]);

  if (items.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderRadius: 'var(--radius-sm)',
        background: 'var(--green-dim)', border: '1px solid var(--green)',
        marginBottom: 16,
      }}>
        <FiCheckCircle size={16} color="var(--green)" />
        <span style={{ fontSize: '0.8125rem', color: 'var(--green)', fontWeight: 600 }}>
          All services are up to date — nothing needs attention
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          background: item.bg, border: `1px solid ${item.color}22`,
        }}>
          <span style={{ color: item.color, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
          <div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{item.text}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '2px 0 0' }}>{item.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Budget rollup ────────────────────────────────────────────────────────────
function BudgetRollup({ budgets, activeServices }) {
  const items = useMemo(() => {
    return activeServices
      .map(s => {
        const budget = budgets[s.serviceNumber];
        if (!budget) return null;
        const current = s.lastAmountDue || s.paidAmount || 0;
        const pct = Math.min(Math.round((current / budget) * 100), 100);
        const over = current > budget;
        return {
          id: s.id,
          name: s.label || s.customerName || s.serviceNumber,
          budget, current, pct, over,
        };
      })
      .filter(Boolean);
  }, [activeServices, budgets]);

  if (items.length === 0) return null;

  const withinCount = items.filter(i => !i.over).length;

  return (
    <div className="scard" style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiTarget size={14} color="var(--primary)" />
          <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Budget Goals</p>
        </div>
        <span style={{
          fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: withinCount === items.length ? 'var(--green-dim)' : 'var(--amber-dim)',
          color: withinCount === items.length ? 'var(--green)' : 'var(--amber)',
        }}>
          {withinCount}/{items.length} within budget
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <div key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)', fontWeight: 500 }}>{item.name}</span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: item.over ? 'var(--red)' : 'var(--text-1)' }}>
                {formatInr(item.current)} / {formatInr(item.budget)}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${item.pct}%`,
                background: item.over ? 'var(--red)' : item.pct >= 80 ? 'var(--amber)' : 'var(--green)',
                transition: 'width 0.4s',
              }} />
            </div>
            {item.over && (
              <p style={{ fontSize: '0.6875rem', color: 'var(--red)', marginTop: 3 }}>
                Over by {formatInr(item.current - item.budget)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Service Comparison Row ──────────────────────────────────────────────────
function ComparisonRow({ r, service, currentYear, maxAmt }) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef(null);

  useEffect(() => {
    if (expanded && rowRef.current) {
      // Delay to allow the accordion to start expanding and layout to shift
      setTimeout(() => {
        const mainEl = document.querySelector('.main');
        const headerEl = document.querySelector('.page__header--sticky');
        
        if (mainEl && rowRef.current) {
          const headerHeight = headerEl ? headerEl.offsetHeight : 0;
          const headerOffset = headerHeight + 8; // Height + small gap
          
          const rect = rowRef.current.getBoundingClientRect();
          const containerRect = mainEl.getBoundingClientRect();
          
          // Calculate the distance from the top of the scroll container
          const relativeTop = rect.top - containerRect.top;
          
          mainEl.scrollBy({
            top: relativeTop - headerOffset,
            behavior: 'smooth'
          });
        }
      }, 150);
    }
  }, [expanded]);

  return (
    <div ref={rowRef} style={{ 
      scrollMarginTop: '72px', // Offset for sticky header
      borderBottom: '1px solid var(--border-md)', 
      paddingBottom: expanded ? 0 : 14,
      marginBottom: expanded ? 14 : 0,
      background: expanded ? 'var(--surface-2)' : 'transparent',
      borderRadius: expanded ? 'var(--radius-sm)' : 0,
      border: expanded ? '1px solid var(--primary-glow)' : 'none',
    }}>
      <button 
        onClick={() => setExpanded(!expanded)}
        style={{ 
          width: '100%', border: 'none', background: 'transparent', 
          padding: expanded ? '14px 16px 12px' : '0', textAlign: 'left', cursor: 'pointer' 
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{r.name}</p>
              <FiChevronDown style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-3)', fontSize: '0.75rem' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
              {r.unitsDelta !== null ? (
                <span style={{
                  fontSize: '0.6875rem', fontWeight: 700,
                  color: r.unitsDelta > 0 ? 'var(--red)' : r.unitsDelta < 0 ? 'var(--green)' : 'var(--text-3)',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  {r.unitsDelta > 0 ? <FiTrendingUp size={10} /> : r.unitsDelta < 0 ? <FiTrendingDown size={10} /> : <FiMinus size={10} />}
                  {r.unitsDelta > 0 ? '+' : ''}{Math.round(r.unitsDelta)}% units
                  <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>
                    ({r.prevUnits}→{r.currUnits}u)
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>{r.currUnits} units</span>
              )}
              {r.amtDelta !== null && (
                <span style={{
                  fontSize: '0.6875rem', fontWeight: 700,
                  color: r.amtDelta > 0 ? 'var(--red)' : r.amtDelta < 0 ? 'var(--green)' : 'var(--text-3)',
                }}>
                  {r.amtDelta > 0 ? '+' : ''}{Math.round(r.amtDelta)}% bill
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-1)' }}>{formatInr(r.currAmt)}</span>
            {r.prevAmt > 0 && (
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', margin: '2px 0 0' }}>
                was {formatInr(r.prevAmt)}
              </p>
            )}
          </div>
        </div>
        {/* Bar */}
        <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${(r.currAmt / maxAmt) * 100}%`,
            background: r.amtDelta > 25 ? 'var(--red)' : r.amtDelta < -10 ? 'var(--green)' : 'var(--primary)',
            opacity: 0.8,
            transition: 'width 0.4s',
          }} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: 'none' }}>
           {/* Trend Chart */}
           <div style={{ marginTop: 16, marginBottom: 20 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trend Analysis</p>
              <ServiceTrendChart service={service} />
           </div>

           {/* Year Review */}
           <div style={{ borderTop: '1px dashed var(--border-md)', paddingTop: 16 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{currentYear} Service Review</p>
              <YearInReview activeServices={[service]} currentYear={currentYear} forceOpen={true} hideToggle={true} hideMonthlyChart={true} />
           </div>
        </div>
      )}
    </div>
  );
}

// ─── Month-over-month comparison table ───────────────────────────────────────
function MonthComparison({ activeServices, currentYear }) {
  const rows = useMemo(() => {
    return activeServices.map(s => {
      const trend = (s.trendData || []).slice().sort((a, b) => b.month.localeCompare(a.month));
      const curr  = trend[0] || null;
      const prev  = trend[1] || null;

      const currAmt   = Number(curr?.billAmount  || s.lastAmountDue || 0);
      const prevAmt   = Number(prev?.billAmount   || 0);
      const currUnits = Number(curr?.billedUnits  || s.lastBilledUnits || 0);
      const prevUnits = Number(prev?.billedUnits  || 0);

      const amtDelta   = prevAmt   > 0 ? ((currAmt   - prevAmt)   / prevAmt)   * 100 : null;
      const unitsDelta = prevUnits > 0 ? ((currUnits - prevUnits) / prevUnits) * 100 : null;

      return {
        id: s.id,
        name: s.label || s.customerName || s.serviceNumber,
        currAmt, prevAmt, currUnits, prevUnits,
        amtDelta, unitsDelta,
        status: s.lastStatus,
        service: s, // keep ref
      };
    }).filter(r => r.currAmt > 0 || r.currUnits > 0);
  }, [activeServices]);

  if (rows.length === 0) return null;

  const maxAmt = Math.max(...rows.map(r => r.currAmt), 1);

  return (
    <div className="scard" style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <FiBarChart2 size={14} color="var(--primary)" />
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
          Performance & Detailed Breakdown
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map(r => (
          <ComparisonRow key={r.id} r={r} service={r.service} currentYear={currentYear} maxAmt={maxAmt} />
        ))}
      </div>
    </div>
  );
}

// ─── Year in Review ───────────────────────────────────────────────────────────
function YearInReview({ activeServices, currentYear, forceOpen = false, hideToggle = false, hideMonthlyChart = false }) {
  const [open, setOpen] = useState(false);
  const isExpanded = forceOpen || open;

  const { data, chartData, hasData } = useMemo(() => {
    let totalSpent = 0, totalUnits = 0, onTimePaid = 0, totalBills = 0;
    let bestService = null, bestRate = Infinity;
    let worstService = null, worstRate = 0;
    const monthlyMap = {};

    activeServices.forEach(s => {
      let svcUnits = 0, svcAmt = 0;
      (s.trendData || []).forEach(td => {
        if (parseInt(td.month.split('-')[0], 10) !== currentYear) return;
        const units = Number(td.billedUnits || 0);
        const amt   = Number(td.billAmount   || 0);
        totalSpent += amt; totalUnits += units;
        svcUnits += units; svcAmt += amt;
        if (!monthlyMap[td.month]) monthlyMap[td.month] = { units: 0, amount: 0 };
        monthlyMap[td.month].units  += units;
        monthlyMap[td.month].amount += amt;
      });

      // On-time streaks from billHistory
      (s.billHistory || []).forEach(b => {
        if (!b.billDate || parseInt(b.billDate.slice(0, 4), 10) !== currentYear) return;
        totalBills++;
        if (b.isPaid && b.paidDate && b.dueDate && new Date(b.paidDate) <= new Date(b.dueDate)) onTimePaid++;
      });

      const rate = svcUnits > 0 ? svcAmt / svcUnits : null;
      if (rate !== null) {
        if (rate < bestRate  && svcUnits > 0) { bestRate  = rate;  bestService  = s.label || s.customerName || s.serviceNumber; }
        if (rate > worstRate && svcUnits > 0) { worstRate = rate; worstService = s.label || s.customerName || s.serviceNumber; }
      }
    });

    const entries = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b));
    const chartData = entries.map(([month, v]) => ({
      label: fmtMoKey(month),
      amount: Math.round(v.amount),
      units:  Math.round(v.units),
    }));

    const maxMo = entries.reduce((best, cur) => (!best || cur[1].amount > best[1].amount) ? cur : best, null);
    const minMo = entries.reduce((best, cur) => (!best || cur[1].amount < best[1].amount) ? cur : best, null);

    return {
      data: { totalSpent, totalUnits, onTimePaid, totalBills, bestService, bestRate, worstService, worstRate, maxMo, minMo },
      chartData,
      hasData: totalSpent > 0,
    };
  }, [activeServices, currentYear]);

  const handleShare = async () => {
    const { totalSpent, totalUnits, maxMo, minMo, bestService } = data;
    const text =
      `⚡ ${currentYear} Electricity Summary\n\n` +
      `💰 Total Spent: ${formatInr(totalSpent)}\n` +
      `🔌 Total Units: ${totalUnits.toLocaleString('en-IN')} u\n` +
      (maxMo ? `📈 Highest: ${fmtMoKeyFull(maxMo[0])} — ${formatInr(maxMo[1].amount)}\n` : '') +
      (minMo ? `📉 Lowest: ${fmtMoKeyFull(minMo[0])} — ${formatInr(minMo[1].amount)}\n` : '') +
      (bestService ? `🏆 Most efficient: ${bestService} (₹${data.bestRate.toFixed(2)}/unit)\n` : '') +
      `\nTracked via AP Vidyuth`;

    if (Capacitor.getPlatform() !== 'web') {
      try { await Share.share({ title: `${currentYear} Electricity Summary`, text }); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: `${currentYear} Electricity Summary`, text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast.success('Summary copied!'); } catch { toast.error('Copy failed'); }
  };

  return (
    <div style={{ marginBottom: hideToggle ? 0 : 24 }}>
      {/* Accordion toggle */}
      {!hideToggle && (
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '14px 16px',
            background: isExpanded ? 'var(--primary-dim)' : 'var(--surface-2)',
            border: `1px solid ${isExpanded ? 'var(--primary-glow)' : 'var(--border)'}`,
            borderRadius: isExpanded ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiCalendar size={15} style={{ color: 'var(--primary)' }} />
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{currentYear} Year in Review</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: 0 }}>
                {hasData
                  ? `${formatInr(data.totalSpent)} · ${data.totalUnits.toLocaleString('en-IN')} units`
                  : 'No data yet for this year'}
              </p>
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>{isExpanded ? '▲' : '▼'}</span>
        </button>
      )}

      {isExpanded && hasData && (
        <div style={{
          padding: hideToggle ? 0 : 16, 
          background: hideToggle ? 'transparent' : 'var(--surface-2)',
          border: hideToggle ? 'none' : '1px solid var(--primary-glow)', 
          borderTop: 'none',
          borderRadius: hideToggle ? 0 : '0 0 var(--radius-sm) var(--radius-sm)',
        }}>
          {/* 4-stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Total Spent',    val: formatInr(data.totalSpent),                          color: 'var(--primary)' },
              { label: 'Total Units',    val: `${data.totalUnits.toLocaleString('en-IN')} u`,       color: 'var(--text-1)' },
              { label: 'Highest Month',  val: fmtMoKeyFull(data.maxMo?.[0]),                        sub: formatInr(data.maxMo?.[1]?.amount || 0), color: 'var(--red)' },
              { label: 'Lowest Month',   val: fmtMoKeyFull(data.minMo?.[0]),                        sub: formatInr(data.minMo?.[1]?.amount || 0), color: 'var(--green)' },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.625rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color, margin: 0 }}>{val}</p>
                {sub && <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', margin: '2px 0 0' }}>{sub}</p>}
              </div>
            ))}
          </div>

          {/* On-time payment score */}
          {data.totalBills > 0 && (
            <div style={{
              padding: '10px 12px', marginBottom: 12,
              background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: '0.625rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 2px' }}>On-time Payment Rate</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0 }}>{data.onTimePaid} of {data.totalBills} bills paid before due date</p>
              </div>
              <span style={{
                fontSize: '1.125rem', fontWeight: 800,
                color: data.onTimePaid / data.totalBills >= 0.8 ? 'var(--green)' : 'var(--amber)',
              }}>
                {Math.round((data.onTimePaid / data.totalBills) * 100)}%
              </span>
            </div>
          )}

          {/* Efficiency callout */}
          {data.bestService && activeServices.length > 1 && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              background: 'var(--green-dim)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--green)',
              fontSize: '0.8125rem', color: 'var(--text-1)',
            }}>
              🏆 Most efficient connection: <b>{data.bestService}</b> · avg ₹{data.bestRate.toFixed(2)}/unit
              {data.worstService && data.worstService !== data.bestService && (
                <span style={{ color: 'var(--text-3)' }}>
                  {' '}· Highest: <b>{data.worstService}</b> at ₹{data.worstRate.toFixed(2)}/unit
                </span>
              )}
            </div>
          )}

          {/* Monthly breakdown mini-chart */}
          {chartData.length >= 2 && !hideMonthlyChart && (
            <>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>Monthly Breakdown</p>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={chartData} margin={{ top: 2, right: 4, left: -22, bottom: 0 }} barSize={10}>
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 8, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={38} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="amount" name="amount" fill="var(--primary)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {!hideToggle && (
            <button
              onClick={handleShare}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', marginTop: 14, padding: '10px',
                background: 'var(--primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)',
                fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
              }}
            >
              <FiShare2 size={14} /> Share {currentYear} Summary
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Service Trend Chart ─────────────────────────────────────────────────────
function ServiceTrendChart({ service }) {
  const [view, setView] = useState('amount');

  const { chartData, avgAmount, avgUnits } = useMemo(() => {
    const data = (service.trendData || [])
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map(td => ({
        month: td.month,
        label: fmtMoKey(td.month),
        amount: Math.round(td.billAmount || 0),
        units: Math.round(td.billedUnits || 0),
      }));
    
    const avgAmount = data.length ? Math.round(data.reduce((s, d) => s + d.amount, 0) / data.length) : 0;
    const avgUnits  = data.length ? Math.round(data.reduce((s, d) => s + d.units, 0) / data.length) : 0;

    return { chartData: data, avgAmount, avgUnits };
  }, [service.trendData]);

  if (chartData.length < 2) return <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>Not enough data for trend</p>;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 8 }}>
        {['amount', 'units'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '2px 8px', borderRadius: 20, fontSize: '0.625rem', fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${view === v ? 'var(--primary)' : 'var(--border-md)'}`,
            background: view === v ? 'var(--primary-dim)' : 'transparent',
            color: view === v ? 'var(--primary)' : 'var(--text-3)',
          }}>
            {v === 'amount' ? '₹ Bill' : '⚡ Units'}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={chartData} margin={{ top: 5, right: 4, left: -22, bottom: 0 }} barSize={12}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={view === 'amount' ? fmtK : v => v} tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<ChartTip />} />
          <ReferenceLine 
            y={view === 'amount' ? avgAmount : avgUnits} 
            stroke="var(--text-3)" strokeDasharray="3 3" 
            label={{ value: 'avg', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 8 }} 
          />
          <Bar dataKey={view} name={view} fill={view === 'amount' ? 'var(--primary)' : 'var(--cyan)'} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      
      <p style={{ fontSize: '0.625rem', color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>
        Avg: {view === 'amount' ? formatInr(avgAmount) : `${avgUnits} units`}
      </p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function OverviewTab({ electricityContext }) {
  const { t } = useTranslation();
  const { services, loading } = electricityContext;

  const activeServices = useMemo(() => services.filter(s => !s.isDeleted), [services]);

  // Load all budget goals keyed by serviceNumber from db.getSetting
  const [budgets, setBudgets] = useState({});
  useEffect(() => {
    if (activeServices.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        activeServices.map(async s => {
          const val = await db.getSetting(`budget_${s.serviceNumber}`);
          return [s.serviceNumber, val];
        })
      );
      const map = {};
      entries.forEach(([sn, val]) => { if (val) map[sn] = val; });
      setBudgets(map);
    })();
  }, [activeServices]);

  const summary = useMemo(() => {
    if (activeServices.length === 0) return null;
    let totalDue = 0, totalUnitsThisMonth = 0, overdueCount = 0;
    const currentMonth = new Date().toISOString().slice(0, 7);

    activeServices.forEach(s => {
      if (s.lastStatus === 'DUE') {
        totalDue += s.lastAmountDue || 0;
        const due = s.lastDueDate ? new Date(s.lastDueDate) : null;
        if (due && due < new Date()) overdueCount++;
      }
      // Use trendData current month first, fallback to lastBilledUnits
      const currTd = (s.trendData || []).find(td => td.month === currentMonth);
      totalUnitsThisMonth += Number(currTd?.billedUnits || s.lastBilledUnits || 0);
    });

    // Month-over-month totals for the top delta
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthKey = lastMonth.toISOString().slice(0, 7);
    let totalLastMonth = 0;
    activeServices.forEach(s => {
      const prevTd = (s.trendData || []).find(td => td.month === lastMonthKey);
      totalLastMonth += Number(prevTd?.billAmount || 0);
    });
    const totalThisMonth = activeServices.reduce((sum, s) => {
      const currTd = (s.trendData || []).find(td => td.month === currentMonth);
      return sum + Number(currTd?.billAmount || s.lastAmountDue || 0);
    }, 0);

    return { totalDue, totalUnitsThisMonth, overdueCount, totalThisMonth, totalLastMonth };
  }, [activeServices]);

  const handleShareSummary = async () => {
    if (!summary) return;
    const monthYear = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
    const rows = activeServices.map(s => ({
      name: s.label || s.customerName || s.serviceNumber,
      amount: s.lastAmountDue || s.paidAmount || 0,
      units: s.lastBilledUnits || 0,
    })).sort((a, b) => b.amount - a.amount);
    const text = `*Electricity Bill — ${monthYear}*\n\n${generateShareTable(rows)}\n\nhttps://ap-vidyuth.vercel.app`;
    if (Capacitor.getPlatform() !== 'web') {
      try { await Share.share({ title: 'Electricity Summary', text }); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Electricity Summary', text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast.success('Summary copied!'); } catch { toast.error('Copy failed'); }
  };

  // ── Loading / empty ─────────────────────────────────────────────────────────
  if (loading) {
    return <div className="page"><div className="state-box"><Loader size={22} /><p>Loading Overview…</p></div></div>;
  }

  if (activeServices.length === 0) {
    return (
      <div className="page" style={{ padding: 24 }}>
        <div className="state-box">
          <FiGrid size={28} />
          <h3>No services</h3>
          <p>Add some electricity services to see your overview.</p>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="page">

      {/* ── Sticky header ─────────────────────────────── */}
      <header className="page__header page__header--sticky">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h2 className="page__title">Overview</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-3)' }}>
              {activeServices.length} service{activeServices.length !== 1 ? 's' : ''} · {currentYear}
            </p>
          </div>
          <button className="icon-btn-ghost" onClick={handleShareSummary} title="Share this month's summary" aria-label="Share summary">
            <FiShare2 size={20} />
          </button>
        </div>
      </header>

      {/* ── Top stat cards ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {/* Amount due now */}
        <div className="scard" style={{
          padding: '14px 16px',
          background: summary.totalDue > 0 ? 'var(--red-dim)' : 'var(--green-dim)',
          border: `1px solid ${summary.totalDue > 0 ? 'var(--red)' : 'var(--green)'}22`,
        }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', color: summary.totalDue > 0 ? 'var(--red)' : 'var(--green)' }}>
            {summary.totalDue > 0 ? `Due Now${summary.overdueCount > 0 ? ` · ${summary.overdueCount} overdue` : ''}` : 'All Paid'}
          </p>
          <h2 style={{ fontSize: '1.375rem', margin: 0, color: 'var(--text-1)', lineHeight: 1 }}>
            {summary.totalDue > 0 ? formatInr(summary.totalDue) : '✓'}
          </h2>
          <div style={{ marginTop: 4 }}>
            <Delta current={summary.totalThisMonth} previous={summary.totalLastMonth} />
          </div>
        </div>

        {/* Units this month */}
        <div className="scard" style={{ padding: '14px 16px', background: 'var(--surface-2)' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', color: 'var(--text-3)' }}>
            Units This Month
          </p>
          <h2 style={{ fontSize: '1.375rem', margin: 0, color: 'var(--text-1)', lineHeight: 1 }}>
            {summary.totalUnitsThisMonth.toLocaleString('en-IN')}
            <span style={{ fontSize: '0.875rem', fontWeight: 400, marginLeft: 4, color: 'var(--text-3)' }}>u</span>
          </h2>
          <div style={{ marginTop: 4 }}>
            {/* units delta across all services */}
            {(() => {
              const currentMonth = new Date().toISOString().slice(0, 7);
              const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
              const lastMonthKey = lastMonth.toISOString().slice(0, 7);
              const prevUnits = activeServices.reduce((sum, s) => {
                const td = (s.trendData || []).find(d => d.month === lastMonthKey);
                return sum + Number(td?.billedUnits || 0);
              }, 0);
              return <Delta current={summary.totalUnitsThisMonth} previous={prevUnits} />;
            })()}
          </div>
        </div>
      </div>

      {/* ── Attention section ──────────────────────────── */}
      <div style={{ marginBottom: 4 }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Attention
        </p>
        <AttentionSection activeServices={activeServices} />
      </div>

      {/* ── Month-over-month comparison ─────────────────── */}
      <MonthComparison activeServices={activeServices} currentYear={currentYear} />

      {/* ── Aggregate trend chart ───────────────────────── */}
      <AggregateTrendChart activeServices={activeServices} />

      {/* ── Budget rollup ───────────────────────────────── */}
      <BudgetRollup budgets={budgets} activeServices={activeServices} />

      {/* ── Year in Review ─────────────────────────────── */}
      <YearInReview activeServices={activeServices} currentYear={currentYear} />

    </div>
  );
}