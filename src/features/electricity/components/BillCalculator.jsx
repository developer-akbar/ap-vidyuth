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
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '500px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <header className="dialog__header" style={{ position: 'relative', paddingBottom: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="sidebar__logo" style={{ width: '32px', height: '32px', background: 'var(--primary-dim)', color: 'var(--primary)' }}>
              <LuCalculator size={18} />
            </div>
            <h2 className="dialog__title" style={{ margin: 0 }}>{t('bill_predictor')}</h2>
          </div>
          <button className="icon-btn-ghost" onClick={onClose} style={{ position: 'absolute', top: '0', right: '0' }} aria-label={t('close')}><FiX size={20} /></button>
        </header>

        <div className="dialog__body" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          {historyPrediction && (
            <div className="scard" style={{ padding: '12px', background: 'var(--primary-dim)', border: '1px solid var(--primary-hi)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
              <div style={{ background: 'var(--primary-hi)', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
                <FiAward size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: 'var(--primary-hi)', fontWeight: '800', textTransform: 'uppercase', margin: 0 }}>{t('final_avg_prediction')}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-1)', margin: 0 }}>
                  {t('based_on_logs', { count: historyPrediction.readingsCount })}: <b>{formatInr(historyPrediction.amount)}</b> ({historyPrediction.units}u)
                </p>
              </div>
            </div>
          )}

          <div className="seg" style={{ marginBottom: '24px' }}>
            <button className={`seg__btn ${mode === 'progress' ? 'seg__btn--active' : ''}`} onClick={() => setMode('progress')}>{t('progress_check')}</button>
            <button className={`seg__btn ${mode === 'simple' ? 'seg__btn--active' : ''}`} onClick={() => setMode('simple')}>{t('custom_units')}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <div className="field">
              <label className="field__label">{t('service_type')}</label>
              <div className="radio-group">
                <div className={`radio-item ${type === 'domestic' ? 'radio-item--active' : ''}`} onClick={() => setType('domestic')}>
                  <div className="radio-circle" /><div className="radio-label">{t('domestic_slabs')}</div>
                </div>
                <div className={`radio-item ${type === 'commercial' ? 'radio-item--active' : ''}`} onClick={() => setType('commercial')}>
                  <div className="radio-circle" /><div className="radio-label">{t('commercial_slabs')}</div>
                </div>
              </div>
            </div>
          </div>

          {mode === 'simple' ? (
            <div className="field">
              <label className="field__label">{t('total_units_calculate')}</label>
              <input type="tel" inputMode="numeric" pattern="[0-9]*" className="field__input" placeholder="e.g. 250" autoFocus value={units} onChange={e => setUnits(e.target.value.replace(/\D/g, ''))} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(!service?.closingRdg && !manualLastReading) && (
                <div className="field">
                  <label className="field__label">{t('last_month_final_reading')}</label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" className="field__input" placeholder="Enter last reading from bill" value={manualLastReading} onChange={e => setManualLastReading(e.target.value.replace(/\D/g, ''))} />
                </div>
              )}
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="field__label" style={{ marginBottom: 0 }}>{t('current_meter_reading')}</label>
                  {(service?.closingRdg || manualLastReading) && (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', display: 'block' }}>{t('last_reading')}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary-hi)' }}>{manualLastReading || service.closingRdg}</span>
                    </div>
                  )}
                </div>
                <input type="tel" inputMode="numeric" pattern="[0-9]*" className="field__input" placeholder={t('enter_current_reading')} autoFocus value={currentReading} onChange={e => setCurrentReading(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
          )}

          {mode === 'simple' && simpleResult && (
            <div style={{ marginTop: '24px' }}>
              <div className="scard" style={{ padding: '20px', background: 'var(--surface-2)', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '4px' }}>Estimated Total Bill</p>
                <h2 style={{ fontSize: '32px', color: 'var(--primary-hi)' }}>{formatInr(simpleResult.total)}</h2>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Energy Charges', val: simpleResult.ec },
                  { label: `Fixed Charges (${load}kW)`, val: simpleResult.fc },
                  { label: 'Electricity Duty (6%)', val: simpleResult.ed },
                  { label: 'Customer Charges', val: simpleResult.cc }
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-2)' }}>{r.label}</span>
                    <span style={{ fontWeight: '600' }}>{formatInr(r.val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'progress' && progressResult && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="scard" style={{ padding: '16px', background: 'var(--surface-2)', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase' }}>Bill So Far</p>
                  <h2 style={{ fontSize: '20px', color: 'var(--text-1)' }}>{formatInr(progressResult.currentBill)}</h2>
                </div>
                <div className="scard" style={{ padding: '16px', background: 'var(--primary-dim)', textAlign: 'center', border: '1px solid var(--primary-hi)' }}>
                  <p style={{ fontSize: '11px', color: 'var(--primary-hi)', marginBottom: '4px', textTransform: 'uppercase' }}>Est. 30 Days</p>
                  <h2 style={{ fontSize: '20px', color: 'var(--primary-hi)' }}>{formatInr(progressResult.predictedBill)}</h2>
                </div>
              </div>

              <div className="scard" style={{ padding: '20px', background: 'var(--surface-2)', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '4px' }}>{t('monthly_units_prediction')}</p>
                <h2 style={{ fontSize: '32px', color: 'var(--primary-hi)' }}>{progressResult.predictedUnits} <span style={{ fontSize: '16px', fontWeight: '400' }}>{t('units')}</span></h2>
                <div style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', marginTop: '8px', background: progressResult.isHigher ? 'var(--red-dim)' : 'var(--green-dim)', color: progressResult.isHigher ? 'var(--red)' : 'var(--green)' }}>
                  {progressResult.isHigher ? <FiTrendingUp size={14} /> : <FiTrendingDown size={14} />}
                  <strong>{Math.abs(progressResult.diffPct)}% {progressResult.isHigher ? 'higher' : 'lower'}</strong> {t('vs_last_year')}
                </div>
              </div>

              <div style={{ marginBlock: '20px', padding: '0 8px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: '800', marginBottom: '10px', textAlign: 'center', textDecoration: 'underline' }}>{t('predicted_bill_breakdown')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: `Predicted ${t('energy_charges')}`, val: progressResult.predictedDetails.ec },
                    { label: `Predicted ${t('fixed_charges')}`, val: progressResult.predictedDetails.fc },
                    { label: `Predicted ${t('electricity_duty')} (6%)`, val: progressResult.predictedDetails.ed },
                    { label: t('customer_charges'), val: progressResult.predictedDetails.cc }
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-3)' }}>{r.label}</span>
                      <span style={{ fontWeight: '600' }}>{formatInr(r.val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                <div className="scard" style={{ padding: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase' }}>Used So Far</p>
                  <p style={{ fontSize: '16px', fontWeight: '700' }}>{progressResult.unitsSoFar} <span style={{ fontSize: '12px', fontWeight: '400' }}>Units</span></p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-2)', marginTop: '4px' }}>
                    <FiClock size={10} /> {progressResult.daysPassed} days
                  </div>
                </div>
                <div className="scard" style={{ padding: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase' }}>Days Remaining</p>
                  <p style={{ fontSize: '16px', fontWeight: '700' }}>{progressResult.remainingDays} <span style={{ fontSize: '12px', fontWeight: '400' }}>Days</span></p>
                  <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px' }}>In cycle</div>
                </div>
              </div>

              <div style={{ marginTop: '20px', padding: '12px', background: 'var(--surface-3)', borderRadius: '8px', borderLeft: '3px solid var(--amber)' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <FiInfo size={16} color="var(--amber)" style={{ marginTop: '2px' }} />
                  <p style={{ fontSize: '12px', color: 'var(--text-1)', margin: 0, lineHeight: '1.5' }}>
                    {progressResult.isHigher
                      ? `You are consuming units faster than last month. Target daily: ${Math.round((service?.lastBilledUnits || 100) / 30)}u.`
                      : `Great! Saving ${formatInr(Math.abs((service?.billAmount || 0) - progressResult.predictedBill))} vs last month.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {readings.length > 0 && (
            <div style={{ marginBlock: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '14px', margin: 0, color: 'var(--text-1)' }}>Reading History</h3>
                {readings.length >= 3 && <span className="paid-tag" style={{ fontSize: '9px' }}>Trend Analysis Active</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {sortedReadings.map((r, idx) => (
                  <div key={idx} className="scard" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', position: 'relative', minWidth: '140px' }}>
                    <button 
                      className="icon-btn-micro" 
                      onClick={() => handleDeleteReading(r)}
                      style={{ position: 'absolute', top: '4px', right: '4px', color: 'var(--text-3)' }}
                    >
                      <FiTrash2 size={11} />
                    </button>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 2px 0' }}>{r.reading} <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-3)' }}>({r.unitsSoFar ?? '—'}u)</span></p>
                      <p style={{ fontSize: '11px', color: 'var(--text-2)', margin: 0 }}>{new Date(r.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {r.predictedBill != null && (
                      <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--primary-hi)', margin: 0 }}>{formatInr(r.predictedBill)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'progress' && !progressResult && currentReading && (
            <div className="state-box" style={{ padding: '20px', marginTop: '20px' }}>
              <FiAlertCircle size={24} color="var(--red)" />
              <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '8px' }}>
                {t('invalid_reading_error', { last: manualLastReading || service?.closingRdg || '—' })}
              </p>
            </div>
          )}
        </div>

        <div className="dialog__footer" style={{ marginTop: '16px', flexShrink: 0, display: 'flex', gap: '10px' }}>
          {mode === 'progress' && progressResult && (
            <button
              className="btn btn--secondary"
              style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px', border: '1px solid var(--primary-hi)', color: 'var(--primary-hi)' }}
              onClick={handleSaveReading}
            >
              <FiActivity size={16} /> {t('save_reading')}
            </button>
          )}
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
          }