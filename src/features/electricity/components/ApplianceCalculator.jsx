import { useState, useMemo, useEffect, useRef } from 'react';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG } from '../utils/billing';
import { formatInr } from '../../../shared/utils';
import { db } from '../../../shared/db/storage';
import { Loader } from '../../../shared/components/Loader.jsx';

// ─── Appliance catalogue with star-rating wattage variants ──────────────────
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
    <div className="flex flex-col gap-1.5 mt-2">
      <span className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
        Efficiency / Model
      </span>
      <div className="flex flex-wrap gap-1.5">
        {variants.map(v => (
          <button
            key={v.stars}
            onClick={() => onChange(v.watts)}
            className={`px-3 py-1 rounded-full text-xs transition-all duration-150 cursor-pointer ${
              selectedWatts === v.watts
                ? 'bg-primary-dim text-primary font-body-bold border border-primary'
                : 'bg-transparent text-text-secondary border border-border-medium hover:bg-surface-container-low'
            }`}
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
      <span className="inline-flex items-center gap-1">
        <input
          ref={ref}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(String(watts)); setEditing(false); } }}
          className="w-16 font-mono-data text-xs font-bold bg-surface-container border border-primary rounded px-1.5 py-0.5 text-on-surface outline-none"
        />
        <span className="text-[10px] text-text-muted font-mono-data">W</span>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Tap to edit wattage"
      className="inline-flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 outline-none hover:text-primary transition-colors"
    >
      <span className="font-mono-data text-[12px] font-bold text-on-surface">{watts}W</span>
      <span className="material-symbols-outlined text-[14px] text-text-muted">edit</span>
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
    <div className="bg-surface-container-low border border-primary/20 rounded-xl p-4 mt-3 flex flex-col gap-3.5 shadow-inner">
      <h4 className="font-body-bold text-[14px] text-on-surface">
        Add Custom Appliance
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
            Appliance Name
          </label>
          <input
            type="text"
            placeholder="e.g. Treadmill"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            className="w-full px-3 py-1.5 rounded-lg border border-border-medium bg-surface text-on-surface text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
            Wattage (W)
          </label>
          <input
            type="number"
            placeholder="e.g. 800"
            value={watts}
            onChange={e => setWatts(e.target.value)}
            min={1} max={20000}
            className="w-full px-3 py-1.5 rounded-lg border border-border-medium bg-surface text-on-surface text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
          Icon
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_ICONS.map(em => (
            <button
              key={em}
              onClick={() => setIcon(em)}
              className={`text-xl p-1.5 rounded-lg cursor-pointer transition-all ${
                icon === em ? 'bg-primary-dim border border-primary' : 'bg-transparent border border-transparent hover:bg-surface-container'
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 py-2 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-lg font-body-bold text-xs cursor-pointer" onClick={submit}>
          Add
        </button>
        <button className="px-4 py-2 bg-surface-card hover:bg-surface-container border border-border-medium rounded-lg font-body-bold text-xs text-text-secondary cursor-pointer" onClick={onCancel}>
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
    <div className="mt-3.5 pt-3 border-t border-border-subtle">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-text-secondary font-body-bold">
          Slab rate: <span className="font-mono-data font-bold" style={{ color: slabColour() }}>₹{currentSlab.rate}/unit</span>
        </span>
        {nextBreakpoint ? (
          <span className="text-[11px] text-text-muted">
            {nextBreakpoint - units} units until next slab (₹{DEFAULT_DOMESTIC_CONFIG.slabs.find(s => s.min >= nextBreakpoint)?.rate ?? '—'}/u)
          </span>
        ) : (
          <span className="text-[11px] text-red font-body-bold">Highest slab</span>
        )}
      </div>
      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500" 
          style={{ width: `${pct}%`, backgroundColor: slabColour() }}
        />
      </div>
      {slabWidth && (
        <p className="text-[10px] text-text-muted mt-1.5">
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
    <div className="mt-3 pt-3 border-t border-border-subtle flex flex-col gap-2">
      <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
        Bill Breakup (Est.)
      </p>
      {rows.map(r => (
        <div key={r.label} className="flex justify-between items-center text-xs pb-1.5 border-b border-border-subtle last:border-none">
          <div className="flex items-baseline gap-1.5">
            <span className="text-text-secondary">{r.label}</span>
            <span className="text-[10px] text-text-muted font-body-base">({r.note})</span>
          </div>
          <span className="font-mono-data text-on-surface font-semibold">{formatInr(r.value)}</span>
        </div>
      ))}
      <div className="flex justify-between items-center pt-2 mt-1 border-t border-dashed border-border-medium">
        <span className="font-body-bold text-on-surface text-xs">Total</span>
        <span className="font-mono-data text-primary text-[14px] font-bold">{formatInr(bill.total)}</span>
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
    <div className="scard bg-surface-card border border-border-medium rounded-xl overflow-hidden shadow-xs">
      <div
        className="p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-container-low transition-colors duration-150"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-2xl flex-shrink-0">{app.icon || '🔌'}</span>
        <div className="flex-grow min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h4 className="font-body-bold text-[14px] text-on-surface truncate max-w-[180px]">
              {app.name}
            </h4>
            <WattEditor watts={app.watts} onChange={w => onUpdate(app.id, 'watts', w)} />
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">
            {app.count} × {app.hours}h/day · <span className="font-mono-data font-semibold">{dailyKwh.toFixed(2)} kWh/day</span>
          </p>
        </div>
        <div className="flex items-center gap-2 relative z-10" onClick={e => e.stopPropagation()}>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-dim/10 text-red cursor-pointer"
            onClick={() => onRemove(app.id)}
            aria-label={`Remove ${app.name}`}
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container text-text-secondary cursor-pointer"
            onClick={() => setExpanded(e => !e)}
          >
            <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 bg-surface-container-low/30 border-t border-border-subtle flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-4">
            {/* Qty */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">Qty</label>
              <div className="flex items-center gap-3">
                <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-medium hover:bg-surface-container text-text-secondary cursor-pointer" onClick={() => onUpdate(app.id, 'count', Math.max(1, app.count - 1))} aria-label="Decrease">
                  <span className="material-symbols-outlined text-[16px]">remove</span>
                </button>
                <span className="font-mono-data text-[14px] font-black w-6 text-center">{app.count}</span>
                <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-border-medium hover:bg-surface-container text-text-secondary cursor-pointer" onClick={() => onUpdate(app.id, 'count', app.count + 1)} aria-label="Increase">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>
            </div>

            {/* Hours/Day */}
            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">
                Hours / Day — <span className="text-primary font-black">{app.hours}h</span>
              </label>
              <input
                type="range" min="0.5" max="24" step="0.5"
                value={app.hours}
                onChange={e => onUpdate(app.id, 'hours', parseFloat(e.target.value))}
                className="w-full accent-primary h-1 bg-surface-container-high rounded-full appearance-none cursor-pointer my-2"
                aria-label={`${app.name} hours per day`}
              />
              <div className="flex justify-between text-[9px] text-text-muted font-mono-data">
                <span>0.5h</span>
                <span className="text-primary font-bold">{dailyKwh.toFixed(2)} kWh/day</span>
                <span>24h</span>
              </div>
            </div>
          </div>

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
export function ApplianceCalculator({ onBack, onOpenProfile }) {
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

  // Persist on change
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
    <div className="page flex-1 p-margin-mobile md:p-margin-desktop max-w-7xl mx-auto w-full pb-20 md:pb-6">

      {/* ── Sticky header with Back Button ─────────────────────────────── */}
      <header className="page__header page__header--sticky">
        <div className="flex items-center gap-2.5">
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low text-text-secondary cursor-pointer" 
            onClick={onBack} 
            title="Go Back"
            aria-label="Go Back"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-background">Appliance Cost Estimator</h2>
            <p className="text-[11px] text-text-muted">
              Set your actual model — wattage adjusts per efficiency rating
            </p>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={onOpenProfile}
          title="User Profile"
          style={{ width: '40px', height: '40px', borderRadius: '50%' }}
        >
          <span className="material-symbols-outlined text-[24px]">account_circle</span>
        </button>
      </header>

      {/* ── Sticky summary card ────────────────────────── */}
      <div className="mb-4">
        <div className="scard bg-surface-card border border-border-medium rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Est. Monthly Bill</p>
              <h3 className="font-amount-hero text-amount-hero text-primary font-black leading-none">
                {appliances.length === 0 ? '—' : formatInr(totals.bill.total)}
              </h3>
            </div>
            <div className="text-right">
              <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Consumption</p>
              <h3 className="font-display-lg text-[22px] text-on-surface font-black leading-none">
                {appliances.length === 0 ? '—' : totals.monthlyUnits}{' '}
                <span className="text-xs font-body-base text-text-muted">units</span>
              </h3>
            </div>
          </div>

          {appliances.length > 0 && (
            <div className="pt-2 border-t border-border-subtle flex justify-between items-center text-xs">
              <div className="flex gap-4">
                <span className="text-text-secondary">
                  <strong>{totals.dailyKwh}</strong> kWh/day
                </span>
                <span className="text-text-secondary">
                  <strong>{formatInr(Math.round((totals.bill.total / (totals.monthlyUnits || 1)) * 100) / 100)}</strong>/unit avg
                </span>
              </div>
              <button
                onClick={() => setShowBreakup(b => !b)}
                className="text-xs font-body-bold text-primary hover:text-primary-hi cursor-pointer bg-transparent border-none p-0 outline-none"
              >
                {showBreakup ? 'Hide breakup ▲' : 'Bill breakup ▼'}
              </button>
            </div>
          )}

          {showBreakup && appliances.length > 0 && <BillBreakup bill={totals.bill} />}

          {appliances.length > 0 && <SlabMeter units={totals.monthlyUnits} />}
        </div>
      </div>

      {/* ── Your appliances ──────────────────────────────── */}
      <section className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-label-caps text-label-caps text-text-muted uppercase tracking-wider">
            Your Appliances {appliances.length > 0 && <span className="text-text-muted font-body-base">({appliances.length})</span>}
          </h3>
          {appliances.length > 0 && (
            <button
              className="px-3 py-1 bg-red-dim/10 hover:bg-red-dim/20 text-red font-body-bold text-[11px] rounded-full cursor-pointer transition-colors"
              onClick={() => setAppliances([])}
            >
              Clear all
            </button>
          )}
        </div>

        {appliances.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border-medium rounded-xl bg-surface-card">
            <span className="material-symbols-outlined text-[28px] text-text-muted mb-2 block mx-auto">bolt</span>
            Add appliances below — wattage auto-adjusts by star rating
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
      <section className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-label-caps text-label-caps text-text-muted uppercase tracking-wider">
            Add Appliance
          </h3>
          <button
            className="flex items-center gap-1 px-3 py-1 bg-primary-dim/10 hover:bg-primary-dim/20 text-primary font-body-bold text-[11px] rounded-full cursor-pointer transition-colors"
            onClick={() => setShowCustomForm(c => !c)}
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Custom
          </button>
        </div>

        {showCustomForm && (
          <CustomApplianceForm onAdd={addCustom} onCancel={() => setShowCustomForm(false)} />
        )}

        {/* Category filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1.5 mb-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1 rounded-full text-xs transition-all duration-150 cursor-pointer whitespace-nowrap ${
                activeCategory === cat 
                  ? 'bg-primary-dim text-primary font-body-bold border border-primary' 
                  : 'bg-surface-card text-text-secondary border border-border-medium hover:bg-surface-container-low'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Appliance grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {filteredCatalogue.map(cat => {
            const alreadyAdded = addedNames.has(cat.name);
            return (
              <button
                key={cat.name}
                className={`p-3 bg-surface-card border border-border-medium rounded-xl flex flex-col items-start gap-1 text-left transition-all duration-150 hover:translate-y-[-1px] cursor-pointer hover:border-primary/30 relative overflow-hidden ${
                  alreadyAdded ? 'bg-primary-dim/10 border-primary/20 ring-1 ring-primary/10' : ''
                }`}
                onClick={() => addFromCatalogue(cat)}
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="font-body-bold text-[12px] text-on-surface line-clamp-1">{cat.name}</span>
                <span className="text-[10px] text-text-muted font-mono-data mt-0.5">
                  {cat.baseWatts}W · {cat.invertible ? 'Adjustable' : 'Fixed'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Saving tip ──────────────────────────────────── */}
      {savingTip && appliances.length > 0 && (
        <div className="p-4 bg-surface-container-low border border-border-subtle rounded-xl flex items-start gap-3 mt-6 shadow-sm">
          <span className="material-symbols-outlined text-primary text-[20px] mt-0.5 flex-shrink-0">lightbulb</span>
          <div>
            <h4 className="font-body-bold text-[14px] text-primary mb-1">Cost Saving Tip</h4>
            <p className="text-xs text-text-secondary leading-normal">{savingTip}</p>
          </div>
        </div>
      )}

    </div>
  );
}