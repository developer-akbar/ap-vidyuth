/**
 * CostSplitTracker — Feature 8
 * Split electricity bill among N people. Mark each as paid.
 * Split config stored in db.setSetting(`split_${serviceNumber}`, {...}).
 */
import { useState, useEffect } from 'react';
import { FiUsers, FiPlus, FiTrash2, FiCheck, FiEdit2, FiX } from 'react-icons/fi';
import { db } from '../../../shared/db/storage.js';
import { formatInr } from '../../../shared/utils/index.js';
import toast from 'react-hot-toast';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function CostSplitTracker({ service }) {
  const [split, setSplit] = useState(null);
  const [setupMode, setSetupMode] = useState(false);
  const [names, setNames] = useState(['Me', '']);
  const key = `split_${service.serviceNumber}`;

  const totalBill = service.lastAmountDue || service.paidAmount || 0;

  useEffect(() => {
    db.getSetting(key).then(v => {
      if (v) setSplit(v);
    });
  }, [key]);

  async function saveSplit() {
    const validNames = names.filter(n => n.trim());
    if (validNames.length < 2) { toast.error('Add at least 2 people'); return; }
    const perPerson = Math.round(totalBill / validNames.length);
    const data = {
      people: validNames.map(name => ({ name: name.trim(), share: perPerson, paid: name.trim() === 'Me' })),
      totalBill,
      month: currentMonth(),
    };
    await db.setSetting(key, data);
    setSplit(data);
    setSetupMode(false);
    toast.success('Split saved');
  }

  async function togglePaid(idx) {
    if (!split) return;
    const updated = {
      ...split,
      people: split.people.map((p, i) => i === idx ? { ...p, paid: !p.paid, paidDate: !p.paid ? new Date().toISOString().slice(0, 10) : null } : p),
    };
    await db.setSetting(key, updated);
    setSplit(updated);
  }

  async function clearSplit() {
    await db.setSetting(key, null);
    setSplit(null);
    setSetupMode(false);
  }

  // Reset if bill changed month
  useEffect(() => {
    if (split && split.month !== currentMonth()) {
      // New month — auto-reset
      const reset = { ...split, month: currentMonth(), totalBill, people: split.people.map(p => ({ ...p, paid: p.name === 'Me', paidDate: null, share: Math.round(totalBill / split.people.length) }) ) };
      db.setSetting(key, reset);
      setSplit(reset);
    }
  }, [split, totalBill, key]);

  if (setupMode) {
    return (
      <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>Split {formatInr(totalBill)} among:</span>
          <button className="icon-btn-micro" onClick={() => setSetupMode(false)}><FiX size={13} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
          {names.map((name, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={name}
                onChange={e => setNames(names.map((n, j) => j === i ? e.target.value : n))}
                placeholder={`Person ${i + 1}`}
                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-1)', color: 'var(--text-1)', fontSize: '13px' }}
              />
              {names.length > 2 && (
                <button className="icon-btn-micro" onClick={() => setNames(names.filter((_, j) => j !== i))}><FiTrash2 size={11} /></button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setNames([...names, ''])} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiPlus size={12} /> Add person
          </button>
          <button className="btn btn--pay btn--sm" onClick={saveSplit} style={{ flex: 1, justifyContent: 'center' }}>
            Save Split
          </button>
        </div>
        {names.filter(n => n.trim()).length > 1 && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-3)', textAlign: 'center' }}>
            {formatInr(Math.round(totalBill / names.filter(n => n.trim()).length))} per person
          </div>
        )}
      </div>
    );
  }

  if (!split || totalBill === 0) {
    return (
      <button
        onClick={() => { setNames(['Me', '']); setSetupMode(true); }}
        disabled={totalBill === 0}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          width: '100%', padding: '8px 10px', background: 'transparent',
          border: '1px dashed var(--border-md)', borderRadius: 'var(--radius-sm)',
          color: totalBill === 0 ? 'var(--text-3)' : 'var(--text-2)', fontSize: '12px', cursor: totalBill === 0 ? 'not-allowed' : 'pointer',
          marginTop: '8px'
        }}
      >
        <FiUsers size={13} /> Split bill with flatmates / family
      </button>
    );
  }

  const paidCount = split.people.filter(p => p.paid).length;
  const pendingCount = split.people.length - paidCount;

  return (
    <div style={{ marginTop: '8px', padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
          <FiUsers size={13} style={{ color: 'var(--primary)' }} />
          {split.people.length} people · {formatInr(split.people[0]?.share || 0)} each
          {pendingCount > 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber, #f59e0b)' }}>· {pendingCount} pending</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="icon-btn-micro" onClick={() => { setNames(split.people.map(p => p.name)); setSetupMode(true); }} title="Edit split"><FiEdit2 size={11} /></button>
          <button className="icon-btn-micro" onClick={clearSplit} title="Clear split" style={{ color: 'var(--text-3)' }}><FiTrash2 size={11} /></button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {split.people.map((person, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: person.paid ? 'rgba(34,197,94,0.08)' : 'var(--surface-1)',
              border: `1px solid ${person.paid ? 'var(--green, #22c55e)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>{person.name}</span>
              {person.paid && person.paidDate && (
                <span style={{ fontSize: '10px', color: 'var(--text-3)', marginLeft: '6px' }}>paid {person.paidDate}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{formatInr(person.share)}</span>
              <button
                onClick={() => togglePaid(i)}
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: person.paid ? 'var(--green, #22c55e)' : 'var(--surface-3)',
                  color: person.paid ? '#fff' : 'var(--text-2)'
                }}
              >
                {person.paid ? <><FiCheck size={11} /> Paid</> : 'Mark paid'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {pendingCount === 0 && (
        <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--green, #22c55e)', fontWeight: 600 }}>
          🎉 All {split.people.length} people have paid!
        </div>
      )}
    </div>
  );
}
