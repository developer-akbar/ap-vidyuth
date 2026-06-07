import { 
  ComposedChart, Area, Line, 
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { formatInr } from '../../../shared/utils/index.js';

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ctip">
      <p className="ctip__label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name.includes('Unit') ? `${Number(p.value).toLocaleString('en-IN')} u` : formatInr(p.value)}
        </p>
      ))}
    </div>
  );
}

function fmtK(v) { return v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`; }

export function TrendChart({ chartData, view, insights }) {
  if (view === 'amount') {
    return (
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval={2} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="billAmount" name="Bill Amount" stroke="var(--primary)" fill="var(--primary-dim)" strokeWidth={2} dot={{ r: 2, fill: 'var(--primary)' }} />
          {insights?.avgAmount && <ReferenceLine y={insights.avgAmount} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: 'avg', fontSize: 8, fill: 'var(--text-3)', position: 'insideTopRight' }} />}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (view === 'units') {
    return (
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval={2} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="billedUnits" name="Units" stroke="var(--cyan)" fill="var(--cyan-dim)" strokeWidth={2} dot={{ r: 2, fill: 'var(--cyan)' }} />
          {insights?.avgUnits && <ReferenceLine y={insights.avgUnits} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: 'avg', fontSize: 8, fill: 'var(--text-3)', position: 'insideTopRight' }} />}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (view === 'combo') {
    return (
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -18, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} interval={2} />
          <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={42} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={36} />
          <Tooltip content={<ChartTip />} />
          <Area yAxisId="left" type="monotone" dataKey="billAmount" name="Bill Amount" stroke="var(--primary)" fill="var(--primary-dim)" strokeWidth={2} dot={{ r: 2, fill: 'var(--primary)' }} />
          <Line yAxisId="right" type="monotone" dataKey="billedUnits" name="Units" stroke="var(--cyan)" strokeWidth={2} dot={{ r: 2, fill: 'var(--cyan)' }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return null;
}
