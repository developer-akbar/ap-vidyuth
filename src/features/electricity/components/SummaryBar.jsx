import { FiAlertTriangle, FiCheckCircle, FiZap } from 'react-icons/fi';
import { formatInr } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';

const RupeeIcon = ({ size }) => <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1 }}>₹</span>;

export function SummaryBar({ services }) {
  const { t } = useTranslation();
  const due   = services.filter(s => s.lastStatus === 'DUE');
  const paid  = services.filter(s => s.lastStatus === 'PAID' || s.lastStatus === 'NO_DUES');
  const totalDue = due.reduce((s, x) => s + (x.lastAmountDue || 0), 0);

  const stats = [
    { icon: FiZap,          label: t('services'),  value: services.length, tone: 'blue'   },
    { icon: RupeeIcon,      label: t('total_due'), value: totalDue > 0 ? formatInr(totalDue) : '₹0', tone: totalDue > 0 ? 'red' : 'slate' },
    { icon: FiAlertTriangle,label: t('pending'),   value: due.length,  tone: due.length > 0 ? 'amber' : 'slate' },
    { icon: FiCheckCircle,  label: t('cleared'),   value: paid.length, tone: 'green'  },
  ];

  return (
    <div className="summary">
      {stats.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className={`stat stat--${tone}`}>
          <div className="stat__icon"><Icon size={15} /></div>
          <div className="stat__body">
            <span className="stat__label">{label}</span>
            <strong className="stat__value">{value}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}