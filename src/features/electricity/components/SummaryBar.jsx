import { FiAlertTriangle, FiCheckCircle, FiZap } from 'react-icons/fi';
import { formatInr } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';

const RupeeIcon = ({ size }) => <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1 }}>₹</span>;

export function SummaryBar({ services }) {
  const { t } = useTranslation();
  const total = services.length;
  const due   = services.filter(s => s.lastStatus === 'DUE');
  const paid  = services.filter(s => s.lastStatus === 'PAID' || s.lastStatus === 'NO_DUES');
  const totalDue = due.reduce((s, x) => s + (x.lastAmountDue || 0), 0);
  
  const paidPercentage = total > 0 ? Math.round((paid.length / total) * 100) : 0;

  const stats = [
    { icon: FiZap,          label: t('services'),  value: total, tone: 'blue', detail: null },
    { icon: RupeeIcon,      label: t('total_due'), value: totalDue > 0 ? formatInr(totalDue) : '₹0', tone: totalDue > 0 ? 'red' : 'slate', detail: totalDue > 0 ? `${due.length} pending` : 'All clear' },
    { icon: FiAlertTriangle,label: t('pending'),   value: due.length,  tone: due.length > 0 ? 'amber' : 'slate', detail: null },
    { icon: FiCheckCircle,  label: t('cleared'),   value: paid.length, tone: 'green', detail: `${paidPercentage}%` },
  ];

  return (
    <div className="summary summary--v2">
      <div className="summary__grid">
        {stats.map(({ icon: Icon, label, value, tone, detail }) => (
          <div key={label} className={`stat stat--v2 stat--${tone}`}>
            <div className="stat__icon-wrap">
              <Icon size={16} />
            </div>
            <div className="stat__content">
              <span className="stat__label">{label}</span>
              <div className="stat__val-row">
                <strong className="stat__value">{value}</strong>
                {detail && <span className="stat__detail">{detail}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="summary__progress-wrap">
          <div className="summary__progress-bar">
            <div 
              className="summary__progress-fill" 
              style={{ width: `${paidPercentage}%` }}
              title={`${paidPercentage}% Services Paid`}
            />
          </div>
          <div className="summary__progress-labels">
            <span>{paid.length} Paid</span>
            <span>{due.length} Due</span>
          </div>
        </div>
      )}
    </div>
  );
}