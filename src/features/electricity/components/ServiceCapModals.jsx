import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
      <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl max-w-[400px] w-[90%] text-center p-8 flex flex-col items-center">
        <div className="w-14 h-14 bg-green-dim/10 text-green rounded-full flex items-center justify-center mb-5 shadow-sm">
          <span className="material-symbols-outlined text-[32px]">check_circle</span>
        </div>
        <h2 className="font-headline-md text-headline-md text-on-surface">{type === 'WITHDRAW' ? 'Withdrawal Requested' : 'Request Received'}</h2>
        <p className="text-xs text-text-secondary leading-relaxed mt-3 mb-6">
          {type === 'WITHDRAW' 
            ? `Your withdrawal request has been sent. We will process it shortly and communicate through your email: ${email}. (Please check your spam folder if you do not receive our confirmation.)` 
            : `Thank you for your request. Our team will review it and get back to you soon. We will communicate through your email address: ${email}. (Please check your spam folder if you do not receive our response.)`}
        </p>
        <button className="w-full py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-[13px] cursor-pointer" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}

export function RequestAccessForm({ open, type = 'ACCESS', onClose, onSuccess }) {
  const { t } = useTranslation();
  const [name] = useState(() => localStorage.getItem('user_name') || '');
  const [email] = useState(() => localStorage.getItem('user_email') || '');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedPlan, setRequestedPlan] = useState('BRONZE');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (forcedName, forcedEmail) => {
    const finalName = forcedName || name.trim();
    const finalEmail = forcedEmail || email.trim();

    if (!finalName || !finalEmail) {
      setError('You must be registered to make an access request.');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    try {
      const { requestProAccess } = await import('../api/servicesApi.js');
      const defaultMessage = type === 'WITHDRAW' ? 'User requested Pro subscription withdrawal.' : 'User requested extended access for tracking services.';
      const res = await requestProAccess(type, message || defaultMessage, finalName, finalEmail, requestedPlan);
      if (res.ok) {
        onSuccess && onSuccess(type, finalEmail);
      } else {
        setError(res.error || 'Failed to send request.');
      }
    } catch (e) {
      setError(e.message || 'Failed to send request. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  }, [name, email, message, type, requestedPlan, onSuccess]);

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

    const savedName = localStorage.getItem('user_name');
    const savedEmail = localStorage.getItem('user_email');
    if (type === 'WITHDRAW' && savedName && savedEmail && !isSubmitting && !autoSubmitAttempted.current) {
      autoSubmitAttempted.current = true;
      handleSubmit(savedName, savedEmail);
    }

    return () => {
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose, isSubmitting, handleSubmit, type]);

  if (!open) return null;

  const isAutoSubmitting = type === 'WITHDRAW' && localStorage.getItem('user_name') && localStorage.getItem('user_email');

  if (isAutoSubmitting && isSubmitting) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 11000 }}>
        <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl w-[300px] text-center p-8 flex flex-col items-center justify-center gap-3">
          <Loader size={24} />
          <p className="text-xs text-text-secondary">Sending request...</p>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 11000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl max-w-[420px] w-[92%]" role="dialog">
        <div className="p-6 pb-4">
          <h2 className="font-display-lg text-headline-md text-on-surface">{type === 'WITHDRAW' ? 'Withdraw Subscription' : 'Upgrade to Pro'}</h2>
          <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
            {type === 'WITHDRAW' 
              ? 'Tell us why you want to withdraw your Pro subscription.'
              : 'Unlock more services and premium features by requesting access.'}
          </p>
        </div>
        <div className="px-6 flex flex-col gap-4">
          {type === 'WITHDRAW' && (
            <div className="p-3 bg-red-dim/10 border border-red/20 rounded-xl text-xs text-red leading-normal">
              <strong className="block mb-1 font-body-bold">⚠️ What you will lose:</strong>
              <ul className="list-disc pl-4 flex flex-col gap-0.5">
                <li>Ability to track unlimited services (reverts to standard max 4 limit).</li>
                <li>Active tracking for any existing services beyond the 4-service cap.</li>
                <li>Priority status for quick background bill checking.</li>
              </ul>
            </div>
          )}
          
          <div className="p-3 bg-surface-container-low border border-border-subtle rounded-xl text-xs flex flex-col gap-1">
            <div className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Profile Details</div>
            <div className="font-body-bold text-on-surface text-[13px]">{name || 'No Name'}</div>
            <div className="text-text-secondary">{email || 'No Email'}</div>
          </div>

          {type !== 'WITHDRAW' && (
            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">Requested Subscription Tier *</label>
              <div className="relative flex items-center bg-surface-container-low border border-border-medium rounded-xl px-2.5 py-2">
                <select
                  value={requestedPlan}
                  onChange={e => setRequestedPlan(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full bg-transparent border-none outline-none text-xs font-body-bold text-on-surface focus:ring-0 appearance-none pr-8 cursor-pointer"
                >
                  <option value="BRONZE">Bronze Plan (8 Services max)</option>
                  <option value="SILVER">Silver Plan (16 Services max)</option>
                  <option value="GOLD">Gold Plan (32 Services max)</option>
                  <option value="PLATINUM">Platinum Plan (64 Services max)</option>
                  <option value="DIAMOND">Diamond Plan (Unlimited Services)</option>
                </select>
                <span className="material-symbols-outlined text-[20px] text-text-muted absolute right-2.5 pointer-events-none">expand_more</span>
              </div>
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <label className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider">Message (Optional)</label>
            <textarea 
              placeholder={type === 'WITHDRAW' ? "Reason for withdrawal..." : "Describe why you need this tier..."} 
              rows={3} 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              disabled={isSubmitting} 
              className="w-full px-3 py-2 border border-border-medium rounded-xl bg-surface text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none" 
            />
          </div>
          
          <p className="text-[10px] text-text-muted italic leading-relaxed">
            Note: Your contact details are only used to verify your identity and manage access. We respect your privacy.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-2.5 bg-red-dim/10 border border-red/20 rounded-xl text-xs text-red">
            {error}
          </div>
        )}

        <div className="p-6 flex gap-3">
          <button className="flex-1 py-2.5 bg-surface-card hover:bg-surface-container border border-border-medium rounded-xl font-body-bold text-xs text-text-secondary cursor-pointer" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button className="flex-1 py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-xs cursor-pointer" onClick={() => handleSubmit()} disabled={isSubmitting || !name || !email}>
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ServiceCapModal({ open, serviceCount = 0, limit = 4, onClose }) {
  const { t } = useTranslation();
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    const handleAuthSuccess = () => {
      if (open) {
        setRequestFormOpen(true);
      }
    };
    window.addEventListener('auth-success', handleAuthSuccess);
    return () => {
      window.removeEventListener('auth-success', handleAuthSuccess);
    };
  }, [open]);

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

  const isLimitReached = serviceCount >= limit;

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setValidating(true);
    setCouponError('');
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
        setCouponError('Invalid Coupon');
      }
    } catch (e) {
      setCouponError('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRequestAccessClick = () => {
    const isLoggedIn = !!localStorage.getItem('ap_vidyuth_token');
    if (!isLoggedIn) {
      window.dispatchEvent(new CustomEvent('open-profile-modal', { detail: { tab: 'register' } }));
    } else {
      setRequestFormOpen(true);
    }
  };

  const handleRequestSuccess = (type, email) => {
    setRequestFormOpen(false);
    onClose();
    setSuccessState({ open: true, type, email });
  };

  if (isSuccess) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 10000 }}>
        <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl w-[90%] max-w-[400px] text-center p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-primary-dim text-primary rounded-full flex items-center justify-center mb-5 shadow-sm">
            <span className="material-symbols-outlined text-[32px]">workspace_premium</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Pro Access Active!</h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-2 mb-6">Thank you for your support. Unlimited connection tracking is now enabled.</p>
          <button className="w-full py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-[13px] cursor-pointer" onClick={onClose}>
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
      <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl max-w-[400px] w-[90%]" role="dialog">
        <div className="p-6 pb-4 text-center flex flex-col items-center">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
            isLimitReached ? 'bg-amber-dim/10 text-amber' : 'bg-primary-dim/10 text-primary'
          }`}>
            <span className="material-symbols-outlined text-[28px]">
              {isLimitReached ? 'warning' : 'workspace_premium'}
            </span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface">
            {isLimitReached ? t('service_limit_reached', 'Service Limit Reached') : 'Get Pro Access'}
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-2.5">
            {isLimitReached 
              ? t('service_limit_desc', "You've reached the maximum limit of {{cap}} services. To track more services, please enter a Coupon Code or request for Pro access.", { cap: limit })
              : 'Upgrade to Pro to add more service numbers, get unlimited tracking, and access premium features.'
            }
          </p>
          
          <div className="w-full flex flex-col gap-1.5 mt-5">
             <input 
              placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
              value={coupon}
              onChange={e => { setCoupon(e.target.value); setCouponError(''); }}
              disabled={validating}
              className="w-full px-3 py-2 border border-border-medium rounded-xl bg-surface text-xs text-on-surface text-center uppercase tracking-wider outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>
        <div className="p-6 pt-0 flex flex-col gap-2">
          {couponError && (
            <div className="text-xs text-red text-center font-body-bold">
              {couponError}
            </div>
          )}
          <button className="w-full py-2 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-xs cursor-pointer disabled:opacity-50" onClick={handleApplyCoupon} disabled={validating || !coupon.trim()}>
            {validating ? 'Validating...' : t('apply_coupon', 'Apply Coupon')}
          </button>
          
          <div className="flex items-center gap-2.5 my-1.5">
            <div className="flex-1 h-[1px] bg-border-subtle" />
            <span className="text-[10px] text-text-muted font-bold tracking-wider">OR</span>
            <div className="flex-grow h-[1px] bg-border-subtle" />
          </div>

          <button className="w-full py-2 bg-blue text-white hover:bg-blue/90 active:scale-[0.97] transition-all rounded-xl font-body-bold text-xs cursor-pointer flex items-center justify-center gap-1.5" onClick={handleRequestAccessClick} disabled={validating}>
            <span className="material-symbols-outlined text-[16px]">send</span> 
            <span>{t('request_access', 'Request Access')}</span>
          </button>
          <button className="w-full py-1.5 text-text-secondary hover:bg-surface-container font-body-bold text-[11px] rounded-lg transition-colors cursor-pointer" onClick={onClose} disabled={validating}>
            {t('close', 'Close')}
          </button>
        </div>
      </div>
      <RequestAccessForm open={requestFormOpen} onClose={() => setRequestFormOpen(false)} onSuccess={handleRequestSuccess} />
    </div>,
    document.body
  );
}

export function MandatoryCleanupModal({ services, limit = 4, onConfirm }) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    const handleAuthSuccess = () => {
      setRequestFormOpen(true);
    };
    window.addEventListener('auth-success', handleAuthSuccess);
    return () => {
      window.removeEventListener('auth-success', handleAuthSuccess);
    };
  }, []);

  useEffect(() => {
    setSelectedIds(new Set(services.slice(0, limit).map(s => s.id)));
  }, [services, limit]);

  const toggleSelect = (id) => {
    const isSelected = selectedIds.has(id);

    if (isSelected) {
      if (selectedIds.size <= 1) {
        toast.error(`You must select at least 1 service to keep`, { id: 'cleanup-limit-error' });
        return;
      }
    } else {
      if (selectedIds.size >= limit) {
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
    setCouponError('');
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
        setCouponError('Invalid Coupon');
      }
    } catch (e) {
      setCouponError('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRequestAccessClick = () => {
    const isLoggedIn = !!localStorage.getItem('ap_vidyuth_token');
    if (!isLoggedIn) {
      window.dispatchEvent(new CustomEvent('open-profile-modal', { detail: { tab: 'register' } }));
    } else {
      setRequestFormOpen(true);
    }
  };

  const handleRequestSuccess = (type, email) => {
    setRequestFormOpen(false);
    setSuccessState({ open: true, type, email });
  };

  if (isSuccess) {
    return createPortal(
      <div className="overlay overlay--center" style={{ zIndex: 10000 }}>
        <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl w-[90%] max-w-[400px] text-center p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-primary-dim text-primary rounded-full flex items-center justify-center mb-5 shadow-sm">
            <span className="material-symbols-outlined text-[32px]">workspace_premium</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Pro Access Active!</h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-2 mb-6">Thank you for your support. Unlimited tracking is now enabled.</p>
          <button className="w-full py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-[13px] cursor-pointer" onClick={() => onConfirm(services.map(s => s.id), [])}>
            Continue to Dashboard
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="overlay overlay--center" style={{ zIndex: 9999 }}>
      <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl max-w-[455px] w-[94%]" role="dialog">
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-2.5">
             <div className="w-10 h-10 bg-primary-dim/10 text-primary rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">warning</span>
             </div>
             <h2 className="font-headline-md text-headline-md text-on-surface">{t('service_limit_update', 'Service Limit Update')}</h2>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {t('service_limit_cleanup_desc', "To ensure the best experience for everyone, we've introduced a limit of {{cap}} services per user. Please choose the {{cap}} services you'd like to keep.", { cap: limit })}
          </p>
        </div>

        <div className="px-6 max-h-[35vh] overflow-y-auto no-scrollbar">
          <div className="flex flex-col gap-2">
            {services.map(s => {
              const isSelected = selectedIds.has(s.id);
              return (
                <div 
                  key={s.id} 
                  onClick={() => toggleSelect(s.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected ? 'bg-primary-dim/5 border-primary shadow-xs' : 'bg-surface border-border-medium hover:bg-surface-container-low'
                  }`}
                >
                  <div className={`w-[18px] h-[18px] rounded border flex items-center justify-center text-white ${
                    isSelected ? 'bg-primary border-primary' : 'bg-transparent border-border-medium'
                  }`}>
                    {isSelected && <span className="material-symbols-outlined text-[14px] font-black">check</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-bold text-[13px] text-on-surface truncate">
                      {s.label || s.customerName || t('untitled')}
                    </p>
                    <p className="font-mono-data text-[11px] text-text-muted mt-0.5">
                      {s.serviceNumber}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1 w-full">
             <div className="flex gap-2">
                <input 
                  placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
                  value={coupon}
                  onChange={e => { setCoupon(e.target.value); setCouponError(''); }}
                  disabled={validating}
                  className="flex-1 px-3 py-2 border border-border-medium rounded-xl bg-surface text-xs text-on-surface uppercase tracking-wider outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
                <button className="px-4 py-2 bg-primary text-white hover:bg-primary-hi rounded-xl font-body-bold text-xs cursor-pointer disabled:opacity-50" onClick={handleApplyCoupon} disabled={validating || !coupon.trim()}>
                  {validating ? '...' : 'Apply'}
                </button>
             </div>
             {couponError && (
               <div className="text-[11px] text-red font-body-bold mt-1">
                 {couponError}
               </div>
             )}
          </div>

          <div className="flex flex-col gap-2 w-full pt-1.5 border-t border-border-subtle">
            <button className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-surface-card hover:bg-surface-container border border-border-medium rounded-xl font-body-bold text-xs text-text-secondary cursor-pointer disabled:opacity-50" onClick={handleConfirm} disabled={selectedIds.size === 0 || selectedIds.size > limit || validating}>
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>{t('keep_selected_trash_others', 'Keep Selected & Trash Others')}</span>
            </button>
            <div className="flex items-center gap-2.5 my-1">
               <div className="flex-1 h-[1px] bg-border-subtle" />
               <span className="text-[10px] text-text-muted font-bold tracking-wider">OR</span>
               <div className="flex-grow h-[1px] bg-border-subtle" />
            </div>
            <button className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue text-white hover:bg-blue/90 active:scale-[0.97] transition-all rounded-xl font-body-bold text-xs cursor-pointer" onClick={handleRequestAccessClick} disabled={validating}>
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Request Access</span>
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

export function ServiceSelectionModal({ open, entries, isPro, currentCount = 0, limit = 4, title = 'Select Services', onConfirm, onClose }) {
  const { t } = useTranslation();
  const remaining = Math.max(0, limit - currentCount);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [coupon, setCoupon] = useState('');
  const [validating, setValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [successState, setSuccessState] = useState({ open: false, type: '', email: '' });
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    const handleAuthSuccess = () => {
      setRequestFormOpen(true);
    };
    window.addEventListener('auth-success', handleAuthSuccess);
    return () => {
      window.removeEventListener('auth-success', handleAuthSuccess);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(entries.slice(0, remaining).map(e => e.serviceNumber || e.number)));
    }
  }, [open, entries, remaining]);

  const toggleSelect = (sn) => {
    const isSelected = selectedIds.has(sn);

    if (!isSelected && selectedIds.size >= remaining) {
      toast.error(`Limit reached: You can only add ${remaining} more service(s) (Limit: ${limit})`, { id: 'selection-limit-error' });
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
    setCouponError('');
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
        setCouponError('Invalid Coupon');
      }
    } catch (e) {
      setCouponError('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRequestAccessClick = () => {
    const isLoggedIn = !!localStorage.getItem('ap_vidyuth_token');
    if (!isLoggedIn) {
      window.dispatchEvent(new CustomEvent('open-profile-modal', { detail: { tab: 'register' } }));
    } else {
      setRequestFormOpen(true);
    }
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
        <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl w-[90%] max-w-[400px] text-center p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-primary-dim text-primary rounded-full flex items-center justify-center mb-5 shadow-sm">
            <span className="material-symbols-outlined text-[32px]">workspace_premium</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Pro Access Active!</h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-2 mb-6">Thank you for your support. All services are being added.</p>
          <button className="w-full py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-[13px] cursor-pointer" onClick={() => { onConfirm(entries); onClose(); }}>
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
      <div className="dialog bg-surface-card border border-border-medium rounded-2xl shadow-xl max-w-[450px] w-[94%]" role="dialog">
        <div className="p-6 pb-4">
          <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
            We found <strong>{entries.length} services</strong>. 
            {remaining > 0 
                ? <> As a standard user, you can add up to <strong>{remaining} more</strong>.</>
                : <> You've reached your limit of <strong>{limit}</strong>. Please upgrade to Pro for more.</>
            }
          </p>
        </div>

        <div className="px-6 max-h-[40vh] overflow-y-auto no-scrollbar">
          <div className="flex flex-col gap-2">
            {entries.map(e => {
              const sn = e.serviceNumber || e.number;
              const isSelected = selectedIds.has(sn);
              return (
                <div 
                  key={sn} 
                  onClick={() => toggleSelect(sn)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected ? 'bg-primary-dim/5 border-primary shadow-xs' : 'bg-surface border-border-medium hover:bg-surface-container-low'
                  }`}
                >
                  <div className={`w-[18px] h-[18px] rounded border flex items-center justify-center text-white ${
                    isSelected ? 'bg-primary border-primary' : 'bg-transparent border-border-medium'
                  }`}>
                    {isSelected && <span className="material-symbols-outlined text-[14px] font-black">check</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-bold text-[13px] text-on-surface truncate">
                      {e.label || e.customerName || t('untitled')}
                    </p>
                    <p className="font-mono-data text-[11px] text-text-muted mt-0.5">
                      {sn}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1 w-full">
             <div className="flex gap-2">
                <input 
                  placeholder={t('enter_coupon_code', 'Enter Coupon Code')} 
                  value={coupon}
                  onChange={e => { setCoupon(e.target.value); setCouponError(''); }}
                  disabled={validating}
                  className="flex-1 px-3 py-2 border border-border-medium rounded-xl bg-surface text-xs text-on-surface uppercase tracking-wider outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
                <button className="px-4 py-2 bg-primary text-white hover:bg-primary-hi rounded-xl font-body-bold text-xs cursor-pointer disabled:opacity-50" onClick={handleApplyCoupon} disabled={validating || !coupon.trim()}>
                  {validating ? '...' : 'Apply'}
                </button>
             </div>
             {couponError && (
               <div className="text-[11px] text-red font-body-bold mt-1">
                 {couponError}
               </div>
             )}
          </div>

          <div className="flex gap-2 w-full pt-1.5 border-t border-border-subtle">
            <button className="flex-1 py-2.5 bg-surface-card hover:bg-surface-container border border-border-medium rounded-xl font-body-bold text-xs text-text-secondary cursor-pointer" onClick={onClose} disabled={validating}>Cancel</button>
            <button className="flex-1 py-2.5 bg-blue text-white hover:bg-blue/90 border border-transparent rounded-xl font-body-bold text-xs cursor-pointer flex items-center justify-center gap-1" onClick={handleRequestAccessClick} disabled={validating}>
               <span className="material-symbols-outlined text-[16px]">send</span> 
               <span>Request Access</span>
            </button>
            <button 
              className="flex-[1.5] py-2.5 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-xs cursor-pointer disabled:opacity-50" 
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || validating}
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
