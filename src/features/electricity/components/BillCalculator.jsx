import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiZap, FiInfo, FiTrendingUp, FiTrendingDown, FiClock, FiAlertCircle, FiPlus, FiMinus, FiChevronDown, FiActivity, FiAward, FiCheckCircle, FiTrash2 } from 'react-icons/fi';
import { LuCalculator } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG, DEFAULT_COMMERCIAL_CONFIG } from '../utils/billing.js';
import { formatInr } from '../../../shared/utils/index.js';
import { db } from '../../../shared/db/storage.js';

export function BillCalculator({ open, service, onClose }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('progress');
  const [units, setUnits] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [manualLastReading, setManualLastReading] = useState('');
  const [load, setLoad] = useState(1);
  const [type, setType] = useState('domestic');
  const [readings, setReadings] = useState([]);

  const loadReadings = useCallback(async () => {
    if (!service) return;
    const data = await db.getSetting('readings_' + service.serviceNumber);
    if (data && Array.isArray(data)) setReadings(data);
    else setReadings([]);
  }, [service?.serviceNumber]);

  // Watch for changes in db settings for this key to stay in sync
  useEffect(() => {
    if (open && service) {
      loadReadings();
      const interval = setInterval(loadReadings, 2000);
      return () => clearInterval(interval);
    }
  }, [open, service?.serviceNumber, loadReadings]);

  // Reset state when service changes to ensure individual service isolation
  useEffect(() => {
    if (service && open) {
      const cat = (service.category || '').toUpperCase();
      const isCommercial = cat.includes('LT-II') || cat.includes('LT II') || cat.includes('LT-2') || cat.includes('CAT-II') || cat.includes('COMMERCIAL');
      setType(isCommercial ? 'commercial' : 'domestic');

      setLoad(service.ctrLoad || 1);
      setManualLastReading(service.closingRdg || '');
      setUnits('');
      setCurrentReading('');
    }
  }, [service?.id, service?.serviceNumber, open]);

  const config = type === 'commercial' ? DEFAULT_COMMERCIAL_CONFIG : DEFAULT_DOMESTIC_CONFIG;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';

    const handleBack = (e) => {
      if (e.type === 'app-back-button' && e.detail) {
        e.detail.handled = true;
      }
      onClose();
    };

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('app-back-button', handleBack);
    window.addEventListener('keydown', handleEsc);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  const progressResult = useMemo(() => {
    const billDateStr = service?.lastBillDate || service?.billDate;
    if (mode !== 'progress' || !currentReading || !billDateStr) return null;

    const current = parseFloat(String(currentReading).replace(/[^0-9.]/g, ''));
    const last = parseFloat(String(manualLastReading !== '' ? manualLastReading : service?.closingRdg).replace(/[^0-9.]/g, ''));

    if (isNaN(current) || isNaN(last) || current <= last) return null;

    const unitsSoFar = current - last;
    const billDate = new Date(billDateStr);
    const now = new Date();
    const msDiff = now.getTime() - billDate.getTime();
    const daysPassed = Math.max(1, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, 30 - daysPassed);

    const currentBill = calculateEstimatedBill(unitsSoFar, load, config);
    const predictedUnits = Math.round((unitsSoFar / daysPassed) * 30);
    const predictedBill = calculateEstimatedBill(predictedUnits, load, config);

    const prevUnits = service?.lastBilledUnits || service?.billedUnits || 0;
    const diffPct = prevUnits > 0 ? Math.round(((predictedUnits - prevUnits) / prevUnits) * 100) : 0;

    return {
      unitsSoFar,
      daysPassed,
      remainingDays,
      currentBill: currentBill.total,
      predictedUnits,
      predictedBill: predictedBill.total,
      predictedDetails: predictedBill,
      diffPct,
      isHigher: predictedUnits > prevUnits
    };
  }, [mode, currentReading, manualLastReading, service, load, config]);

  const historyPrediction = useMemo(() => {
    if (!readings || readings.length < 3 || !service) return null;

    const latest = readings[0];
    const billDateStr = service.lastBillDate || service.billDate;
    if (!billDateStr) return null;

    const startReading = parseFloat(String(service.closingRdg || 0).replace(/[^0-9.]/g, ''));
    const latestReading = parseFloat(String(latest.reading).replace(/[^0-9.]/g, ''));

    const unitsSoFar = latestReading - startReading;
    if (unitsSoFar <= 0) return null;

    const startDate = new Date(billDateStr);
    const latestDate = new Date(latest.date);
    const msDiff = latestDate.getTime() - startDate.getTime();
    const daysPassed = Math.max(1, Math.floor(msDiff / (1000 * 60 * 60 * 24)));

    const predictedUnits = Math.round((unitsSoFar / daysPassed) * 30);
    const predictedBill = calculateEstimatedBill(predictedUnits, load, config);

    return {
      units: predictedUnits,
      amount: predictedBill.total,
      readingsCount: readings.length,
      daysSpanned: daysPassed
    };
  }, [readings, service, load, config]);

  const handleDeleteReading = useCallback(async (readingToDelete) => {
    const updated = readings.filter(r => r !== readingToDelete);
    setReadings(updated);
    await db.setSetting('readings_' + service.serviceNumber, updated);
    toast.success(t('reading_removed'));
  }, [readings, service?.serviceNumber, t]);

  const handleSaveReading = useCallback(async () => {
    if (!currentReading || !progressResult) return;
    const newReading = {
      date: new Date().toISOString(),
      reading: parseFloat(currentReading),
      // Optional: Add metadata that the predictor might use
      unitsSoFar: progressResult.unitsSoFar,
      predictedBill: progressResult.predictedBill
    };
    const updated = [newReading, ...readings].slice(0, 5);
    setReadings(updated);
    await db.setSetting('readings_' + service.serviceNumber, updated);
    setCurrentReading('');
    toast.success(t('reading_logged'));
  }, [currentReading, progressResult, readings, service?.serviceNumber, t]);

  const simpleResult = useMemo(() => {
    const u = parseFloat(units);
    if (isNaN(u) || u < 0) return null;
    return calculateEstimatedBill(u, load, config);
  }, [units, load, config]);

  const sortedReadings = useMemo(() => {
    return [...readings].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [readings]);

  if (!open) return null;

  return createPortal(
    <div className="overlay overlay--center" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="dialog dialog--v2" onClick={e => e.stopPropagation()}>
        <header className="dialog__header dialog__header--v2">
          <div className="dialog__title-group">
            <div className="dialog__icon-wrap">
              <LuCalculator size={20} />
            </div>
            <div>
              <h2 className="dialog__title">{t('bill_predictor')}</h2>
              <p className="dialog__subtitle">{service?.label || service?.customerName || t('untitled')}</p>
            </div>
          </div>
          <button className="icon-btn-ghost icon-btn-ghost--v2" onClick={onClose} aria-label={t('close')}><FiX size={20} /></button>
        </header>

        <div className="dialog__body dialog__body--v2">
          {historyPrediction && (
            <div className="alert-card alert-card--info mb-24">
              <div className="alert-card__icon"><FiAward size={20} /></div>
              <div className="alert-card__content">
                <p className="alert-card__label">{t('final_avg_prediction')}</p>
                <p className="alert-card__text">
                  {t('based_on_logs', { count: historyPrediction.readingsCount })}: <b>{formatInr(historyPrediction.amount)}</b> ({historyPrediction.units}u)
                </p>
              </div>
            </div>
          )}

          <div className="seg seg--v2 mb-24">
            <button className={`seg__btn seg__btn--v2 ${mode === 'progress' ? 'seg__btn--active' : ''}`} onClick={() => setMode('progress')}>{t('progress_check')}</button>
            <button className={`seg__btn seg__btn--v2 ${mode === 'simple' ? 'seg__btn--active' : ''}`} onClick={() => setMode('simple')}>{t('custom_units')}</button>
          </div>

          <div className="form-group mb-24">
            <div className="field">
              <label className="field__label">{t('service_type')}</label>
              <div className="radio-group radio-group--v2">
                <div className={`radio-item radio-item--v2 ${type === 'domestic' ? 'radio-item--active' : ''}`} onClick={() => setType('domestic')}>
                  <div className="radio-circle" /><div className="radio-label">{t('domestic_slabs')}</div>
                </div>
                <div className={`radio-item radio-item--v2 ${type === 'commercial' ? 'radio-item--active' : ''}`} onClick={() => setType('commercial')}>
                  <div className="radio-circle" /><div className="radio-label">{t('commercial_slabs')}</div>
                </div>
              </div>
            </div>
          </div>

          {mode === 'simple' ? (
            <div className="field">
              <label className="field__label">{t('total_units_calculate')}</label>
              <div className="input-with-unit">
                <input type="tel" inputMode="numeric" pattern="[0-9]*" className="field__input field__input--v2" placeholder="e.g. 250" autoFocus value={units} onChange={e => setUnits(e.target.value.replace(/\D/g, ''))} />
                <span className="input-unit">Units</span>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              {(!service?.closingRdg && !manualLastReading) && (
                <div className="field">
                  <label className="field__label">{t('last_month_final_reading')}</label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" className="field__input field__input--v2" placeholder="Last reading" value={manualLastReading} onChange={e => setManualLastReading(e.target.value.replace(/\D/g, ''))} />
                </div>
              )}
              <div className="field">
                <div className="field__header">
                  <label className="field__label">{t('current_meter_reading')}</label>
                  {(service?.closingRdg || manualLastReading) && (
                    <span className="field__hint-text">{t('last')}: <b>{manualLastReading || service.closingRdg}</b></span>
                  )}
                </div>
                <input type="tel" inputMode="numeric" pattern="[0-9]*" className="field__input field__input--v2" placeholder={t('enter_current_reading')} autoFocus value={currentReading} onChange={e => setCurrentReading(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
          )}

          {mode === 'simple' && simpleResult && (
            <div className="result-section--v2 mt-24">
              <div className="hero-stat-card">
                <p className="hero-stat-card__label">Estimated Total Bill</p>
                <h2 className="hero-stat-card__value">{formatInr(simpleResult.total)}</h2>
              </div>
              <div className="receipt-box--v2 mt-16">
                {[
                  { label: 'Energy Charges', val: simpleResult.ec },
                  { label: `Fixed Charges (${load}kW)`, val: simpleResult.fc },
                  { label: 'Electricity Duty (6%)', val: simpleResult.ed },
                  { label: 'Customer Charges', val: simpleResult.cc }
                ].map(r => (
                  <div key={r.label} className="receipt-row--v2">
                    <span>{r.label}</span>
                    <b>{formatInr(r.val)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'progress' && progressResult && (
            <div className="result-section--v2 mt-24">
              <div className="prediction-grid">
                <div className="stat-card--v2">
                  <p className="stat-card__label">Bill So Far</p>
                  <h3 className="stat-card__value">{formatInr(progressResult.currentBill)}</h3>
                </div>
                <div className="stat-card--v2 stat-card--primary">
                  <p className="stat-card__label">Est. 30 Days</p>
                  <h3 className="stat-card__value">{formatInr(progressResult.predictedBill)}</h3>
                </div>
              </div>

              <div className="hero-stat-card mt-16">
                <p className="hero-stat-card__label">{t('monthly_units_prediction')}</p>
                <h2 className="hero-stat-card__value">{progressResult.predictedUnits} <small>Units</small></h2>
                <div className={`trend-pill--v2 ${progressResult.isHigher ? 'trend-pill--danger' : 'trend-pill--success'}`}>
                  {progressResult.isHigher ? <FiTrendingUp size={14} /> : <FiTrendingDown size={14} />}
                  <span><b>{Math.abs(progressResult.diffPct)}% {progressResult.isHigher ? 'higher' : 'lower'}</b> {t('vs_last_year')}</span>
                </div>
              </div>

              <div className="breakdown-box mt-20">
                <p className="breakdown-box__title">{t('predicted_bill_breakdown')}</p>
                <div className="receipt-box--v2">
                  {[
                    { label: `Predicted ${t('energy_charges')}`, val: progressResult.predictedDetails.ec },
                    { label: `Predicted ${t('fixed_charges')}`, val: progressResult.predictedDetails.fc },
                    { label: `Predicted ${t('electricity_duty')} (6%)`, val: progressResult.predictedDetails.ed },
                    { label: t('customer_charges'), val: progressResult.predictedDetails.cc }
                  ].map(r => (
                    <div key={r.label} className="receipt-row--v2 small">
                      <span>{r.label}</span>
                      <b>{formatInr(r.val)}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="info-grid mt-20">
                <div className="info-card--v2">
                  <span className="info-card__label">Used So Far</span>
                  <p className="info-card__value">{progressResult.unitsSoFar} <small>u</small></p>
                  <div className="info-card__footer"><FiClock size={12} /> {progressResult.daysPassed} days</div>
                </div>
                <div className="info-card--v2">
                  <span className="info-card__label">Days Remaining</span>
                  <p className="info-card__value">{progressResult.remainingDays} <small>d</small></p>
                  <div className="info-card__footer">In cycle</div>
                </div>
              </div>

              <div className={`alert-banner--v2 mt-20 ${progressResult.isHigher ? 'alert-banner--warning' : 'alert-banner--success'}`}>
                <FiInfo size={18} className="alert-banner__icon" />
                <p className="alert-banner__text">
                  {progressResult.isHigher
                    ? `Consuming units faster than last month. Target daily: ${Math.round((service?.lastBilledUnits || 100) / 30)}u.`
                    : `Great! Saving ${formatInr(Math.abs((service?.billAmount || 0) - progressResult.predictedBill))} vs last month.`}
                </p>
              </div>
            </div>
          )}

          {readings.length > 0 && (
            <div className="history-section mt-24">
              <div className="section-header">
                <h3 className="section-title">Reading History</h3>
                {readings.length >= 3 && <span className="badge-pill--v2">Trend Analysis Active</span>}
              </div>
              <div className="reading-grid mt-12">
                {sortedReadings.map((r, idx) => (
                  <div key={idx} className="reading-card--v2">
                    <button className="icon-btn-micro icon-btn-micro--danger" onClick={() => handleDeleteReading(r)}>
                      <FiTrash2 size={12} />
                    </button>
                    <div className="reading-card__main">
                      <p className="reading-card__val">{r.reading} <small>({r.unitsSoFar ?? '—'}u)</small></p>
                      <p className="reading-card__date">{new Date(r.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {r.predictedBill != null && (
                      <p className="reading-card__prediction">{formatInr(r.predictedBill)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'progress' && !progressResult && currentReading && (
            <div className="empty-state--v2 mt-24">
              <FiAlertCircle size={32} className="empty-state__icon--error" />
              <p className="empty-state__text">
                {t('invalid_reading_error', { last: manualLastReading || service?.closingRdg || '—' })}
              </p>
            </div>
          )}
        </div>

        <div className="dialog__footer dialog__footer--v2">
          {mode === 'progress' && progressResult && (
            <button
              className="btn btn--secondary btn--v2 flex-1"
              onClick={handleSaveReading}
            >
              <FiActivity size={18} /> {t('save_reading')}
            </button>
          )}
          <button className="btn btn--primary btn--v2 flex-1" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
          }