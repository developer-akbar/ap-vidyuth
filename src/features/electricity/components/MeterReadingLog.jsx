/**
 * MeterReadingLog — Feature 7
 * Mid-month tracker: log meter readings → project end-of-month units + cost.
 * Readings stored in db.setSetting(`readings_${serviceNumber}`, [...]).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { FiZap, FiPlus, FiTrash2, FiTrendingUp } from 'react-icons/fi';
import { db } from '../../../shared/db/storage.js';
import { formatInr } from '../../../shared/utils/index.js';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG, DEFAULT_COMMERCIAL_CONFIG } from '../utils/billing.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MeterReadingLog({ service }) {
  const { t } = useTranslation();
  const [readings, setReadings] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newReading, setNewReading] = useState('');
  const key = `readings_${service.serviceNumber}`;

  const loadReadings = useCallback(async () => {
    const v = await db.getSetting(key);
    setReadings(Array.isArray(v) ? v : []);
  }, [key]);

  useEffect(() => {
    loadReadings();
    // Watch for changes in db settings for this key to stay in sync
    const interval = setInterval(loadReadings, 2000); // Simple sync for local db
    return () => clearInterval(interval);
  }, [loadReadings]);

  // Only keep readings from current billing period (last 35 days)
  const recentReadings = useMemo(() => {
    const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
    return readings.filter(r => new Date(r.date).getTime() > cutoff);
  }, [readings]);

  const projection = useMemo(() => {
    if (recentReadings.length < 2) return null;
    const sorted = [...recentReadings].sort((a, b) => new Date(a.date) - new Date(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const daysDiff = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
    if (daysDiff < 1) return null;

    const unitsPerDay = (last.reading - first.reading) / daysDiff;
    if (unitsPerDay <= 0) return null;

    // Days remaining in month
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = (endOfMonth - new Date(last.date)) / (1000 * 60 * 60 * 24);
    const projectedUnits = Math.round((last.reading - first.reading) + (unitsPerDay * daysLeft));

    const bill = calculateEstimatedBill(projectedUnits);

    return { projectedUnits, unitsPerDay: unitsPerDay.toFixed(1), daysLeft: Math.round(daysLeft), estimatedBill: bill?.total || null };
  }, [recentReadings, service]);

  async function addReading() {
    const val = Number(newReading);
    if (!val || val <= 0) { toast.error(t('enter_valid_reading')); return; }
    
    // Sort recent to find the latest
    const sortedRecent = [...recentReadings].sort((a, b) => new Date(a.date) - new Date(b.date));
    const lastReading = sortedRecent[sortedRecent.length - 1];
    
    if (lastReading && val < lastReading.reading) {
      toast.error(t('reading_less_than_prev'));
      return;
    }

    // Logic to calculate projected bill for this single reading (compatibility with BillPredictor)
    const startReading = parseFloat(String(service.closingRdg || 0).replace(/[^0-9.]/g, ''));
    const unitsSoFar = val - startReading;
    
    const billDateStr = service.lastBillDate || service.billDate;
    let predictedBill = null;
    if (billDateStr && unitsSoFar > 0) {
       const startDate = new Date(billDateStr);
       const now = new Date();
       const msDiff = now.getTime() - startDate.getTime();
       const daysPassed = Math.max(1, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
       const predictedUnits = Math.round((unitsSoFar / daysPassed) * 30);
       
       const cat = (service.category || '').toUpperCase();
       const isCommercial = cat.includes('LT-II') || cat.includes('LT II') || cat.includes('LT-2') || cat.includes('CAT-II') || cat.includes('COMMERCIAL');
       const config = isCommercial ? DEFAULT_COMMERCIAL_CONFIG : DEFAULT_DOMESTIC_CONFIG;
       const load = service.ctrLoad || 1;
       
       predictedBill = calculateEstimatedBill(predictedUnits, load, config).total;
    }

    const updated = [...readings, { 
      date: new Date().toISOString(), 
      reading: val,
      unitsSoFar: unitsSoFar > 0 ? unitsSoFar : 0,
      predictedBill: predictedBill
    }];
    await db.setSetting(key, updated);
    setReadings(updated);
    setNewReading('');
    setAdding(false);
    toast.success(t('reading_logged'));
  }

  async function removeReading(readingToRemove) {
    const updated = readings.filter(r => r !== readingToRemove);
    await db.setSetting(key, updated);
    setReadings(updated);
  }

  const fmtDate = iso => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${d.getDate()} ${MO[d.getMonth()]} ${time}`;
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>
          <FiZap size={13} style={{ color: 'var(--primary)' }} /> {t('meter_reading_log')}
        </div>
        <button
          className="icon-btn-micro"
          onClick={() => setAdding(v => !v)}
          title={t('log')}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--primary)' }}
        >
          <FiPlus size={12} /> {t('log')}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
          <input
            type="number"
            value={newReading}
            onChange={e => setNewReading(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addReading(); if (e.key === 'Escape') setAdding(false); }}
            placeholder={t('enter_current_reading')}
            style={{
              flex: 1, padding: '6px 10px', border: '1px solid var(--primary)',
              borderRadius: 'var(--radius-sm)', background: 'var(--surface-1)',
              color: 'var(--text-1)', fontSize: '13px'
            }}
            autoFocus
          />
          <button className="btn btn--pay btn--sm" onClick={addReading} style={{ flexShrink: 0 }}>{t('save')}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setAdding(false)} style={{ flexShrink: 0 }}>{t('cancel')}</button>
        </div>
      )}

      {recentReadings.length === 0 && !adding && (
        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-3)', fontSize: '11px', border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-sm)' }}>
          {t('log_hint')}
        </div>
      )}

      {recentReadings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
          {[...recentReadings].sort((a, b) => new Date(b.date) - new Date(a.date)).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>{fmtDate(r.date)}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{r.reading.toLocaleString('en-IN')} u</span>
              <button className="icon-btn-micro" onClick={() => removeReading(r)} style={{ color: 'var(--text-3)' }}>
                <FiTrash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {projection && (
        <div style={{ padding: '10px', background: 'var(--primary-dim, rgba(99,102,241,0.08))', border: '1px solid var(--primary-glow, rgba(99,102,241,0.3))', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>
            <FiTrendingUp size={13} /> {t('month_end_projection')}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{t('projected_units')}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)' }}>{projection.projectedUnits} u</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{t('daily_usage')}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)' }}>{projection.unitsPerDay} u/day</div>
            </div>
            {projection.estimatedBill != null && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{t('est_bill')}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>{formatInr(projection.estimatedBill)}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{t('days_left')}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)' }}>{projection.daysLeft}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
