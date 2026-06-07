import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import updateLocale from 'dayjs/plugin/updateLocale';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(updateLocale);

// Shorten relative time strings
dayjs.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s ago',
    s: 's',
    m: '1m',
    mm: '%dm',
    h: '1h',
    hh: '%dh',
    d: '1d',
    dd: '%dd',
    M: '1mo',
    MM: '%dmo',
    y: '1y',
    yy: '%dy'
  }
});

export function formatInr(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.format('DD MMM YYYY');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.format('DD MMM YYYY, h:mm A');
}

export function fromNow(value) {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.fromNow();
}

export function getDueTone(dueDate, isPaid) {
  if (isPaid) return 'success';
  if (!dueDate) return 'neutral';
  const d = dayjs(dueDate);
  if (!d.isValid()) return 'neutral';
  const diff = d.diff(dayjs(), 'day');
  if (diff < 0) return 'danger';
  if (diff <= 3) return 'warning';
  return 'info';
}

export function getDueCopy(dueDate, isPaid) {
  if (isPaid) return 'Paid';
  if (!dueDate) return null;
  const d = dayjs(dueDate);
  if (!d.isValid()) return null;
  const diff = d.diff(dayjs(), 'day');
  if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff}d`;
}

export function isValidServiceNumber(value) {
  return /^\d{13}$/.test(String(value || '').trim());
}

export function generateShareTable(items) {
  if (!items || items.length === 0) return '';
  
  const maxName = Math.min(Math.max(...items.map(i => i.name.length), 4), 14);
  const maxAmt = Math.max(...items.map(i => i.amount.toLocaleString('en-IN').length), 9);
  const maxUnits = Math.max(...items.map(i => String(i.units).length), 5);

  const padL = (str, len) => String(str).length > len ? String(str).substring(0, len-2) + '..' : String(str).padEnd(len, ' ');
  const padR = (str, len) => String(str).length > len ? String(str).substring(0, len-2) + '..' : String(str).padStart(len, ' ');

  let table = '```text\n';
  table += `${padL('Name', maxName)} | ${padR('Amount(₹)', maxAmt)} | ${padR('Units', maxUnits)}\n`;
  table += '-'.repeat(maxName + maxAmt + maxUnits + 6) + '\n';
  
  let totalAmount = 0;
  let totalUnits = 0;
  items.forEach(c => {
    totalAmount += c.amount;
    totalUnits += c.units;
    table += `${padL(c.name, maxName)} | ${padR(c.amount.toLocaleString('en-IN'), maxAmt)} | ${padR(c.units, maxUnits)}\n`;
  });
  table += '-'.repeat(maxName + maxAmt + maxUnits + 6) + '\n';
  table += `${padL('Total', maxName)} | ${padR(totalAmount.toLocaleString('en-IN'), maxAmt)} | ${padR(totalUnits, maxUnits)}\n`;
  table += '```';
  return table;
}
