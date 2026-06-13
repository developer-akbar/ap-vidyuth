import { useState, useMemo, useEffect, useRef } from 'react';
import { FiInfo, FiZap, FiPlus, FiMinus, FiTrash2, FiEdit2, FiCheck, FiX, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG } from '../utils/billing';
import { formatInr } from '../../../shared/utils';
import { db } from '../../../shared/db/storage';

// ─── Appliance catalogue with star-rating wattage variants ──────────────────
// Each appliance has a `variants` array: [{ stars, watts, label }]
// `baseWatts` is used as the default (non-inverter / no rating selected)
const APPLIANCE_CATALOGUE = [
  {
    name: 'AC — 1 Ton',
    icon: '❄️',
    category: 'Cooling',
    baseWatts: 1100,
    invertible: true,
    variants: [
      { stars: 1, watts: 1100, label: '1★ / Non-inverter' },
      { stars: 2, watts: 980,  label: '2★ Inverter' },
      { stars: 3, watts: 840,  label: '3★ Inverter' },
      { stars: 4, watts: 720,  label: '4★ Inverter' },
      { stars: 5, watts: 600,  label: '5★ Inverter' },
    ],
  },
  {
    name: 'AC — 1.5 Ton',
    icon: '❄️',
    category: 'Cooling',
    baseWatts: 1600,
    invertible: true,
    variants: [
      { stars: 1, watts: 1600, label: '1★ / Non-inverter' },
      { stars: 2, watts: 1400, label: '2★ Inverter' },
      { stars: 3, watts: 1200, label: '3★ Inverter' },
      { stars: 4, watts: 1000, label: '4★ Inverter' },
      { stars: 5, watts: 840,  label: '5★ Inverter' },
    ],
  },
  {
    name: 'AC — 2 Ton',
    icon: '❄️',
    category: 'Cooling',
    baseWatts: 2200,
    invertible: true,
    variants: [
      { stars: 1, watts: 2200, label: '1★ / Non-inverter' },
      { stars: 2, watts: 1950, label: '2★ Inverter' },
      { stars: 3, watts: 1700, label: '3★ Inverter' },
      { stars: 4, watts: 1450, label: '4★ Inverter' },
      { stars: 5, watts: 1200, label: '5★ Inverter' },
    ],
  },
  {
    name: 'Refrigerator',
    icon: '🧊',
    category: 'Kitchen',
    baseWatts: 200,
    invertible: true,
    variants: [
      { stars: 1, watts: 200, label: 'Direct cool / 1★' },
      { stars: 3, watts: 140, label: '3★ Inverter' },
      { stars: 5, watts: 90,  label: '5★ Inverter' },
    ],
  },
  {
    name: 'Ceiling Fan',
    icon: '🌀',
    category: 'Cooling',
    baseWatts: 75,
    invertible: true,
    variants: [
      { stars: 1, watts: 75, label: 'Standard (non-BLDC)' },
      { stars: 3, watts: 40, label: 'BLDC 3★' },
      { stars: 5, watts: 28, label: 'BLDC 5★' },
    ],
  },
  {
    name: 'Geyser',
    icon: '🚿',
    category: 'Bathroom',
    baseWatts: 2000,
    invertible: false,
    variants: [
      { stars: 1, watts: 2000, label: '15L Standard' },
      { stars: 3, watts: 2000, label: '15L 3★ (better insulation)' },
      { stars: 5, watts: 2000, label: '25L Heat Pump (~500W effective)' },
    ],
  },
  {
    name: 'Washing Machine',
    icon: '🧺',
    category: 'Appliances',
    baseWatts: 500,
    invertible: true,
    variants: [
      { stars: 1, watts: 500, label: 'Semi-auto / Top-load 1★' },
      { stars: 3, watts: 400, label: 'Front-load 3★' },
      { stars: 5, watts: 300, label: 'Front-load 5★ Inverter' },
    ],
  },
  {
    name: 'LED TV',
    icon: '📺',
    category: 'Entertainment',
    baseWatts: 80,
    invertible: false,
    variants: [
      { stars: 1, watts: 80,  label: '43" LED' },
      { stars: 3, watts: 100, label: '55" LED' },
      { stars: 5, watts: 130, label: '65" OLED/QLED' },
    ],
  },
  {
    name: 'Water Pump',
    icon: '💧',
    category: 'Appliances',
    baseWatts: 750,
    invertible: false,
    variants: [
      { stars: 1, watts: 370,  label: '0.5 HP' },
      { stars: 3, watts: 750,  label: '1 HP' },
      { stars: 5, watts: 1100, label: '1.5 HP' },
    ],
  },
  {
    name: 'Laptop',
    icon: '💻',
    category: 'Entertainment',
    baseWatts: 65,
    invertible: false,
    variants: [
      { stars: 1, watts: 45,  label: 'Ultrabook / Thin & light' },
      { stars: 3, watts: 65,  label: 'Mid-range' },
      { stars: 5, watts: 120, label: 'Gaming / High-performance' },
    ],
  },
  {
    name: 'LED Bulb',
    icon: '💡',
    category: 'Lighting',
    baseWatts: 9,
    invertible: false,
    variants: [
      { stars: 1, watts: 5,  label: '5W (40W equivalent)' },
      { stars: 3, watts: 9,  label: '9W (60W equivalent)' },
      { stars: 5, watts: 14, label: '14W (100W equivalent)' },
    ],
  },
  {
    name: 'Microwave',
    icon: '🍳',
    category: 'Kitchen',
    baseWatts: 1200,
    invertible: false,
    variants: [
      { stars: 1, watts: 900,  label: '20L Solo' },
      { stars: 3, watts: 1200, label: '25L Grill' },
      { stars: 5, watts: 1500, label: '30L Convection' },
    ],
  },
  {
    name: 'Induction Cooktop',
    icon: '🍲',
    category: 'Kitchen',
    baseWatts: 1800,
    invertible: false,
    variants: [
      { stars: 1, watts: 1200, label: '1200W' },
      { stars: 3, watts: 1800, label: '1800W' },
      { stars: 5, watts: 2000, label: '2000W' },
    ],
  },
  {
    name: 'Desktop PC',
    icon: '🖥️',
    category: 'Entertainment',
    baseWatts: 300,
    invertible: false,
    variants: [
      { stars: 1, watts: 150, label: 'Office / Low-end' },
      { stars: 3, watts: 300, label: 'Mid-range' },
      { stars: 5, watts: 500, label: 'Gaming rig' },
    ],
  },
  {
    name: 'Iron Box',
    icon: '👔',
    category: 'Appliances',
    baseWatts: 1000,
    invertible: false,
    variants: [
      { stars: 1, watts: 750,  label: 'Dry iron' },
      { stars: 3, watts: 1000, label: 'Steam iron' },
      { stars: 5, watts: 2000, label: 'Steam generator' },
    ],
  },
];

const CATEGORIES = ['All', ...new Set(APPLIANCE_CATALOGUE.map(a => a.category))];

const SLAB_BREAKPOINTS = [30, 75, 125, 225, 400];

// ─── Helpers ────────────────────────────────────────────────────────────────
function getSlabInfo(units) {
  const slabs = DEFAULT_DOMESTIC_CONFIG.slabs;
  const currentSlab = slabs.findLast(s => units > s.min) || slabs[0];
  const nextBreakpoint = SLAB_BREAKPOINTS.find(b => b > units);
  const prevBreakpoint = SLAB_BREAKPOINTS.filter(b => b < units).at(-1) || 0;
  const unitsIntoSlab = units - prevBreakpoint;
  const slabWidth = nextBreakpoint ? nextBreakpoint - prevBreakpoint : null;
  const pct = slabWidth ? Math.min(100, (unitsIntoSlab / slabWidth) * 100) : 100;
  return { currentSlab, nextBreakpoint, pct, unitsIntoSlab, slabWidth };
}

function StarPicker({ variants, selectedWatts, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Efficiency / Model
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {variants.map(v => (
          <button
            key={v.stars}
            onClick={() => onChange(v.watts)}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              border: `1px solid ${selectedWatts === v.watts ? 'var(--primary)' : 'var(--border-md)'}`,
              background: selectedWatts === v.watts ? 'var(--primary-dim)' : 'transparent',
              color: selectedWatts === v.watts ? 'var(--primary)' : 'var(--text-2)',
              fontSize: '0.75rem',
              fontWeight: selectedWatts === v.watts ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Custom wattage inline editor ───────────────────────────────────────────
function WattEditor({ watts, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(watts));
  const ref = useRef(null);

  useEffect(() => { setVal(String(watts)); }, [watts]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  const commit = () => {
    const n = parseInt(val, 10);
    if (n > 0 && n <= 20000) onChange(n);
    else setVal(String(watts));
    setEditing(false);
  };

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          ref={ref}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(String(watts)); setEditing(false); } }}
          style={{
            width: 60, fontSize: '0.875rem', fontWeight: 700,
            background: 'var(--surface-2)', border: '1px solid var(--primary)',
            borderRadius: 4, padding: '1px 4px', color: 'var(--text-1)',
          }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>W</span>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Tap to edit wattage"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}
    >
      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-1)' }}>{watts}W</span>
      <FiEdit2 size={10} style={{ color: 'var(--text-3)' }} />
    </button>
  );
}

// ─── Add Custom Appliance Sheet ─────────────────────────────────────────────
function CustomApplianceForm({ onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [watts, setWatts] = useState('');
  const [icon, setIcon] = useState('🔌');

  const QUICK_ICONS = ['🔌','📡','🖨️','🎮','🎵','💈','🔆','🌡️','🧹','🏠'];

  const submit = () => {
    const w = parseInt(watts, 10);
    if (!name.trim() || !w || w <= 0) return;
    onAdd({ name: name.trim(), watts: w, icon, hours: 4, count: 1, id: Date.now(), custom: true });
  };

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--primary-glow)',
      borderRadius: 'var(--radius)', padding: 16, marginTop: 12,
    }}>
      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-1)' }}>
        Add Custom Appliance
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            Appliance Name
          </label>
          <input
            type="text"
            placeholder="e.g. Treadmill"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--border-md)', background: 'var(--surface)',
              color: 'var(--text-1)', fontSize: '0.875rem', boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            Wattage (W)
          </label>
          <input
            type="number"
            placeholder="e.g. 800"
            value={watts}
            onChange={e => setWatts(e.target.value)}
            min={1} max={20000}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--border-md)', background: 'var(--surface)',
              color: 'var(--text-1)', fontSize: '0.875rem', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
          Icon
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK_ICONS.map(em => (
            <button
              key={em}
              onClick={() => setIcon(em)}
              style={{
                fontSize: 20, padding: '4px 6px', borderRadius: 8, cursor: 'pointer',
                border: `2px solid ${icon === em ? 'var(--primary)' : 'transparent'}`,
                background: icon === em ? 'var(--primary-dim)' : 'transparent',
              }}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--primary" style={{ flex: 1, height: 38, justifyContent: 'center', fontSize: '0.875rem' }} onClick={submit}>
          Add
        </button>
        <button className="btn btn--ghost" style={{ height: 38, justifyContent: 'center', fontSize: '0.875rem' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Slab Meter ──────────────────────────────────────────────────────────────
function SlabMeter({ units }) {
  const { currentSlab, nextBreakpoint, pct, slabWidth, unitsIntoSlab } = getSlabInfo(units);

  const slabColour = () => {
    if (units <= 75)  return 'var(--green)';
    if (units <= 125) return 'var(--amber)';
    if (units <= 225) return 'var(--amber)';
    return 'var(--red)';
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 600 }}>
          Slab rate: <span style={{ color: slabColour(), fontWeight: 700 }}>₹{currentSlab.rate}/unit</span>
        </span>
        {nextBreakpoint && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
            {nextBreakpoint - units} units until next slab (₹{DEFAULT_DOMESTIC_CONFIG.slabs.find(s => s.min >= nextBreakpoint)?.rate ?? '—'}/u)
          </span>
        )}
        {!nextBreakpoint && (
          <span style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600 }}>Highest slab</span>
        )}
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${pct}%`,
          background: slabColour(),
          transition: 'width 0.4s ease',
        }} />
      </div>
      {slabWidth && (
        <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: 4 }}>
          {unitsIntoSlab} of {slabWidth} units used in this slab
        </p>
      )}
    </div>
  );
}

// ─── Bill Breakup Panel ───────────────────────────────────────────────────────
function BillBreakup({ bill }) {
  const rows = [
    { label: 'Energy Charges',   value: bill.ec,  note: 'Telescoping slabs' },
    { label: 'Fixed Charges',    value: bill.fc,  note: 'Based on load' },
    { label: 'Customer Charges', value: bill.cc,  note: 'Per tier' },
    { label: 'Electricity Duty', value: bill.ed,  note: '6% of EC' },
    { label: 'FAC',              value: bill.fac, note: 'Fuel surcharge' },
  ];
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Bill Breakup (Est.)
      </p>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>{r.label}</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginLeft: 6 }}>{r.note}</span>
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-1)' }}>{formatInr(r.value)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)' }}>Total</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--primary-hi)' }}>{formatInr(bill.total)}</span>
      </div>
    </div>
  );
}

// ─── Appliance Row ───────────────────────────────────────────────────────────
function ApplianceRow({ app, onRemove, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const catalogue = APPLIANCE_CATALOGUE.find(c => c.name === app.catalogueName);

  const dailyKwh = (app.watts * app.hours * app.count) / 1000;

  return (
    <div className="scard" style={{ padding: 0, border: '1px solid var(--border)', overflow: 'hidden' }}>
      {/* Row summary — always visible */}
      <div
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>{app.icon || '🔌'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <h4 style={{ fontSize: '0.875rem', margin: 0, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {app.name}
            </h4>
            <WattEditor watts={app.watts} onChange={w => onUpdate(app.id, 'watts', w)} />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '2px 0 0' }}>
            {app.count} × {app.hours}h/day · {dailyKwh.toFixed(2)} kWh/day
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="icon-btn-ghost"
            style={{ color: 'var(--red)', flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onRemove(app.id); }}
            aria-label={`Remove ${app.name}`}
          >
            <FiTrash2 size={14} />
          </button>
          {expanded ? <FiChevronUp size={16} color="var(--text-3)" /> : <FiChevronDown size={16} color="var(--text-3)" />}
        </div>
      </div>

      {/* Expanded controls */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12 }}>
            {/* Qty */}
            <div>
              <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Qty</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="icon-btn-ghost icon-btn--sm" onClick={() => onUpdate(app.id, 'count', Math.max(1, app.count - 1))} aria-label="Decrease"><FiMinus size={12} /></button>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{app.count}</span>
                <button className="icon-btn-ghost icon-btn--sm" onClick={() => onUpdate(app.id, 'count', app.count + 1)} aria-label="Increase"><FiPlus size={12} /></button>
              </div>
            </div>

            {/* Hours/Day */}
            <div>
              <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Hours / Day — <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{app.hours}h</span>
              </label>
              <input
                type="range" min="0.5" max="24" step="0.5"
                value={app.hours}
                onChange={e => onUpdate(app.id, 'hours', parseFloat(e.target.value))}
                style={{ width: '100%', height: 4, accentColor: 'var(--primary)' }}
                aria-label={`${app.name} hours per day`}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>0.5h</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--primary)', fontWeight: 600 }}>
                  {dailyKwh.toFixed(2)} kWh/day
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>24h</span>
              </div>
            </div>
          </div>

          {/* Star / variant picker for catalogue appliances */}
          {catalogue?.variants && (
            <StarPicker
              variants={catalogue.variants}
              selectedWatts={app.watts}
              onChange={w => onUpdate(app.id, 'watts', w)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function ApplianceCalculator({ onBack }) {
  const [appliances, setAppliances] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showBreakup, setShowBreakup] = useState(false);

  // Load saved on mount
  useEffect(() => {
    (async () => {
      const saved = await db.getSetting('saved_appliances_v2');
      if (saved && Array.isArray(saved) && saved.length > 0) setAppliances(saved);
      setIsLoaded(true);
    })();
  }, []);

  // Persist on change (debounced via isLoaded guard)
  useEffect(() => {
    if (isLoaded) db.setSetting('saved_appliances_v2', appliances);
  }, [appliances, isLoaded]);

  // Escape → back
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onBack?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack]);

  const addFromCatalogue = (cat) => {
    const already = appliances.filter(a => a.catalogueName === cat.name).length;
    setAppliances(prev => [...prev, {
      id: Date.now(),
      name: cat.name,
      catalogueName: cat.name,
      icon: cat.icon,
      watts: cat.baseWatts,
      hours: cat.name.includes('Geyser') ? 1 : cat.name.includes('AC') ? 8 : cat.name.includes('Fan') ? 12 : 4,
      count: 1,
      custom: false,
    }]);
  };

  const addCustom = (app) => {
    setAppliances(prev => [...prev, app]);
    setShowCustomForm(false);
  };

  const removeAppliance = (id) => setAppliances(prev => prev.filter(a => a.id !== id));
  const updateAppliance = (id, field, value) => setAppliances(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));

  const totals = useMemo(() => {
    const dailyKwh = appliances.reduce((sum, a) => sum + (a.watts * a.hours * a.count) / 1000, 0);
    const monthlyUnits = dailyKwh * 30;
    const bill = calculateEstimatedBill(Math.round(monthlyUnits), 0, DEFAULT_DOMESTIC_CONFIG);
    return { dailyKwh: dailyKwh.toFixed(2), monthlyUnits: Math.round(monthlyUnits), bill };
  }, [appliances]);

  const filteredCatalogue = activeCategory === 'All'
    ? APPLIANCE_CATALOGUE
    : APPLIANCE_CATALOGUE.filter(a => a.category === activeCategory);

  const addedNames = new Set(appliances.map(a => a.catalogueName).filter(Boolean));

  const savingTip = useMemo(() => {
    const { monthlyUnits } = totals;
    if (monthlyUnits === 0) return null;
    if (monthlyUnits > 400) return `You're in the highest slab (₹9.75/unit). Shifting AC use to off-peak hours and reducing hours by 1–2 daily could save ₹300–500/month.`;
    if (monthlyUnits > 225) return `You've crossed 225 units — at ₹8.75/unit. Cutting 20 units of AC usage could drop you to a lower slab and save ~₹200/month.`;
    if (monthlyUnits > 125) return `At ₹6.00/unit. Keeping it under 125 units (₹4.50/unit) could save ₹100–150/month — consider reducing AC hours or switching to BLDC fans.`;
    if (monthlyUnits > 75)  return `Approaching the ₹4.50 slab. Stay under 75 units (₹3.00/unit) by reducing fan usage or avoiding high-wattage appliances during peak hours.`;
    return `Great — you're in a low slab (≤75 units at ₹3.00/unit or lower). LED lights and BLDC fans keep consumption minimal.`;
  }, [totals]);

  return (
    <div className="page appliance-page">

      {/* ── Sticky header ─────────────────────────────── */}
      <header className="page__header page__header--sticky">
        <div style={{ width: '100%' }}>
          <h2 className="page__title" style={{ fontSize: '1.25rem' }}>Appliance Cost Estimator</h2>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-3)' }}>
            Set your actual model — wattage adjusts per efficiency rating
          </p>
        </div>
      </header>

      {/* ── Sticky summary card ────────────────────────── */}
      <div className="appliance-summary-sticky">
        <div className="scard" style={{
          padding: '14px 16px',
          background: 'var(--surface-2)',
          border: '1px solid var(--primary-glow)',
          boxShadow: 'var(--shadow-lg)',
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Est. Monthly Bill</p>
              <h3 style={{ fontSize: '1.625rem', color: 'var(--primary-hi)', margin: 0, lineHeight: 1 }}>
                {appliances.length === 0 ? '—' : formatInr(totals.bill.total)}
              </h3>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Consumption</p>
              <h3 style={{ fontSize: '1.375rem', margin: 0, lineHeight: 1 }}>
                {appliances.length === 0 ? '—' : totals.monthlyUnits}{' '}
                <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--text-3)' }}>units</span>
              </h3>
            </div>
          </div>

          {/* Secondary row */}
          {appliances.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                  <strong>{totals.dailyKwh}</strong> kWh/day
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                  <strong>{formatInr(Math.round((totals.bill.total / (totals.monthlyUnits || 1)) * 100) / 100)}</strong>/unit avg
                </span>
              </div>
              <button
                onClick={() => setShowBreakup(b => !b)}
                style={{
                  fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                {showBreakup ? 'Hide breakup ▲' : 'Bill breakup ▼'}
              </button>
            </div>
          )}

          {/* Bill breakup panel */}
          {showBreakup && appliances.length > 0 && <BillBreakup bill={totals.bill} />}

          {/* Slab meter */}
          {appliances.length > 0 && <SlabMeter units={totals.monthlyUnits} />}
        </div>
      </div>

      {/* ── Your appliances ──────────────────────────────── */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Your Appliances {appliances.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({appliances.length})</span>}
          </h3>
          {appliances.length > 0 && (
            <button
              className="btn btn--ghost"
              style={{ fontSize: '0.75rem', height: 28, padding: '0 10px', color: 'var(--red)' }}
              onClick={() => setAppliances([])}
            >
              Clear all
            </button>
          )}
        </div>

        {appliances.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--text-3)', fontSize: '0.8125rem',
            border: '1px dashed var(--border-md)', borderRadius: 'var(--radius)',
          }}>
            <FiZap size={24} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            Add appliances below — wattage auto-adjusts by star rating
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {appliances.map(app => (
              <ApplianceRow
                key={app.id}
                app={app}
                onRemove={removeAppliance}
                onUpdate={updateAppliance}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Add from catalogue ─────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Add Appliance
          </h3>
          <button
            className="btn btn--ghost"
            style={{ fontSize: '0.75rem', height: 28, padding: '0 10px', color: 'var(--primary)' }}
            onClick={() => setShowCustomForm(c => !c)}
          >
            <FiPlus size={12} style={{ marginRight: 4 }} />
            Custom
          </button>
        </div>

        {/* Custom form */}
        {showCustomForm && (
          <CustomApplianceForm onAdd={addCustom} onCancel={() => setShowCustomForm(false)} />
        )}

        {/* Category filter chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                border: `1px solid ${activeCategory === cat ? 'var(--primary)' : 'var(--border-md)'}`,
                background: activeCategory === cat ? 'var(--primary-dim)' : 'transparent',
                color: activeCategory === cat ? 'var(--primary)' : 'var(--text-2)',
                fontSize: '0.75rem', fontWeight: activeCategory === cat ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Appliance grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {filteredCatalogue.map(cat => {
            const alreadyAdded = addedNames.has(cat.name);
            return (
              <button
                key={cat.name}
                className="btn btn--ghost"
                style={{
                  justifyContent: 'flex-start', padding: '10px 12px',
                  fontSize: '0.75rem', height: 'auto',
                  flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                  border: `1px solid ${alreadyAdded ? 'var(--primary-glow)' : 'var(--border)'}`,
                  background: alreadyAdded ? 'var(--primary-dim)' : 'transparent',
                  opacity: 1,
                }}
                onClick={() => addFromCatalogue(cat)}
              >
                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', textAlign: 'left', lineHeight: 1.3 }}>{cat.name}</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>
                  {cat.baseWatts}W · {cat.invertible ? 'Adjustable' : 'Fixed'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Saving tip ──────────────────────────────────── */}
      {savingTip && appliances.length > 0 && (
        <div style={{
          marginTop: 28, marginBottom: 16,
          background: 'var(--surface-3)', padding: 14,
          borderRadius: 'var(--radius)', display: 'flex', gap: 10,
        }}>
          <FiInfo size={16} style={{ marginTop: 2, flexShrink: 0, color: 'var(--primary)' }} />
          <div>
            <h4 style={{ fontSize: '0.875rem', marginBottom: 4, fontWeight: 700, color: 'var(--primary)' }}>Cost Saving Tip</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{savingTip}</p>
          </div>
        </div>
      )}

    </div>
  );
}