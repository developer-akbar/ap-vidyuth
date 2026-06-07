/**
 * PaymentStreak — Feature 6
 * Calculates consecutive on-time payment streak from billHistory.
 * Shows a fire emoji badge and a month-by-month timeline on expand.
 */
import { useState, useMemo } from 'react';
import { FiChevronDown, FiCheckCircle, FiXCircle, FiClock } from 'react-icons/fi';

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMo(billDate) {
  if (!billDate) return '?';
  const d = new Date(billDate);
  return `${MO[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}

function calcStreak(billHistory) {
  if (!Array.isArray(billHistory) || billHistory.length === 0) return { streak: 0, timeline: [] };

  // Sort newest first
  const sorted = [...billHistory].sort((a, b) => new Date(b.billDate) - new Date(a.billDate));

  let streak = 0;
  const timeline = sorted.map(bill => {
    const paidOnTime =
      bill.isPaid &&
      bill.paidDate &&
      bill.dueDate &&
      new Date(bill.paidDate) <= new Date(bill.dueDate);
    const paidLate =
      bill.isPaid &&
      bill.paidDate &&
      bill.dueDate &&
      new Date(bill.paidDate) > new Date(bill.dueDate);
    return {
      month: fmtMo(bill.billDate),
      status: paidOnTime ? 'ontime' : paidLate ? 'late' : bill.isPaid ? 'paid' : 'unpaid',
      amount: bill.billAmount,
    };
  });

  for (const bill of sorted) {
    const paidOnTime =
      bill.isPaid &&
      bill.paidDate &&
      bill.dueDate &&
      new Date(bill.paidDate) <= new Date(bill.dueDate);
    if (paidOnTime) streak++;
    else break;
  }

  return { streak, timeline };
}

export function PaymentStreak({ service }) {
  const [open, setOpen] = useState(false);

  const { streak, timeline } = useMemo(
    () => calcStreak(service.billHistory || service.paymentHistory || []),
    [service.billHistory, service.paymentHistory]
  );

  if (timeline.length === 0) return null;

  const currentBillOverdue =
    !service.isPaid &&
    service.lastDueDate &&
    new Date(service.lastDueDate) < new Date() &&
    service.lastAmountDue > 0;

  const dotColor = s =>
    s === 'ontime' ? 'var(--green, #22c55e)' : s === 'late' ? 'var(--amber, #f59e0b)' : s === 'paid' ? 'var(--primary)' : 'var(--red, #ef4444)';

  const dotIcon = s =>
    s === 'ontime' || s === 'paid' ? <FiCheckCircle size={11} /> : s === 'late' ? <FiClock size={11} /> : <FiXCircle size={11} />;

  return (
    <div style={{ marginTop: '8px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          width: '100%', padding: '8px 10px', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-1)', cursor: 'pointer', justifyContent: 'space-between'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          {streak >= 3 ? '🔥' : streak >= 1 ? '✅' : '📊'}
          {streak > 0
            ? <><b>{streak} month{streak !== 1 ? 's' : ''}</b> on-time streak</>
            : <span style={{ color: 'var(--text-3)' }}>Payment streak tracker</span>}
        </span>
        <FiChevronDown size={13} style={{ transition: 'transform 0.3s', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--text-3)' }} />
      </button>

      {open && (
        <div style={{ padding: '10px', background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)', borderTop: 'none' }}>
          {currentBillOverdue && (
            <div style={{ padding: '8px', background: 'var(--amber-dim, rgba(245,158,11,0.1))', border: '1px solid var(--amber, #f59e0b)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--amber, #f59e0b)', marginBottom: '10px' }}>
              ⚠️ This month's bill is overdue — your streak may break. Pay now to keep it alive!
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {timeline.slice(0, 12).map((entry, i) => (
              <div
                key={i}
                title={`${entry.month}: ${entry.status}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '2px', minWidth: '36px'
                }}
              >
                <div style={{ color: dotColor(entry.status) }}>{dotIcon(entry.status)}</div>
                <span style={{ fontSize: '9px', color: 'var(--text-3)' }}>{entry.month}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[['ontime', 'On time'], ['late', 'Late'], ['unpaid', 'Unpaid']].map(([s, label]) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-3)' }}>
                <div style={{ color: dotColor(s) }}>{dotIcon(s)}</div>
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
