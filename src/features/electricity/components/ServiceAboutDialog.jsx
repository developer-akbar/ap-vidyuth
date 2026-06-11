import { useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  return createPortal(
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog dialog--v2" role="dialog" aria-modal="true">
        <header className="dialog__header dialog__header--v2">
          <div className="dialog__title-group">
            <div className="dialog__icon-wrap">
              <FiInfo size={20} />
            </div>
            <div>
              <h2 className="dialog__title">{t('about_service')}</h2>
              <p className="dialog__subtitle">{t('service_info')}</p>
            </div>
          </div>
          <button className="icon-btn-ghost icon-btn-ghost--v2" onClick={onClose}><FiX size={20} /></button>
        </header>

        <div className="dialog__body dialog__body--v2">
          <div className="about-list">
            {info.map((item, i) => (
              <div key={i} className="receipt-row--v2">
                <span className="field__label" style={{ fontSize: '10px' }}>{item.label}</span>
                <b style={{ color: 'var(--text-1)', fontSize: '14px', textAlign: 'right', marginLeft: '12px' }}>{item.value || '—'}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="dialog__footer dialog__footer--v2">
          <button type="button" className="btn btn--primary btn--v2 flex-1" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
