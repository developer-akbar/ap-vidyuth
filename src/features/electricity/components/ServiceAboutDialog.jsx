import { useEffect } from 'react';
import { FiX, FiInfo } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

export function ServiceAboutDialog({ open, service, onClose }) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !service) return null;

  const info = [
    { label: t('unique_service_number'), value: service.serviceNumber },
    { label: t('customer_name'), value: service.customerName },
    { label: t('division_code'), value: service.divisionCode },
    { label: t('division_name'), value: service.divisionName },
    { label: t('circle_name'), value: service.circleName },
    { label: t('section_name'), value: service.sectionName },
    { label: t('category'), value: service.category },
    { label: t('current_load'), value: service.ctrLoad },
  ];

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet__handle" />

        <div className="sheet__header">
          <div className="sheet__icon"><FiInfo size={16} /></div>
          <div>
            <p className="sheet__eyebrow">{t('service_info')}</p>
            <h2 className="sheet__title">{t('about_service')}</h2>
          </div>
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <div className="sheet__body" style={{ padding: '0 20px 10px', maxHeight: '60vh', overflowY: 'auto' }}>
          <div className="about-list">
            {info.map((item, i) => (
              <div key={i} className="about-row" style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '2px',
                padding: '10px 0', 
                borderBottom: i === info.length - 1 ? 'none' : '1px solid var(--border)' 
              }}>
                <span style={{ color: 'var(--text-3)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
                <b style={{ color: 'var(--text-1)', fontSize: '13.5px', wordBreak: 'break-all' }}>{item.value || '—'}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="sheet__footer" style={{ padding: '10px 20px 20px' }}>
          <button type="button" className="btn btn--primary" style={{ width: '100%', height: '40px', justifyContent: 'center' }} onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
