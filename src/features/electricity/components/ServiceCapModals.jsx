import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiCheck, FiTrash2, FiZap, FiStar, FiSend } from 'react-icons/fi';
import { SERVICE_CAP, getDeviceId } from '../../../shared/utils/index.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Loader } from '../../../shared/components/Loader.jsx';

export function RequestSuccessModal({ open, type, email, onClose }) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleBack = (e) => {
      if (!open) return;
      e.detail.handled = true;
      onClose();
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('app-back-button', handleBack);
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 11000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw', textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ width: '64px', height: '64px', background: 'var(--green-light)', color: 'var(--green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <FiCheck size={32} />
        </div>
        <h2 className="dialog__title">{type === 'WITHDRAW' ? 'Withdrawal Requested' : 'Request Received'}</h2>
        <p style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: '1.6', marginTop: '12px', marginBottom: '24px' }}>
          {type === 'WITHDRAW' 
            ? `Your withdrawal request has been sent. We will process it shortly and communicate through your email: ${email}. (Please check your spam or junk folder if you do not receive our confirmation.)` 
            : `Thank you for your request. Our team will review it and get back to you soon. We will communicate through your email address: ${email}. (Please check your spam or junk folder if you do not receive our response.)`}
        </p>
        <button className="btn btn--primary" style={{ width: '100%' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}

export function RequestAccessForm({ open, type = 'ACCESS', onClose, onSuccess }) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => localStorage.getItem('user_name') || '');
  const [email, setEmail] = useState(() => localStorage.getItem('user_email') || '');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (forcedName, forcedEmail) => {
    const finalName = forcedName || name.trim();
    const finalEmail = forcedEmail || email.trim();

    if (!finalName || !finalEmail) {
      toast.error('Name and Email are required.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { requestProAccess } = await import('../api/servicesApi.js');
      const defaultMessage = type === 'WITHDRAW' ? 'User requested Pro subscription withdrawal.' : 'User requested extended access for tracking >4 services.';
      const res = await requestProAccess(type, message || defaultMessage, finalName, finalEmail);
      if (res.ok) {
        // Save to localStorage if not already present or if changed
        localStorage.setItem('user_name', finalName);
        localStorage.setItem('user_email', finalEmail);
        
        onSuccess && onSuccess(type, finalEmail);
      } else {
        toast.error(res.error || 'Failed to send request.');
      }
    } catch (e) {
      toast.error(e.message || 'Failed to send request. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  }, [name, email, message, type, onSuccess]);

  const autoSubmitAttempted = useRef(false);

  useEffect(() => {
    if (!open) {
      autoSubmitAttempted.current = false;
      return;
    }

    const handleBack = (e) => {
      e.detail.handled = true;
      onClose();
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('app-back-button', handleBack);
    window.addEventListener('keydown', handleEsc);

    // Auto-submit if profile is already complete and we haven't attempted it yet
    const savedName = localStorage.getItem('user_name');
    const savedEmail = localStorage.getItem('user_email');
    if (savedName && savedEmail && !isSubmitting && !autoSubmitAttempted.current) {
      autoSubmitAttempted.current = true;
      handleSubmit(savedName, savedEmail);
    }

    return () => {
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose, isSubmitting, handleSubmit]);

  if (!open) return null;

  // If we are auto-submitting, show a loader
  const isAutoSubmitting = localStorage.getItem('user_name') && localStorage.getItem('user_email');

  if (isAutoSubmitting && isSubmitting) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 11000 }}>
        <div className="dialog" style={{ width: '300px', textAlign: 'center', padding: '32px' }}>
          <Loader size={24} />
          <p style={{ marginTop: '16px', color: 'var(--text-2)', fontSize: '14px' }}>Sending request...</p>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 11000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw' }}>
        <div className="dialog__header" style={{ padding: '24px 24px 16px' }}>
          <h2 className="dialog__title">{type === 'WITHDRAW' ? 'Withdraw Subscription' : 'Upgrade to Pro'}</h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.5', marginTop: '8px' }}>
            {type === 'WITHDRAW' 
              ? 'Tell us why you want to withdraw your Pro subscription.'
              : 'Unlock unlimited services and premium features by requesting Pro access.'}
          </p>
        </div>
        <div className="dialog__body" style={{ padding: '0 24px' }}>
          <div className="field" style={{ marginBottom: '16px' }}>
            <label className="field__label">Name *</label>
            <input className="field__input" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} disabled={isSubmitting} />
          </div>
          <div className="field" style={{ marginBottom: '16px' }}>
            <label className="field__label">Email *</label>
            <input className="field__input" type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} disabled={isSubmitting} />
          </div>
          <div className="field" style={{ marginBottom: '16px' }}>
            <label className="field__label">Message (Optional)</label>
            <textarea className="field__input" placeholder={type === 'WITHDRAW' ? "Reason for withdrawal..." : "How many services do you plan to track?"} rows={3} value={message} onChange={e => setMessage(e.target.value)} disabled={isSubmitting} style={{ resize: 'none' }} />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic', marginTop: '4px' }}>
            Note: Your contact details are only used to serve you better and provide access if needed. We never share your data.
          </p>
        </div>
        <div className="dialog__footer" style={{ padding: '20px 24px 24px', display: 'flex', gap: '12px' }}>
          <button className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }} disabled={isSubmitting}>Cancel</button>
          <button className="btn btn--primary" onClick={() => handleSubmit()} style={{ flex: 1.5 }} disabled={isSubmitting || !name.trim() || !email.trim()}>
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ServiceCapModal({ open, serviceCount = 0, onClose }) {
  const { t } = useTranslation();
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });

  useEffect(() => {
    const handleBack = (e) => {
      if (!open) return;
      e.detail.handled = true;
      onClose();
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('app-back-button', handleBack);
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open && !successState.open) return null;

  const isLimitReached = serviceCount >= SERVICE_CAP;

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
        const isWhitelistBypass = res.message && res.message.includes('Device Whitelisted');
        await db.setSetting('pro_source', isWhitelistBypass ? 'request' : 'coupon');
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

  const handleRequestAccessClick = () => {
    setRequestFormOpen(true);
  };

  const handleRequestSuccess = (type, email) => {
    setRequestFormOpen(false);
    onClose();
    setSuccessState({ open: true, type, email });
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

  if (!open && successState.open) {
    return <RequestSuccessModal {...successState} onClose={() => setSuccessState({ open: false, type: '', email: '' })} />;
  }

  return createPortal(
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" style={{ width: '400px', maxWidth: '90vw' }}>
        <div className="dialog__header" style={{ textAlign: 'center', paddingTop: '20px' }}>
          <div style={{ 
            width: '56px', 
            height: '56px', 
            background: isLimitReached ? 'var(--amber-light)' : 'var(--primary-light)', 
            color: isLimitReached ? 'var(--amber)' : 'var(--primary)', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 16px' 
          }}>
            {isLimitReached ? <FiAlertCircle size={32} /> : <FiZap size={32} />}
          </div>
          <h2 className="dialog__title">
            {isLimitReached ? t('service_limit_reached', 'Service Limit Reached') : 'Get Pro Access'}
          </h2>
        </div>
        <div className="dialog__body" style={{ textAlign: 'center', padding: '0 24px' }}>
          <p style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: '1.6' }}>
            {isLimitReached 
              ? t('service_limit_desc', "You've reached the maximum limit of {{cap}} services. To track more services, please enter a Coupon Code or request for Pro access.", { cap: SERVICE_CAP })
              : 'Upgrade to Pro to add more service numbers, get unlimited tracking, and access premium features. Enter a Coupon Code or raise a request below.'
            }
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
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={handleApplyCoupon} disabled={validating}>
            {validating ? 'Validating...' : t('apply_coupon', 'Apply Coupon')}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button className="btn" style={{ width: '100%', background: 'var(--blue)', color: 'white' }} onClick={handleRequestAccessClick} disabled={validating}>
            <FiSend size={16} style={{ marginRight: '8px' }} /> {t('request_access', 'Request Access')}
          </button>
          <button className="btn btn--ghost btn--sm" style={{ width: '100%', marginTop: '4px' }} onClick={onClose} disabled={validating}>
            {t('close', 'Close')}
          </button>
        </div>
      </div>
      <RequestAccessForm open={requestFormOpen} onClose={() => setRequestFormOpen(false)} onSuccess={handleRequestSuccess} />
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
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });

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
        const isWhitelistBypass = res.message && res.message.includes('Device Whitelisted');
        await db.setSetting('pro_source', isWhitelistBypass ? 'request' : 'coupon');
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

  const handleRequestAccessClick = () => {
    setRequestFormOpen(true);
  };

  const handleRequestSuccess = (type, email) => {
    setRequestFormOpen(false);
    setSuccessState({ open: true, type, email });
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
                  disabled={validating}
                />
                <button className="btn btn--primary" style={{ padding: '0 16px' }} onClick={handleApplyCoupon} disabled={validating || !coupon.trim()}>
                  {validating ? '...' : 'Apply'}
                </button>
             </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn btn--ghost" style={{ width: '100%', height: '40px', border: '1px solid var(--border)' }} onClick={handleConfirm} disabled={selectedIds.size === 0 || selectedIds.size > SERVICE_CAP || validating}>
              <FiTrash2 size={16} style={{ marginRight: '8px' }} /> {t('keep_selected_trash_others', 'Keep Selected & Trash Others')}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
               <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' }}>OR</span>
               <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            <button className="btn" style={{ width: '100%', height: '40px', background: 'var(--blue)', color: 'white' }} onClick={handleRequestAccessClick} disabled={validating}>
              <FiSend size={16} style={{ marginRight: '8px' }} /> Request Access
            </button>
          </div>
        </div>
      </div>
      <RequestAccessForm open={requestFormOpen} type="ACCESS" onClose={() => setRequestFormOpen(false)} onSuccess={handleRequestSuccess} />
      <RequestSuccessModal {...successState} onClose={() => setSuccessState({ open: false, type: '', email: '' })} />
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
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });

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
        const isWhitelistBypass = res.message && res.message.includes('Device Whitelisted');
        await db.setSetting('pro_source', isWhitelistBypass ? 'request' : 'coupon');
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

  const handleRequestAccessClick = () => {
    setRequestFormOpen(true);
  };

  const handleRequestSuccess = (type, email) => {
    setRequestFormOpen(false);
    onClose();
    setSuccessState({ open: true, type, email });
  };

  useEffect(() => {
    const handleBack = (e) => {
      if (!open) return;
      e.detail.handled = true;
      onClose();
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('app-back-button', handleBack);
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open && !successState.open) return null;

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

  if (!open && successState.open) {
    return <RequestSuccessModal {...successState} onClose={() => setSuccessState({ open: false, type: '', email: '' })} />;
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
                  disabled={validating}
                />
                <button className="btn btn--primary" style={{ padding: '0 16px' }} onClick={handleApplyCoupon} disabled={validating || !coupon.trim()}>
                  {validating ? '...' : 'Apply'}
                </button>
             </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }} disabled={validating}>Cancel</button>
            <button className="btn btn--ghost" onClick={handleRequestAccessClick} style={{ flex: 1, border: '1px solid var(--border)' }} disabled={validating}>
               <FiSend size={16} style={{ marginRight: '8px' }} /> Request Access
            </button>
            <button 
              className="btn btn--primary" 
              style={{ flex: 1.5 }} 
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || validating}
            >
              Add {selectedIds.size} Services
            </button>
          </div>
        </div>
      </div>
      <RequestAccessForm open={requestFormOpen} type="ACCESS" onClose={() => setRequestFormOpen(false)} onSuccess={handleRequestSuccess} />
      <RequestSuccessModal {...successState} onClose={() => setSuccessState({ open: false, type: '', email: '' })} />
    </div>,
    document.body
  );
}
