import { useState, useMemo, useEffect, useCallback } from 'react';
import { FiInfo, FiZap, FiPlus, FiMinus, FiTrash2, FiArrowLeft } from 'react-icons/fi';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG } from '../utils/billing';
import { formatInr } from '../../../shared/utils';
import { db } from '../../../shared/db/storage';

const COMMON_APPLIANCES = [
  { name: '1.5 Ton AC',       watts: 1500, icon: '❄️' },
  { name: 'Ceiling Fan',      watts: 75,   icon: '🌀' },
  { name: 'LED TV (55")',     watts: 100,  icon: '📺' },
  { name: 'Fridge',           watts: 200,  icon: '🧊' },
  { name: 'Geyser',           watts: 2000, icon: '🚿' },
  { name: 'LED Bulb',         watts: 12,   icon: '💡' },
  { name: 'Laptop',           watts: 60,   icon: '💻' },
  { name: 'Washing Machine',  watts: 500,  icon: '🧺' },
];

const DEFAULT_SELECTION = [
  { id: 1, name: '1.5 Ton AC',    watts: 1500, hours: 8,  count: 1, icon: '❄️' },
  { id: 2, name: 'Ceiling Fan',   watts: 75,   hours: 12, count: 3, icon: '🌀' },
];

export function ApplianceCalculator({ onBack }) {
  const [selectedAppliances, setSelectedAppliances] = useState(DEFAULT_SELECTION);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved appliances on mount
  useEffect(() => {
    (async () => {
      const saved = await db.getSetting('saved_appliances');
      if (saved && Array.isArray(saved)) setSelectedAppliances(saved);
      setIsLoaded(true);
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (isLoaded) db.setSetting('saved_appliances', selectedAppliances);
  }, [selectedAppliances, isLoaded]);

  // Esc key → go back
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onBack?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onBack]);

  const addAppliance = (app) =>
    setSelectedAppliances(prev => [...prev, { ...app, id: Date.now(), hours: 8, count: 1 }]);

  const removeAppliance = (id) =>
    setSelectedAppliances(prev => prev.filter(a => a.id !== id));

  const updateAppliance = (id, field, value) =>
    setSelectedAppliances(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));

  const totals = useMemo(() => {
    const dailyKwh = selectedAppliances.reduce(
      (sum, a) => sum + (a.watts * a.hours * a.count) / 1000,
      0
    );
    const monthlyUnits = dailyKwh * 30;
    const bill = calculateEstimatedBill(monthlyUnits, 0, DEFAULT_DOMESTIC_CONFIG);
    return {
      dailyKwh:     dailyKwh.toFixed(2),
      monthlyUnits: Math.round(monthlyUnits),
      monthlyCost:  bill.total,
    };
  }, [selectedAppliances]);

  return (
    <div className="page appliance-page">

      {/* ── Sticky page header ─────────────────────────────────────────── */}
      <header className="page__header page__header--sticky">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
          <div>
            <h2 className="page__title" style={{ fontSize: '20px' }}>Appliance Cost Estimator</h2>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)' }}>
              Estimate your monthly bill by usage
            </p>
          </div>
        </div>
      </header>

      {/* ── Sticky summary card (below header) ────────────────────────── */}
      <div className="appliance-summary-sticky">
        <div
          className="scard"
          style={{
            padding: '16px 20px',
            background: 'var(--surface-2)',
            border: '1px solid var(--primary-glow)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                Monthly Est. Bill
              </p>
              <h3 style={{ fontSize: '26px', color: 'var(--primary-hi)', margin: 0 }}>
                {formatInr(totals.monthlyCost)}
              </h3>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                Consumption
              </p>
              <h3 style={{ fontSize: '22px', margin: 0 }}>
                {totals.monthlyUnits}{' '}
                <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-3)' }}>Units</span>
              </h3>
            </div>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              <strong>Daily:</strong> {totals.dailyKwh} kWh
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              <strong>Avg Rate:</strong>{' '}
              {formatInr(Math.round((totals.monthlyCost / (totals.monthlyUnits || 1)) * 100) / 100)}/u
            </span>
          </div>
        </div>
      </div>

      {/* ── Your appliances ────────────────────────────────────────────── */}
      <section style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Your Appliances
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {selectedAppliances.map(app => (
            <div key={app.id} className="scard" style={{ padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{app.icon || '🔌'}</span>
                  <div>
                    <h4 style={{ fontSize: '14px', margin: 0, fontWeight: 600 }}>{app.name}</h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0 }}>{app.watts} W</p>
                  </div>
                </div>
                <button
                  className="icon-btn-ghost"
                  style={{ color: 'var(--red)' }}
                  onClick={() => removeAppliance(app.id)}
                  aria-label={`Remove ${app.name}`}
                >
                  <FiTrash2 size={14} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Qty */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Qty</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      className="icon-btn-ghost icon-btn--sm"
                      onClick={() => updateAppliance(app.id, 'count', Math.max(1, app.count - 1))}
                      aria-label="Decrease quantity"
                    >
                      <FiMinus size={12} />
                    </button>
                    <span style={{ fontSize: '15px', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{app.count}</span>
                    <button
                      className="icon-btn-ghost icon-btn--sm"
                      onClick={() => updateAppliance(app.id, 'count', app.count + 1)}
                      aria-label="Increase quantity"
                    >
                      <FiPlus size={12} />
                    </button>
                  </div>
                </div>

                {/* Hours/Day */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Hours / Day
                  </label>
                  <input
                    type="range"
                    min="0.5" max="24" step="0.5"
                    value={app.hours}
                    onChange={e => updateAppliance(app.id, 'hours', parseFloat(e.target.value))}
                    style={{ width: '100%', height: 4, accentColor: 'var(--primary)' }}
                    aria-label={`${app.name} hours per day`}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{app.hours}h</span>
                    <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                      {((app.watts * app.hours * app.count) / 1000).toFixed(1)} u/day
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {selectedAppliances.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-sm)' }}>
              No appliances added yet. Pick some below.
            </div>
          )}
        </div>
      </section>

      {/* ── Add appliance ──────────────────────────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Add Appliance
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {COMMON_APPLIANCES.map(app => (
            <button
              key={app.name}
              className="btn btn--ghost"
              style={{
                justifyContent: 'flex-start', padding: '10px 12px',
                fontSize: '12px', height: 'auto',
                flexDirection: 'column', alignItems: 'flex-start',
                gap: 4, border: '1px solid var(--border)',
              }}
              onClick={() => addAppliance(app)}
            >
              <span style={{ fontSize: 18 }}>{app.icon}</span>
              <span style={{ fontWeight: 500 }}>{app.name}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{app.watts} W</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Saving tip ─────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 32, marginBottom: 16,
          background: 'var(--surface-3)', padding: 16,
          borderRadius: 8, display: 'flex', gap: 10,
          color: 'var(--primary)',
        }}
      >
        <FiInfo size={18} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <h4 style={{ fontSize: '14px', marginBottom: 4, fontWeight: 700 }}>Saving Tip</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            {totals.monthlyUnits > 200
              ? `You've crossed 200 units — you're now in a higher slab. Reducing AC usage by 1 hour daily could save ~₹150/month.`
              : `Keeping consumption below 125 units keeps you in the lower slab rate (₹4.50 vs ₹6.00 per unit).`}
          </p>
        </div>
      </div>

    </div>
  );
}
