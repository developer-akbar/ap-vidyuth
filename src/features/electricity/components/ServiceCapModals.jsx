import { useEffect, useState, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiCheck, FiMail, FiTrash2, FiZap, FiStar, FiSend } from 'react-icons/fi';
import { SERVICE_CAP, getDeviceId } from '../../../shared/utils/index.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export function ServiceCapModal({ open, onClose }) {
  const { t } = useTranslation();
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  if (!open) return null;

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setValidating(true);
    try {
      const normalizedCoupon = String(coupon).trim().toUpperCase();
      const { validateCoupon } = await import('../api/servicesApi.js');
      const res = await validateCoupon(normalizedCoupon);
      if (res.ok) {
        const { db } = await import('../../../shared/db/storage.js');
        const { isSecurePro } = await import('../utils/billing.js');
        await db.setSetting('is_pro', isSecurePro(normalizedCoupon));
        setIsSuccess(true);
        toast.success('Pro Access Granted!');
      } else {
        toast.error(res.error || t('invalid_coupon', 'Invalid Coupon Code'));
      }
    } catch (e) {
      toast.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRequestAccess = async () => {
    setIsRequesting(true);
    try {
      const { requestProAccess } = await import('../api/servicesApi.js');
      const res = await requestProAccess('ACCESS', 'User requested extended access for tracking >4 services.');
      if (res.ok) {
        toast.success('Access Request Sent! We will contact you soon.');
      }
    } catch (e) {
      toast.error('Failed to send request. Please try again later.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (isSuccess) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 10000 }}>
        <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FiStar size={40} fill="currentColor" />
          </div>
          <h2 className="dialog__title">Pro Access Active!</h2>
          <p style={{ color: 'var(--text-2)', marginTop: '12px', marginBottom: '24px' }}>Thank you for your support. Unlimited tracking is now enabled.</p>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={onClose}>
            Continue
          </button>
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
            {t('service_limit_desc', "You've reached the maximum limit of {{cap}} services. To track more services, please enter a Coupon Code or request for extended access.", { cap: SERVICE_CAP })}
          </p>
          
          <div className="field" style={{ marginTop: '20px' }}>
             <input 
              className="field__input" 
              placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
              style={{ textAlign: 'center', textTransform: 'uppercase' }} 
              value={coupon}
              onChange={e => setCoupon(e.target.value)}
              disabled={validating || isRequesting}
            />
          </div>
        </div>
        <div className="dialog__footer" style={{ flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={handleApplyCoupon} disabled={validating || isRequesting}>
            {validating ? 'Validating...' : t('apply_coupon', 'Apply Coupon')}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button className="btn" style={{ width: '100%', background: 'var(--blue)', color: 'white' }} onClick={handleRequestAccess} disabled={validating || isRequesting}>
            {isRequesting ? t('requesting', 'Requesting...') : <><FiSend size={16} style={{ marginRight: '8px' }} /> {t('request_access', 'Request Access')}</>}
          </button>
          <button className="btn btn--ghost btn--sm" style={{ width: '100%', marginTop: '4px' }} onClick={onClose} disabled={validating || isRequesting}>
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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set(services.slice(0, SERVICE_CAP).map(s => s.id)));
  }, [services]);

  const toggleSelect = (id) => {
    const isSelected = selectedIds.has(id);

    if (isSelected) {
      if (selectedIds.size <= 1) {
        toast.error(`You must select at least 1 service to keep`, { id: 'cleanup-limit-error' });
        return;
      }
    } else {
      if (selectedIds.size >= SERVICE_CAP) {
        toast.error(`Standard limit reached. Enter Coupon to keep more!`, { id: 'cleanup-limit-error' });
        return;
      }
    }

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isSelected) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const toKeep = Array.from(selectedIds);
    const toDelete = services.filter(s => !selectedIds.has(s.id)).map(s => s.id);
    onConfirm(toKeep, toDelete);
  };

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setValidating(true);
    try {
      const normalizedCoupon = String(coupon).trim().toUpperCase();
      const { validateCoupon } = await import('../api/servicesApi.js');
      const res = await validateCoupon(normalizedCoupon);
      if (res.ok) {
        const { db } = await import('../../../shared/db/storage.js');
        const { isSecurePro } = await import('../utils/billing.js');
        await db.setSetting('is_pro', isSecurePro(normalizedCoupon));
        setIsSuccess(true);
        toast.success('Pro Access Activated!');
      } else {
        toast.error(res.error || t('invalid_coupon', 'Invalid Coupon Code'));
      }
    } catch (e) {
      toast.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRequestAccess = async () => {
    setIsRequesting(true);
    try {
      const { requestProAccess } = await import('../api/servicesApi.js');
      const res = await requestProAccess('ACCESS', 'User requested extended access during mandatory cleanup.');
      if (res.ok) {
        toast.success('Access Request Sent! We will contact you soon.');
      }
    } catch (e) {
      toast.error('Failed to send request. Please try again later.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (isSuccess) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 10000 }}>
        <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FiStar size={40} fill="currentColor" />
          </div>
          <h2 className="dialog__title">Pro Access Active!</h2>
          <p style={{ color: 'var(--text-2)', marginTop: '12px', marginBottom: '24px' }}>Thank you for your support. Unlimited tracking is now enabled.</p>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => onConfirm(services.map(s => s.id), [])}>
            Continue to Dashboard
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 9999 }}>
      <div className="dialog" role="dialog" style={{ width: '450px', maxWidth: '94vw' }}>
        <div className="dialog__header" style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
             <div style={{ width: '40px', height: '40px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FiZap size={20} />
             </div>
             <h2 className="dialog__title">{t('service_limit_update', 'Service Limit Update')}</h2>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.5' }}>
            {t('service_limit_cleanup_desc', "To ensure the best experience for everyone, we've introduced a limit of {{cap}} services per user. Please choose the {{cap}} services you'd like to keep.", { cap: SERVICE_CAP })}
          </p>
        </div>

        <div className="dialog__body" style={{ padding: '0 24px', maxHeight: '35vh', overflowY: 'auto' }}>
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
          <div className="field" style={{ width: '100%' }}>
             <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  className="field__input" 
                  placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
                  style={{ textTransform: 'uppercase', flex: 1 }} 
                  value={coupon}
                  onChange={e => setCoupon(e.target.value)}
                  disabled={validating || isRequesting}
                />
                <button className="btn btn--primary" style={{ padding: '0 16px' }} onClick={handleApplyCoupon} disabled={validating || isRequesting || !coupon.trim()}>
                  {validating ? '...' : 'Apply'}
                </button>
             </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn btn--ghost" style={{ width: '100%', height: '40px', border: '1px solid var(--border)' }} onClick={handleConfirm} disabled={selectedIds.size === 0 || selectedIds.size > SERVICE_CAP || validating || isRequesting}>
              <FiTrash2 size={16} style={{ marginRight: '8px' }} /> {t('keep_selected_trash_others', 'Keep Selected & Trash Others')}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
               <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' }}>OR</span>
               <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <button className="btn" style={{ width: '100%', height: '40px', background: 'var(--blue)', color: 'white' }} onClick={handleRequestAccess} disabled={validating || isRequesting}>
              {isRequesting ? 'Requesting...' : <><FiSend size={16} style={{ marginRight: '8px' }} /> Request Access</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ServiceSelectionModal({ open, entries, isPro, currentCount = 0, title = 'Select Services', onConfirm, onClose }) {
  const { t } = useTranslation();
  const remaining = Math.max(0, SERVICE_CAP - currentCount);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(entries.slice(0, remaining).map(e => e.serviceNumber || e.number)));
    }
  }, [open, entries, remaining]);

  const toggleSelect = (sn) => {
    const isSelected = selectedIds.has(sn);

    if (!isSelected && selectedIds.size >= remaining) {
      toast.error(`Limit reached: You can only add ${remaining} more service(s) (Limit: ${SERVICE_CAP})`, { id: 'selection-limit-error' });
      return;
    }

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isSelected) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  const handleConfirm = () => {
    const toImport = entries.filter(e => selectedIds.has(e.serviceNumber || e.number));
    onConfirm(toImport);
    onClose();
  };

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setValidating(true);
    try {
      const normalizedCoupon = String(coupon).trim().toUpperCase();
      const { validateCoupon } = await import('../api/servicesApi.js');
      const res = await validateCoupon(normalizedCoupon);
      if (res.ok) {
        const { db } = await import('../../../shared/db/storage.js');
        const { isSecurePro } = await import('../utils/billing.js');
        await db.setSetting('is_pro', isSecurePro(normalizedCoupon));
        setIsSuccess(true);
        toast.success('Pro Access Activated!');
      } else {
        toast.error(res.error || t('invalid_coupon', 'Invalid Coupon Code'));
      }
    } catch (e) {
      toast.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRequestAccess = async () => {
    setIsRequesting(true);
    try {
      const { requestProAccess } = await import('../api/servicesApi.js');
      const res = await requestProAccess('ACCESS', 'User requested extended access during service selection.');
      if (res.ok) {
        toast.success('Access Request Sent! We will contact you soon.');
      }
    } catch (e) {
      toast.error('Failed to send request. Please try again later.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (!open) return null;

  if (isSuccess) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 10000 }}>
        <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FiStar size={40} fill="currentColor" />
          </div>
          <h2 className="dialog__title">Pro Access Active!</h2>
          <p style={{ color: 'var(--text-2)', marginTop: '12px', marginBottom: '24px' }}>Thank you for your support. All services are being added.</p>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => { onConfirm(entries); onClose(); }}>
            Import All Services
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 10000 }}>
      <div className="dialog" role="dialog" style={{ width: '450px', maxWidth: '94vw' }}>
        <div className="dialog__header" style={{ padding: '24px 24px 16px' }}>
          <h2 className="dialog__title">{title}</h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.5', marginTop: '8px' }}>
            We found <strong>{entries.length} services</strong>. 
            {remaining > 0 
                ? <> As a standard user, you can add up to <strong>{remaining} more</strong>.</>
                : <> You've reached your limit of <strong>{SERVICE_CAP}</strong>. Please upgrade to Pro for more.</>
            }
          </p>
        </div>

        <div className="dialog__body" style={{ padding: '0 24px', maxHeight: '40vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map(e => {
              const sn = e.serviceNumber || e.number;
              const isSelected = selectedIds.has(sn);
              return (
                <div 
                  key={sn} 
                  onClick={() => toggleSelect(sn)}
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
                      {e.label || e.customerName || t('untitled')}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                      {sn}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dialog__footer" style={{ padding: '20px 24px 24px', flexDirection: 'column', gap: '12px' }}>
          <div className="field" style={{ width: '100%' }}>
             <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  className="field__input" 
                  placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
                  style={{ textTransform: 'uppercase', flex: 1 }} 
                  value={coupon}
                  onChange={e => setCoupon(e.target.value)}
                  disabled={validating || isRequesting}
                />
                <button className="btn btn--primary" style={{ padding: '0 16px' }} onClick={handleApplyCoupon} disabled={validating || isRequesting || !coupon.trim()}>
                  {validating ? '...' : 'Apply'}
                </button>
             </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }} disabled={validating || isRequesting}>Cancel</button>
            <button className="btn btn--ghost" onClick={handleRequestAccess} style={{ flex: 1, border: '1px solid var(--border)' }} disabled={validating || isRequesting}>
               {isRequesting ? '...' : 'Request Access'}
            </button>
            <button 
              className="btn btn--primary" 
              style={{ flex: 1.5 }} 
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || validating || isRequesting}
            >
              Add {selectedIds.size} Services
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
