import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiExternalLink, FiClock, FiCheck, FiInfo, FiCopy, FiAlertCircle } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';
import toast from 'react-hot-toast';
import { BsQrCode } from 'react-icons/bs';

export function QRCodeDialog({ open, service, onClose, onUpdateTime }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [isTimeInfoHighlighted, setIsTimeInfoHighlighted] = useState(false);

  const currentCleanTime = timeInput.replace(/\D/g, '');
  const isTimeMissing = !service?.billTime && currentCleanTime.length !== 6;

  // Extract time from current service data
  const dateObj = service?.lastBillDate ? new Date(service.lastBillDate) : null;
  const displayDate = dateObj ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  useEffect(() => {
    if (open && service) {
      // billTime is stored as HHMMSS (e.g. 101530)
      const bt = service.billTime || '';
      if (bt.length === 6) {
        setTimeInput(`${bt.substring(0, 2)}:${bt.substring(2, 4)}:${bt.substring(4, 6)}`);
      } else {
        setTimeInput('');
      }
      setIsEditing(!service.billTime); // Auto-open edit mode if time is missing
      setShowInfo(false);
      setIsTimeInfoHighlighted(false);
    }
  }, [open, service]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Handle Esc and Back button
  useEffect(() => {
    const handleKeyDown = (e) => { 
      if (e.key === 'Escape' && open) {
        if (showInfo) setShowInfo(false);
        else if (isEditing && service?.billTime) setIsEditing(false);
        else onClose();
      }
    };
    const handleBack = (e) => {
      if (open && !e.detail?.handled) {
        if (showInfo) {
          setShowInfo(false);
          if (e.detail) e.detail.handled = true;
        } else if (isEditing && service?.billTime) {
          setIsEditing(false);
          if (e.detail) e.detail.handled = true;
        } else {
          onClose();
          if (e.detail) e.detail.handled = true;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('app-back-button', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('app-back-button', handleBack);
    };
  }, [open, onClose, showInfo, isEditing, service]);

  if (!open || !service) return null;

  // Use live time input for dynamic QR preview
  const upiString = generateAPSPDCLUpiString({ 
    ...service, 
    billTime: currentCleanTime.length === 6 ? currentCleanTime : null 
  });

  const handleSaveTime = () => {
    if (currentCleanTime.length !== 6) return;
    onUpdateTime(service.id, currentCleanTime);
    setIsEditing(false);
  };

  const copyUpiString = async () => {
    try {
      await navigator.clipboard.writeText(upiString);
      toast.success('UPI String copied');
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  return createPortal(
    <div className="overlay overlay--center" onClick={onClose}>
      <div className="dialog dialog--v2" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '380px' }}>
        <header className="dialog__header dialog__header--v2">
          <div className="dialog__title-group">
            <div className="dialog__icon-wrap">
              <BsQrCode size={20} />
            </div>
            <div>
              <h2 className="dialog__title">{t('pay_bill', 'Pay Bill')}</h2>
              <p className="dialog__subtitle">{service.label || t('untitled')} • {service.serviceNumber}</p>
            </div>
          </div>
          <button className="icon-btn-ghost icon-btn-ghost--v2" onClick={onClose} aria-label={t('close')}><FiX size={20} /></button>
        </header>

        <div className="dialog__body dialog__body--v2">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ 
              background: '#fff', 
              padding: '16px', 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
              marginBottom: '20px', 
              flexShrink: 0,
              border: isTimeMissing ? '2px solid var(--red)' : 'none'
            }}>
              <QRCodeSVG
                value={upiString}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <h2 className="summary-card__value" style={{ fontSize: '32px' }}>
                ₹{Number(service.publicBillAmount || service.lastAmountDue).toLocaleString('en-IN')}
              </h2>
              {isTimeMissing && (
                <button 
                  onClick={() => {
                    setIsTimeInfoHighlighted(true);
                    setTimeout(() => setIsTimeInfoHighlighted(false), 3000);
                  }}
                  className="icon-btn-micro"
                  title="Why is this required?"
                >
                  <FiInfo size={16} />
                </button>
              )}
            </div>

            {/* Time Configuration Section */}
            <div className="alert-card alert-card--info mb-24" style={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="alert-card__label" style={{ margin: 0 }}>Bill generation info</p>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}
                  >
                    Edit Time
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase' }}>Bill Date</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-1)' }}>{displayDate}</p>
                </div>

                <div style={{ flex: 1.2 }}>
                  <p style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase' }}>Gen. Time</p>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <input
                        type="text"
                        className="field__input field__input--v2"
                        style={{ height: '36px', padding: '0 8px', fontSize: '13px', width: '84px', textAlign: 'center', fontFamily: 'var(--mono)' }}
                        placeholder="10:15:30"
                        value={timeInput}
                        onChange={e => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.length > 6) val = val.substring(0, 6);
                          if (val.length > 4) val = val.substring(0, 2) + ':' + val.substring(2, 4) + ':' + val.substring(4);
                          else if (val.length > 2) val = val.substring(0, 2) + ':' + val.substring(2);
                          setTimeInput(val);
                        }}
                      />
                      <button
                        onClick={handleSaveTime}
                        disabled={currentCleanTime.length !== 6}
                        className="btn btn--primary btn--v2"
                        style={{ width: '36px', height: '36px', padding: 0 }}
                      >
                        <FiCheck size={16} />
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FiClock size={14} style={{ color: isTimeMissing ? 'var(--red)' : 'var(--primary)' }} />
                      {timeInput || '—'}
                    </p>
                  )}
                </div>
              </div>

              <p style={{ 
                fontSize: '10px', 
                color: isTimeInfoHighlighted ? 'var(--text-1)' : 'var(--text-3)', 
                fontStyle: 'italic', 
                textAlign: 'left', 
                lineHeight: '1.6',
                background: isTimeInfoHighlighted ? 'var(--amber-dim)' : 'transparent',
                padding: isTimeInfoHighlighted ? '6px' : '0',
                borderRadius: '4px',
                transition: 'all 0.3s ease'
              }}>
                * Providing the exact bill generation time (found on your receipt) generates a valid QR code for payments directly to APSPDCL.
              </p>
            </div>

            <a
              href={upiString}
              className={`btn btn--primary btn--v2 ${isTimeMissing ? 'btn--danger-outline' : ''}`}
              onClick={(e) => { if (!upiString) e.preventDefault(); }}
              style={{ width: '100%', textDecoration: 'none', height: '48px', fontSize: '15px' }}
            >
              {isTimeMissing && <FiAlertCircle size={18} style={{ marginRight: '8px' }} />}
              Pay via UPI
            </a>

            <div className="alert-banner--v2 alert-banner--warning mt-24">
              <FiAlertCircle size={20} className="alert-banner__icon" />
              <div className="alert-banner__content">
                 <h4 className="alert-banner__title">EXPERIMENTAL FEATURE</h4>
                 <p className="alert-banner__text" style={{ textAlign: 'left' }}>
                    Currently, APSPDCL does not store generation times in public records, so <b>manual entry</b> is required for valid Direct UPI payment.
                 </p>
              </div>
            </div>
          </div>
        </div>

        <div className="dialog__footer dialog__footer--v2">
          <button className="btn btn--ghost btn--v2 flex-1" onClick={() => setShowInfo(true)}>{t('details')}</button>
          <button className="btn btn--primary btn--v2 flex-1" onClick={onClose}>{t('close')}</button>
        </div>

        {/* Info Sub-popup */}
        {showInfo && (
          <div className="overlay overlay--center" style={{ position: 'absolute', zIndex: 100, borderRadius: 'inherit' }} onClick={() => setShowInfo(false)}>
            <div className="dialog dialog--v2" onClick={e => e.stopPropagation()} style={{ width: '90%' }}>
               <header className="dialog__header dialog__header--v2">
                  <h3 className="dialog__title">UPI Technical Details</h3>
                  <button className="icon-btn-ghost icon-btn-ghost--v2" onClick={() => setShowInfo(false)}><FiX size={18} /></button>
               </header>
              <div className="dialog__body dialog__body--v2">
                <div style={{ padding: '12px', background: 'var(--surface-3)', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                  <code style={{ display: 'block', fontSize: '11px', wordBreak: 'break-all', textAlign: 'left', color: 'var(--text-2)', fontFamily: 'var(--mono)', lineHeight: '1.5', paddingRight: '32px' }}>
                    {upiString}
                  </code>
                  <button
                    onClick={copyUpiString}
                    className="icon-btn-micro"
                    style={{ position: 'absolute', right: '8px', top: '8px', color: 'var(--primary)' }}
                    title="Copy UPI String"
                  >
                    <FiCopy size={16} />
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '12px', textAlign: 'left', lineHeight: '1.6' }}>
                  These segments are used to construct the UPI payment URI as per APSPDCL standards.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
