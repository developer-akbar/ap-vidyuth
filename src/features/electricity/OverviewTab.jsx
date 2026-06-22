import { useMemo, useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { 
  formatInr, 
  generateShareTable, 
  formatIndianCurrency, 
  formatShareDate, 
  generatePlainShareTable 
} from '../../shared/utils/index.js';
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
  if (pct === 0) return <span className="font-label-caps text-label-caps text-text-muted">Same as last month</span>;
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-mono-data text-[11px] whitespace-nowrap ${up ? 'text-red' : 'text-green'}`}>
      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>
        {up ? 'trending_up' : 'trending_down'}
      </span>
      {up ? '+' : '−'}{pct}% MoM
      {unit ? ` (${unit})` : ''}
    </span>
  );
}

// ─── Aggregate chart tooltip ──────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctip bg-inverse-surface text-inverse-on-surface p-2 rounded-lg shadow-lg border border-border-medium">
      <p className="ctip__label text-xs font-body-bold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="text-[11px] font-mono-data" style={{ color: p.color, margin: 0 }}>
          {p.name === 'amount' ? formatInr(p.value) : `${p.value} u`}
        </p>
      ))}
    </div>
  );
}

// ─── Aggregate trend chart (all services combined) ────────────────────────────
function AggregateTrendChart({ activeServices }) {
  const [view, setView] = useState('amount');

  const { chartData, avg12, avg6 } = useMemo(() => {
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
      .slice(-12);

    if (entries.length === 0) return { chartData: [], avg12: { amount: 0, units: 0 }, avg6: { amount: 0, units: 0 } };

    const data = entries.map(([month, v]) => ({
      month,
      label: fmtMoKey(month),
      amount: Math.round(v.amount),
      units:  Math.round(v.units),
    }));

    const calculateAvg = (arr, key) => arr.length ? Math.round(arr.reduce((s, d) => s + d[key], 0) / arr.length) : 0;
    const avg12 = { amount: calculateAvg(data, 'amount'), units: calculateAvg(data, 'units') };
    const avg6  = { amount: calculateAvg(data.slice(-6), 'amount'), units: calculateAvg(data.slice(-6), 'units') };

    return { chartData: data, avg12, avg6 };
  }, [activeServices]);

  if (chartData.length < 2) return null;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const isCurrentBar = (d) => d.month === currentMonth;
  const currentAvg = view === 'amount' ? avg12.amount : avg12.units;

  return (
    <div className="scard bg-surface-card border border-border-medium rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <p className="font-headline-md text-[16px] text-on-surface">
          Household Trend (12 Months)
        </p>
        <div className="flex bg-surface-container rounded-full p-0.5 border border-border-medium">
          {['amount', 'units'].map(v => (
            <button 
              key={v} 
              onClick={() => setView(v)} 
              className={`px-3 py-1 text-[11px] font-label-caps rounded-full transition-all duration-150 cursor-pointer ${
                view === v 
                  ? 'bg-white shadow-sm text-primary font-bold' 
                  : 'text-text-muted hover:text-on-surface'
              }`}
            >
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
            y={currentAvg}
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

      <div className="flex justify-end gap-3 mt-2">
        <p className="text-xs text-text-muted">
          12m Avg: <b className="font-mono-data text-on-surface">{view === 'amount' ? formatInr(avg12.amount) : `${avg12.units} u`}</b>
        </p>
        <p className="text-xs text-text-muted">
          6m Avg: <b className="font-mono-data text-on-surface">{view === 'amount' ? formatInr(avg6.amount) : `${avg6.units} u`}</b>
        </p>
        <p className="text-xs text-text-muted">
          <span className="text-amber font-bold">■</span> current
        </p>
      </div>
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
            id: s.id, priority: 1, icon: 'error', colorClass: 'text-red border-red/20 bg-red-dim/10',
            text: `${name} — overdue by ${daysOverdue}d`,
            sub: `${formatInr(s.lastAmountDue)} due since ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
          });
          return;
        }
        // Due within 3 days
        const daysTil = Math.ceil((due - now) / 86400000);
        if (daysTil <= 3) {
          results.push({
            id: s.id, priority: 2, icon: 'schedule', colorClass: 'text-amber border-amber/20 bg-amber-dim/10',
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
              id: `${s.id}_spike`, priority: 3, icon: 'trending_up', colorClass: 'text-violet border-violet/20 bg-violet-dim/10',
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
            id: `${s.id}_stale`, priority: 4, icon: 'warning', colorClass: 'text-text-muted border-border-medium bg-surface-container-low',
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
      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-dim/10 border border-green/20 mb-4">
        <span className="material-symbols-outlined text-green text-[18px]">check_circle</span>
        <span className="text-[13px] text-green font-body-bold">
          All services are up to date — nothing needs attention
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      {items.map(item => (
        <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${item.colorClass}`}>
          <span className="material-symbols-outlined text-[18px] mt-0.5 flex-shrink-0">{item.icon}</span>
          <div>
            <p className="text-[13px] font-body-bold text-on-surface">{item.text}</p>
            <p className="text-xs text-text-muted mt-0.5">{item.sub}</p>
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
    <div className="scard bg-surface-card border border-border-medium rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">track_changes</span>
          <p className="font-headline-md text-headline-md text-on-surface">Budget Goals</p>
        </div>
        <span className={`text-[11px] font-label-caps px-2.5 py-0.5 rounded-full ${
          withinCount === items.length ? 'bg-badge-paid-bg text-badge-paid-fg' : 'bg-badge-due-bg text-badge-due-fg'
        }`}>
          {withinCount}/{items.length} within budget
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map(item => (
          <div key={item.id}>
            <div className="flex justify-between mb-1">
              <span className="text-xs font-body-bold text-text-secondary">{item.name}</span>
              <span className={`font-mono-data text-xs ${item.over ? 'text-red font-bold' : 'text-on-surface'}`}>
                {formatInr(item.current)} / {formatInr(item.budget)}
              </span>
            </div>
            <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-400 ${
                  item.over ? 'bg-red' : item.pct >= 80 ? 'bg-amber' : 'bg-green'
                }`}
                style={{ width: `${item.pct}%` }}
              />
            </div>
            {item.over && (
              <p className="text-[11px] text-red font-body-bold mt-1">
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
function ComparisonRow({ r, service, currentYear, maxAmt, isLowest }) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef(null);

  useEffect(() => {
    if (expanded && rowRef.current) {
      setTimeout(() => {
        const mainEl = document.querySelector('.main');
        const headerEl = document.querySelector('.page__header--sticky');
        
        if (mainEl && rowRef.current) {
          const headerHeight = headerEl ? headerEl.offsetHeight : 0;
          const headerOffset = headerHeight + 8;
          const rect = rowRef.current.getBoundingClientRect();
          const containerRect = mainEl.getBoundingClientRect();
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
    <div ref={rowRef} className={`scroll-mt-18 border-b border-border-medium pb-3.5 mb-0 transition-colors rounded-xl duration-200 ${
      expanded ? 'bg-surface-container-low border-primary/20 p-4 mb-4 shadow-sm' : 'bg-transparent'
    }`}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left cursor-pointer flex flex-col gap-2 rounded-lg ${
          expanded ? 'bg-primary-dim/5 p-2' : ''
        }`}
      >
        <div className="flex justify-between items-start w-full">
          <div className="flex-1">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <p className="font-body-bold text-[14px] text-on-surface">
                  {r.name} {isLowest && <span title="Lowest bill this month">🏆</span>}
                </p>
                <span className={`material-symbols-outlined text-[18px] text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono-data text-[11px] text-text-secondary">{r.serviceNumber}</span>
                <span className="font-label-caps text-[10px] px-1.5 py-0.5 bg-surface-container-high text-text-muted rounded">{service.category}</span>
              </div>
            </div>
            <div className="flex gap-2.5 mt-1.5 flex-wrap">
              {r.unitsDelta !== null ? (
                <span className={`text-xs font-body-bold flex items-center gap-1 ${
                  r.unitsDelta > 0 ? 'text-red' : r.unitsDelta < 0 ? 'text-green' : 'text-text-muted'
                }`}>
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>
                    {r.unitsDelta > 0 ? 'trending_up' : r.unitsDelta < 0 ? 'trending_down' : 'horizontal_rule'}
                  </span>
                  {r.unitsDelta > 0 ? '+' : ''}{Math.round(r.unitsDelta)}% units
                  <span className="font-body-base text-text-muted text-[11px]">
                    ({r.prevUnits}→{r.currUnits}u)
                  </span>
                </span>
              ) : (
                <span className="text-xs text-text-muted">{r.currUnits} units</span>
              )}
              {r.amtDelta !== null && (
                <span className={`text-xs font-body-bold ${
                  r.amtDelta > 0 ? 'text-red' : r.amtDelta < 0 ? 'text-green' : 'text-text-muted'
                }`}>
                  {r.amtDelta > 0 ? '+' : ''}{Math.round(r.amtDelta)}% bill
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="font-amount-hero text-amount-hero-mobile text-on-surface">{formatInr(r.currAmt)}</span>
            <p className={`text-[11px] font-body-bold mt-0.5 ${
              r.status === 'PAID' ? 'text-green' : 'text-red'
            }`}>
              {r.status === 'PAID' ? 'PAID' : 'DUE'}
            </p>
          </div>
        </div>
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              r.amtDelta > 25 ? 'bg-red' : r.amtDelta < -10 ? 'bg-green' : 'bg-primary'
            }`}
            style={{ width: `${(r.currAmt / maxAmt) * 100}%` }}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-3 border-t border-border-subtle">
           <div className="flex gap-4 items-center mb-4">
             {service.lastDueDate && r.status !== 'PAID' && (
               <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1 rounded-lg">
                 <span className="material-symbols-outlined text-[16px] text-text-muted">calendar_today</span>
                 <span className="text-xs font-body-bold text-text-secondary">
                   Due: {new Date(service.lastDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                 </span>
               </div>
             )}
           </div>

           <div className="mb-5">
              <p className="text-xs font-label-caps text-text-muted mb-3 uppercase tracking-wider">Trend Analysis (12 Months)</p>
              <ServiceTrendChart service={service} />
           </div>

           <div className="border-t border-dashed border-border-medium pt-4">
              <p className="text-xs font-label-caps text-text-muted mb-3 uppercase tracking-wider">{currentYear} Service Review</p>
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
        serviceNumber: s.serviceNumber,
        currAmt, prevAmt, currUnits, prevUnits,
        amtDelta, unitsDelta,
        status: s.lastStatus,
        category: s.category,
        service: s,
      };
    }).filter(r => r.currAmt > 0 || r.currUnits > 0);
  }, [activeServices]);

  if (rows.length === 0) return null;

  const maxAmt = Math.max(...rows.map(r => r.currAmt), 1);
  const minAmt = Math.min(...rows.map(r => r.currAmt).filter(a => a > 0));

  return (
    <div className="scard bg-surface-card border border-border-medium rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary text-[20px]">bar_chart</span>
        <p className="font-headline-md text-headline-md text-on-surface">
          Performance & Detailed Breakdown
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {rows.map(r => (
          <ComparisonRow key={r.id} r={r} service={r.service} currentYear={currentYear} maxAmt={maxAmt} isLowest={r.currAmt === minAmt && r.currAmt > 0} />
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

      (s.billHistory || []).forEach(b => {
        if (!b.billDate || parseInt(b.billDate.slice(0, 4), 10) !== currentYear) return;
        totalBills++;
        if (b.isPaid && b.paidDate && b.dueDate && new Date(b.paidDate) <= new Date(b.dueDate)) onTimePaid++;
      });

      const isDomestic = s.category === 'LT1';
      if (isDomestic && svcUnits > 0) {
        const avgUnits = svcUnits / 12; 
        if (avgUnits < bestRate) {
          bestRate = avgUnits;
          bestService = s.label || s.customerName || s.serviceNumber;
        }
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
    const { totalSpent, totalUnits, maxMo, minMo, bestService, bestRate } = data;
    
    let bestServiceCostPerUnit = 0;
    const winner = activeServices.find(s => (s.label || s.customerName || s.serviceNumber) === bestService);
    if (winner) {
      let svcAmt = 0, svcUnits = 0;
      (winner.trendData || []).forEach(td => {
        if (parseInt(td.month.split('-')[0], 10) === currentYear) {
          svcAmt += Number(td.billAmount || 0);
          svcUnits += Number(td.billedUnits || 0);
        }
      });
      if (svcUnits > 0) bestServiceCostPerUnit = svcAmt / svcUnits;
    }

    const text =
      `⚡ *${currentYear} Electricity Summary*\n\n` +
      `💰 Total Spent: ${formatIndianCurrency(totalSpent)}\n` +
      `🔌 Total Units: ${totalUnits.toLocaleString('en-IN')} units\n` +
      (maxMo ? `📈 Highest: ${fmtMoKeyFull(maxMo[0])} — ${formatIndianCurrency(maxMo[1].amount)}\n` : '') +
      (minMo ? `📉 Lowest: ${fmtMoKeyFull(minMo[0])} — ${formatIndianCurrency(minMo[1].amount)}\n` : '') +
      (bestService ? `🏆 Most efficient: ${bestService} (₹${bestServiceCostPerUnit.toFixed(2)}/unit)\n` : '') +
      `\nhttps://ap-vidyuth.vercel.app\n` +
      `_Shared via AP Vidyuth_`;

    if (Capacitor.getPlatform() !== 'web') {
      try { await Share.share({ title: `${currentYear} Electricity Summary`, text }); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: `${currentYear} Electricity Summary`, text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast.success('Summary copied!'); } catch { toast.error('Copy failed'); }
  };

  return (
    <div className="mb-4">
      {!hideToggle && (
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center justify-between w-full p-4 transition-all duration-200 border border-border-medium cursor-pointer ${
            isExpanded 
              ? 'bg-primary-dim/10 border-primary/25 rounded-t-xl' 
              : 'bg-surface-container-low rounded-xl shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[20px]">calendar_today</span>
            <div className="text-left">
              <p className="font-body-bold text-on-surface">{currentYear} Year in Review</p>
              <p className="text-xs text-text-muted mt-0.5">
                {hasData
                  ? `${formatInr(data.totalSpent)} · ${data.totalUnits.toLocaleString('en-IN')} units`
                  : 'No data yet for this year'}
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined text-primary text-[18px]">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      )}

      {isExpanded && hasData && (
        <div className={`p-4 bg-surface-container-low border-x border-b border-primary/20 ${
          hideToggle ? 'border-none p-0 bg-transparent' : 'rounded-b-xl'
        }`}>
          <div className="flex flex-wrap gap-2.5 mb-3.5">
            {[
              { label: 'Total Spent',    val: formatInr(data.totalSpent),                          colorClass: 'text-primary' },
              { label: 'Total Units',    val: `${data.totalUnits.toLocaleString('en-IN')} u`,       colorClass: 'text-on-surface' },
              { label: 'Highest Month',  val: fmtMoKeyFull(data.maxMo?.[0]),                        sub: formatInr(data.maxMo?.[1]?.amount || 0), colorClass: 'text-red' },
              { label: 'Lowest Month',   val: fmtMoKeyFull(data.minMo?.[0]),                        sub: formatInr(data.minMo?.[1]?.amount || 0), colorClass: 'text-green' },
            ].map(({ label, val, sub, colorClass }) => (
              <div key={label} className="flex-1 min-w-[130px] p-3 bg-surface-card border border-border-medium rounded-xl shadow-sm">
                <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
                <p className={`font-headline-md text-[16px] font-black ${colorClass}`}>{val}</p>
                {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
              </div>
            ))}

            {data.totalBills > 0 && (
              <div className="w-full p-3 bg-surface-card border border-border-medium rounded-xl shadow-sm flex justify-between items-center">
                <div>
                  <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-1">On-time Payment Rate</p>
                  <p className="text-xs text-text-secondary">{data.onTimePaid} of {data.totalBills} bills paid before due date</p>
                </div>
                <span className={`font-display-lg text-[22px] font-black ${
                  data.onTimePaid / data.totalBills >= 0.8 ? 'text-green' : 'text-amber'
                }`}>
                  {Math.round((data.onTimePaid / data.totalBills) * 100)}%
                </span>
              </div>
            )}
          </div>

          {data.bestService && activeServices.length > 1 && (
            <div className="p-3 bg-green-dim/10 border border-green/20 rounded-xl text-xs text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-green text-[18px]">workspace_premium</span>
              <div>
                🏆 Most efficient connection: <b>{data.bestService}</b> · avg <span className="font-mono-data">₹{data.bestRate.toFixed(2)}/unit</span>
                {data.worstService && data.worstService !== data.bestService && (
                  <span className="text-text-muted">
                    {' '}· Highest: <b>{data.worstService}</b> at <span className="font-mono-data">₹{data.worstRate.toFixed(2)}/unit</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {chartData.length >= 2 && !hideMonthlyChart && (
            <div className="mt-4">
              <p className="text-xs font-body-bold text-text-muted mb-2">Monthly Breakdown</p>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={chartData} margin={{ top: 2, right: 4, left: -22, bottom: 0 }} barSize={10}>
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 8, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={38} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="amount" name="amount" fill="var(--primary)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {!hideToggle && (
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 w-full mt-4 py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-[13px] shadow-md shadow-primary/20 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              Share {currentYear} Summary
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

  const { chartData, avg12, avg6 } = useMemo(() => {
    const data = (service.trendData || [])
      .map(td => ({
        month: td.month,
        label: fmtMoKey(td.month),
        amount: Math.round(td.billAmount || 0),
        units: Math.round(td.billedUnits || 0),
      }));
    
    const calculateAvg = (arr, key) => arr.length ? Math.round(arr.reduce((s, d) => s + d[key], 0) / arr.length) : 0;

    const data12 = data.slice(-12);
    const avg12 = {
      amount: calculateAvg(data12, 'amount'),
      units: calculateAvg(data12, 'units')
    };

    const data6 = data.slice(-6);
    const avg6 = {
      amount: calculateAvg(data6, 'amount'),
      units: calculateAvg(data6, 'units')
    };

    return { chartData: data12, avg12, avg6 };
  }, [service.trendData]);

  if (chartData.length < 2) return <p className="text-xs text-text-muted text-center py-5">Not enough data for trend</p>;

  const currentAvg = view === 'amount' ? avg12.amount : avg12.units;

  return (
    <div className="mb-3">
      <div className="flex justify-end gap-1 mb-2">
        <div className="flex bg-surface-container rounded-full p-0.5 border border-border-medium">
          {['amount', 'units'].map(v => (
            <button 
              key={v} 
              onClick={() => setView(v)} 
              className={`px-2.5 py-0.5 text-[10px] font-label-caps rounded-full transition-all duration-150 cursor-pointer ${
                view === v 
                  ? 'bg-white shadow-sm text-primary font-bold' 
                  : 'text-text-muted hover:text-on-surface'
              }`}
            >
              {v === 'amount' ? '₹ Bill' : '⚡ Units'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={chartData} margin={{ top: 5, right: 4, left: -22, bottom: 0 }} barSize={12}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={view === 'amount' ? fmtK : v => v} tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<ChartTip />} />
          <ReferenceLine 
            y={currentAvg} 
            stroke="var(--text-3)" strokeDasharray="3 3" 
            label={{ value: 'avg', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 8 }} 
          />
          <Bar dataKey={view} name={view} fill={view === 'amount' ? 'var(--primary)' : 'var(--cyan)'} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      
      <div className="flex justify-end gap-3 mt-1.5">
        <p className="text-xs text-text-muted font-body-base">
          12m Avg: <b className="font-mono-data text-on-surface">{view === 'amount' ? formatInr(avg12.amount) : `${avg12.units} u`}</b>
        </p>
        <p className="text-xs text-text-muted font-body-base">
          6m Avg: <b className="font-mono-data text-on-surface">{view === 'amount' ? formatInr(avg6.amount) : `${avg6.units} u`}</b>
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function OverviewTab({ electricityContext, onOpenProfile }) {
  const { t } = useTranslation();
  const { services, loading } = electricityContext;

  const activeServices = useMemo(() => services.filter(s => !s.isDeleted), [services]);
  const currentYear = new Date().getFullYear();

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
      const currTd = (s.trendData || []).find(td => td.month === currentMonth);
      totalUnitsThisMonth += Number(currTd?.billedUnits || s.lastBilledUnits || 0);
    });

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
    const monthYear = new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const rows = activeServices.map(s => ({
      name: s.label || s.customerName || s.serviceNumber,
      amount: s.lastAmountDue || s.paidAmount || 0,
      units: s.lastBilledUnits || 0,
    })).sort((a, b) => b.amount - a.amount);
    
    const text = `⚡ *Electricity Bill — ${monthYear}*\n\n` + 
                 `${generatePlainShareTable(rows)}\n\n` +
                 `https://ap-vidyuth.vercel.app\n` +
                 `_Shared via AP Vidyuth_`;

    if (Capacitor.getPlatform() !== 'web') {
      try { await Share.share({ title: 'Electricity Summary', text }); return; } catch {}
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Electricity Summary', text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast.success('Summary copied!'); } catch { toast.error('Copy failed'); }
  };

  if (loading) {
    return (
      <div className="page flex items-center justify-center min-h-[400px]">
        <div className="state-box flex flex-col items-center gap-2">
          <Loader size={22} />
          <p className="text-text-secondary">Loading Overview…</p>
        </div>
      </div>
    );
  }

  if (activeServices.length === 0) {
    return (
      <div className="page flex-1 p-margin-mobile md:p-margin-desktop max-w-7xl mx-auto w-full pb-20 md:pb-6">
        <header className="page__header page__header--sticky">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-background">Overview</h2>
            <p className="text-[11px] text-text-muted">
              0 services · {currentYear}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="icon-btn"
              onClick={onOpenProfile}
              title="User Profile"
              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            >
              <span className="material-symbols-outlined text-[24px]">account_circle</span>
            </button>
          </div>
        </header>

        <div className="state-box flex flex-col items-center justify-center p-8 border border-dashed border-border-medium rounded-xl text-center bg-surface-card" style={{ marginTop: '20px' }}>
          <span className="material-symbols-outlined text-[36px] text-text-muted mb-3">grid_view</span>
          <h3 className="font-headline-md text-headline-md text-on-surface">No services</h3>
          <p className="text-xs text-text-muted mt-1">Add some electricity services to see your overview.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page flex-1 p-margin-mobile md:p-margin-desktop max-w-7xl mx-auto w-full pb-20 md:pb-6">
      {/* ── Sticky header ─────────────────────────────── */}
      <header className="page__header page__header--sticky">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-background">Overview</h2>
          <p className="text-[11px] text-text-muted">
            {activeServices.length} service{activeServices.length !== 1 ? 's' : ''} · {currentYear}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="icon-btn" 
            onClick={handleShareSummary} 
            title="Share this month's summary" 
            aria-label="Share summary"
            style={{ width: '40px', height: '40px' }}
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
          </button>
          <button
            className="icon-btn"
            onClick={onOpenProfile}
            title="User Profile"
            style={{ width: '40px', height: '40px', borderRadius: '50%' }}
          >
            <span className="material-symbols-outlined text-[24px]">account_circle</span>
          </button>
        </div>
      </header>

      {/* ── Top stat cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Amount due now */}
        <div className={`scard bg-surface-card border border-border-medium rounded-xl p-4 flex flex-col gap-2 ${
          summary.totalDue > 0 ? 'border-red/20 bg-red-dim/10' : 'border-green/20 bg-green-dim/10'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`font-label-caps text-label-caps uppercase ${summary.totalDue > 0 ? 'text-red' : 'text-green'}`}>
              {summary.totalDue > 0 ? `Due Now${summary.overdueCount > 0 ? ` · ${summary.overdueCount} overdue` : ''}` : 'All Paid'}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-amount-hero text-amount-hero-mobile md:text-amount-hero text-on-background font-black">
              {summary.totalDue > 0 ? formatInr(summary.totalDue) : '✓'}
            </span>
          </div>
          <div className="mt-1">
            <Delta current={summary.totalThisMonth} previous={summary.totalLastMonth} />
          </div>
        </div>

        {/* Units this month */}
        <div className="scard bg-surface-card border border-border-medium rounded-xl p-4 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-text-muted uppercase">
              Units This Month
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-amount-hero text-amount-hero-mobile md:text-amount-hero text-on-background font-black">
              {summary.totalUnitsThisMonth.toLocaleString('en-IN')}
            </span>
            <span className="font-mono-data text-text-muted">u</span>
          </div>
          <div className="mt-1">
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
      <div className="mb-4">
        <p className="font-label-caps text-label-caps text-text-muted uppercase tracking-wider mb-2">
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