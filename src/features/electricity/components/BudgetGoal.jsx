/**
 * BudgetGoal — Feature 3
 * Lets users set a monthly ₹ target per service and shows a progress bar.
 * Budget stored via db.setSetting(`budget_${serviceNumber}`, amount).
 */
import { useState, useEffect } from 'react';
import { FiTarget, FiEdit2, FiCheck, FiX } from 'react-icons/fi';
import { db } from '../../../shared/db/storage.js';
import { formatInr } from '../../../shared/utils/index.js';
import toast from 'react-hot-toast';

export function BudgetGoal({ service }) {
  const [budget, setBudget] = useState(null);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const key = `budget_${service.serviceNumber}`;

  useEffect(() => {
    db.getSetting(key).then(v => {
      if (v) setBudget(Number(v));
    });
  }, [key]);

  const currentEstimate = service.lastAmountDue || service.paidAmount || 0;
  const pct = budget ? Math.round((currentEstimate / budget) * 100) : 0;

  const color = pct > 100 ? 'var(--red, #ef4444)' : pct > 80 ? 'var(--amber, #f59e0b)' : 'var(--green, #22c55e)';

  async function saveBudget() {
    const val = Number(inputVal);
    if (!val || val <= 0) { toast.error('Enter a valid amount'); return; }
    await db.setSetting(key, val);
    setBudget(val);
    setEditing(false);
    toast.success('Budget saved');
  }

  async function clearBudget() {
    await db.setSetting(key, null);
    setBudget(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="budget-edit" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
        <FiTarget size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: 'var(--text-2)', flexShrink: 0 }}>Budget ₹</span>
        <input
          type="number"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setEditing(false); }}
          placeholder={service.insights?.avgAmount ? Math.round(service.insights.avgAmount) : '2000'}
          style={{
            flex: 1, padding: '4px 8px', border: '1px solid var(--border-md)',
            borderRadius: 'var(--radius-sm)', background: 'var(--surface-1)',
            color: 'var(--text-1)', fontSize: '13px', minWidth: 0
          }}
          autoFocus
        />
        <button className="icon-btn-micro" onClick={saveBudget} title="Save"><FiCheck size={13} style={{ color: 'var(--green, #22c55e)' }} /></button>
        <button className="icon-btn-micro" onClick={() => setEditing(false)} title="Cancel"><FiX size={13} /></button>
        {budget && <button className="icon-btn-micro" onClick={clearBudget} title="Clear budget" style={{ color: 'var(--text-3)', fontSize: '10px' }}>Clear</button>}
      </div>
    );
  }

  if (!budget) {
    return (
      <button
        onClick={() => { setInputVal(''); setEditing(true); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          width: '100%', padding: '8px 10px', background: 'transparent',
          border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-3)', fontSize: '12px', cursor: 'pointer'
        }}
      >
        <FiTarget size={13} /> Set monthly budget goal
      </button>
    );
  }

  return (
    <div style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FiTarget size={13} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
            Budget: <b>{formatInr(budget)}</b>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color }}>
            {pct}% used
          </span>
          <button className="icon-btn-micro" onClick={() => { setInputVal(String(budget)); setEditing(true); }} title="Edit budget">
            <FiEdit2 size={11} />
          </button>
        </div>
      </div>
      <div style={{ height: '6px', background: 'var(--surface-3)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>Current: {formatInr(currentEstimate)}</span>
        {pct > 100
          ? <span style={{ fontSize: '10px', color: 'var(--red, #ef4444)', fontWeight: 600 }}>Over by {formatInr(currentEstimate - budget)}</span>
          : <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>Remaining: {formatInr(budget - currentEstimate)}</span>
        }
      </div>
    </div>
  );
}
