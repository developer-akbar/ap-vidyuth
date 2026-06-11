import { useState, useMemo, useEffect, useCallback } from 'react';
import { FiInfo, FiZap, FiPlus, FiMinus, FiTrash2, FiArrowLeft } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG } from '../utils/billing.js';
import { formatInr } from '../../../shared/utils/index.js';
import { db } from '../../../shared/db/storage.js';

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
  const { t } = useTranslation();
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
    <div className="page appliance-page--v2">

      {/* ── Sticky page header ─────────────────────────────────────────── */}
      <header className="page__header page__header--sticky">
        <div className="page__header-group">
          <button className="icon-btn-ghost icon-btn-ghost--v2" onClick={onBack} aria-label={t('back')}>
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h2 className="page__title">{t('appliance_cost_estimator', 'Appliance Estimator')}</h2>
            <p className="page__subtitle">
              {t('estimate_bill_desc', 'Estimate monthly bill by usage')}
            </p>
          </div>
        </div>
      </header>

      {/* ── Sticky summary card (below header) ────────────────────────── */}
      <div className="appliance-summary-sticky--v2">
        <div className="summary-card--v2">
          <div className="summary-card__main">
            <div className="summary-card__item">
              <p className="summary-card__label">{t('monthly_est_bill', 'Monthly Est. Bill')}</p>
              <h3 className="summary-card__value summary-card__value--primary">
                {formatInr(totals.monthlyCost)}
              </h3>
            </div>
            <div className="summary-card__item right">
              <p className="summary-card__label">{t('consumption', 'Consumption')}</p>
              <h3 className="summary-card__value">
                {totals.monthlyUnits} <small>Units</small>
              </h3>
            </div>
          </div>
          <div className="summary-card__footer">
            <div className="summary-card__meta">
              <span className="summary-card__meta-item">
                <strong>Daily:</strong> {totals.dailyKwh} kWh
              </span>
              <span className="summary-card__meta-item">
                <strong>Avg Rate:</strong> {formatInr(Math.round((totals.monthlyCost / (totals.monthlyUnits || 1)) * 100) / 100)}/u
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Your appliances ────────────────────────────────────────────── */}
      <section className="mt-24">
        <h3 className="section-title--v2 mb-12">
          {t('your_appliances', 'Your Appliances')}
        </h3>
        <div className="appliance-list--v2">
          {selectedAppliances.map(app => (
            <div key={app.id} className="appliance-item--v2">
              <div className="appliance-item__header">
                <div className="appliance-item__identity">
                  <span className="appliance-item__icon">{app.icon || '🔌'}</span>
                  <div>
                    <h4 className="appliance-item__name">{app.name}</h4>
                    <p className="appliance-item__watts">{app.watts} W</p>
                  </div>
                </div>
                <button
                  className="icon-btn-micro icon-btn-micro--danger"
                  onClick={() => removeAppliance(app.id)}
                  aria-label={`Remove ${app.name}`}
                >
                  <FiTrash2 size={14} />
                </button>
              </div>

              <div className="appliance-item__controls">
                {/* Qty */}
                <div className="appliance-item__qty">
                  <label className="control-label">{t('qty', 'Qty')}</label>
                  <div className="qty-picker--v2">
                    <button
                      className="qty-btn"
                      onClick={() => updateAppliance(app.id, 'count', Math.max(1, app.count - 1))}
                    >
                      <FiMinus size={14} />
                    </button>
                    <span className="qty-val">{app.count}</span>
                    <button
                      className="qty-btn"
                      onClick={() => updateAppliance(app.id, 'count', app.count + 1)}
                    >
                      <FiPlus size={14} />
                    </button>
                  </div>
                </div>

                {/* Hours/Day */}
                <div className="appliance-item__hours">
                  <div className="control-header">
                    <label className="control-label">{t('hours_day', 'Hours / Day')}</label>
                    <span className="hours-badge">{app.hours}h</span>
                  </div>
                  <input
                    type="range"
                    min="0.5" max="24" step="0.5"
                    className="slider--v2"
                    value={app.hours}
                    onChange={e => updateAppliance(app.id, 'hours', parseFloat(e.target.value))}
                  />
                  <div className="appliance-item__daily-usage">
                    {((app.watts * app.hours * app.count) / 1000).toFixed(1)} u/day
                  </div>
                </div>
              </div>
            </div>
          ))}

          {selectedAppliances.length === 0 && (
            <div className="empty-state--v2 bordered">
              <FiZap size={32} className="empty-state__icon mb-12" />
              <p>{t('no_appliances_yet', 'No appliances added yet. Pick some below.')}</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Add appliance ──────────────────────────────────────────────── */}
      <section className="mt-32">
        <h3 className="section-title--v2 mb-12">
          {t('add_appliance', 'Add Appliance')}
        </h3>
        <div className="appliance-grid--v2">
          {COMMON_APPLIANCES.map(app => (
            <button
              key={app.name}
              className="add-appliance-btn--v2"
              onClick={() => addAppliance(app)}
            >
              <span className="add-appliance-btn__icon">{app.icon}</span>
              <span className="add-appliance-btn__name">{app.name}</span>
              <span className="add-appliance-btn__watts">{app.watts} W</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Saving tip ─────────────────────────────────────────────────── */}
      <div className="alert-banner--v2 alert-banner--info mt-32 mb-32">
        <FiInfo size={20} className="alert-banner__icon" />
        <div className="alert-banner__content">
          <h4 className="alert-banner__title">{t('saving_tip', 'Saving Tip')}</h4>
          <p className="alert-banner__text">
            {totals.monthlyUnits > 200
              ? `You've crossed 200 units — you're now in a higher slab. Reducing AC usage by 1 hour daily could save ~₹150/month.`
              : `Keeping consumption below 125 units keeps you in the lower slab rate (₹4.50 vs ₹6.00 per unit).`}
          </p>
        </div>
      </div>

    </div>

  );
}
