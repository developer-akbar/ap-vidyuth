import { useEffect, useState, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiCheck, FiMail, FiTrash2, FiZap, FiStar } from 'react-icons/fi';
import { SERVICE_CAP } from '../../../shared/utils/index.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export function ServiceCapModal({ open, onClose }) {
  const { t } = useTranslation();
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // We need to access validateCoupon from context
  // This depends on how ElectricityContext is provided.
  // Assuming it's available via a hook or prop.
  // For now, let's use a CustomEvent or window level access if needed, 
  // but better to pass it or use context if possible.
  // Looking at ElectricityDashboard, it's passed as electricityContext.
  
  if (!open) return null;

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setValidating(true);
    try {
      // We'll dispatch a custom event that ElectricityDashboard can listen to,
      // or just call the API directly if we have the actions.
      // To keep it simple, let's assume we can import the api directly or use a global action.
      const { validateCoupon } = await import('../api/servicesApi.js');
      const res = await validateCoupon(coupon);
      if (res.ok) {
        const { db } = await import('../../../shared/db/storage.js');
        await db.setSetting('is_pro', true);
        setIsSuccess(true);
        toast.success('Pro Access Granted! You can now track unlimited services.');
        setTimeout(() => {
          window.location.reload(); // Quick way to refresh all states
        }, 1500);
      } else {
        toast.error(res.error || t('invalid_coupon', 'Invalid Coupon Code'));
      }
    } catch (e) {
      toast.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleContactDeveloper = () => {
    const subject = encodeURIComponent('Request for Extended Service Access - AP Vidyuth');
    const body = encodeURIComponent('Hi Akbar,\n\nI would like to request extended access to track more than 4 services in the AP Vidyuth app.\n\n[Optional: Enter your coupon code or reason here]');
    window.location.href = `mailto:mail.akbarmulla@gmail.com?subject=${subject}&body=${body}`;
  };

  if (isSuccess) {
    return createPortal(
      <div className="overlay overlay--center">
        <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FiStar size={40} fill="currentColor" />
          </div>
          <h2 className="dialog__title">Pro Access Active!</h2>
          <p style={{ color: 'var(--text-2)', marginTop: '12px' }}>Thank you for your support. Unlimited tracking is now enabled.</p>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw' }}>
        <div className="dialog__header" style={{ textAlign: 'center', paddingTop: '20px' }}>
          <div style={{ width: '56px', height: '56px', background: 'var(--amber-light)', color: 'var(--amber)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <FiAlertCircle size={32} />
          </div>
          <h2 className="dialog__title">{t('service_limit_reached', 'Service Limit Reached')}</h2>
        </div>
        <div className="dialog__body" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: '1.6' }}>
            {t('service_limit_desc', "You've reached the maximum limit of {{cap}} services. To track more services, please enter a Coupon Code or contact the developer for extended access.", { cap: SERVICE_CAP })}
          </p>
          
          <div className="field" style={{ marginTop: '20px' }}>
             <input 
              className="field__input" 
              placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
              style={{ textAlign: 'center', textTransform: 'uppercase' }} 
              value={coupon}
              onChange={e => setCoupon(e.target.value)}
              disabled={validating}
            />
          </div>
        </div>
        <div className="dialog__footer" style={{ flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={handleApplyCoupon} disabled={validating || !coupon.trim()}>
            {validating ? 'Validating...' : t('apply_coupon', 'Apply Coupon')}
          </button>
          <button className="btn btn--ghost" style={{ width: '100%' }} onClick={handleContactDeveloper} disabled={validating}>
            <FiMail size={16} style={{ marginRight: '8px' }} /> {t('contact_developer', 'Contact Developer')}
          </button>
          <button className="btn btn--ghost btn--sm" style={{ width: '100%', marginTop: '4px' }} onClick={onClose} disabled={validating}>
            {t('close', 'Close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function MandatoryCleanupModal({ services, onConfirm }) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState(new Set(services.slice(0, SERVICE_CAP).map(s => s.id)));

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) {
            toast.error(`You must select at least 1 service to keep`);
            return prev;
        }
        next.delete(id);
      } else {
        if (next.size >= SERVICE_CAP) {
          toast.error(`You can only select up to ${SERVICE_CAP} services`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const keepCount = Math.min(services.length, SERVICE_CAP);
    if (selectedIds.size > keepCount) {
       toast.error(`Please select only ${SERVICE_CAP} services to keep`);
       return;
    }
    const toKeep = Array.from(selectedIds);
    const toDelete = services.filter(s => !selectedIds.has(s.id)).map(s => s.id);
    onConfirm(toKeep, toDelete);
  };

  const handleContactDeveloper = () => {
    const subject = encodeURIComponent('Request for Extended Service Access - AP Vidyuth');
    const body = encodeURIComponent('Hi Akbar,\n\nI would like to request extended access to track more than 4 services in the AP Vidyuth app.\n\n[Optional: Enter your coupon code or reason here]');
    window.location.href = `mailto:mail.akbarmulla@gmail.com?subject=${subject}&body=${body}`;
  };

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 9999 }}>
      <div className="dialog" role="dialog" style={{ width: '450px', maxWidth: '94vw' }}>
        <div className="dialog__header" style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
             <div style={{ width: '40px', height: '40px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FiZap size={20} />
             </div>
             <h2 className="dialog__title" style={{ margin: 0 }}>{t('service_limit_update', 'Service Limit Update')}</h2>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.5' }}>
            {t('service_limit_cleanup_desc', "To ensure the best experience for everyone, we've introduced a limit of {{cap}} services per user. Please choose the {{cap}} services you'd like to keep. The others will be moved to the Trash.", { cap: SERVICE_CAP })}
          </p>
        </div>

        <div className="dialog__body" style={{ padding: '0 24px', maxHeight: '40vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {services.map(s => {
              const isSelected = selectedIds.has(s.id);
              return (
                <div 
                  key={s.id} 
                  className={`cleanup-item ${isSelected ? 'cleanup-item--selected' : ''}`}
                  onClick={() => toggleSelect(s.id)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '12px', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border)', 
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: isSelected ? 'var(--primary-light)' : 'var(--surface-1)',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)'
                  }}
                >
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '6px', 
                    border: '2px solid', 
                    borderColor: isSelected ? 'var(--primary)' : 'var(--text-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: 'white'
                  }}>
                    {isSelected && <FiCheck size={14} strokeWidth={3} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.label || s.customerName || t('untitled')}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                      {s.serviceNumber}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dialog__footer" style={{ padding: '20px 24px 24px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn btn--primary" style={{ width: '100%', height: '44px' }} onClick={handleConfirm} disabled={selectedIds.size === 0 || selectedIds.size > Math.min(services.length, SERVICE_CAP)}>
              <FiTrash2 size={16} style={{ marginRight: '8px' }} /> {t('keep_selected_trash_others', 'Keep Selected & Trash Others')}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
               <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' }}>OR</span>
               <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <button className="btn btn--ghost" style={{ width: '100%', height: '44px' }} onClick={handleContactDeveloper}>
              <FiMail size={16} style={{ marginRight: '8px' }} /> {t('get_extended_access', 'Get Extended Access')}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-3)', textAlign: 'center' }}>
            {t('coupon_hint', 'Have a coupon code? Contact the developer.')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
