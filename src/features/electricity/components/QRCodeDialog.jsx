import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiExternalLink, FiClock, FiCheck, FiInfo, FiCopy, FiAlertCircle } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';
import { BsQrCode } from 'react-icons/bs';
import toast from 'react-hot-toast';

export function QRCodeDialog({ open, service, onClose, onSave }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [prefixInput, setPrefixInput] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [isTimeInfoHighlighted, setIsTimeInfoHighlighted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentCleanTime = timeInput.replace(/\D/g, '');
  const currentCleanPrefix = prefixInput.replace(/\D/g, '');
  const isDataMissing = !service?.billTime || !service?.billNoPrefix;

  // Extract date segments for pattern visualization
  const dateObj = service?.lastBillDate ? new Date(service.lastBillDate) : null;
  const yy = dateObj ? String(dateObj.getFullYear()).slice(-2) : 'YY';
  const mm = dateObj ? String(dateObj.getMonth() + 1).padStart(2, '0') : 'MM';
  const dd = dateObj ? String(dateObj.getDate()).padStart(2, '0') : 'DD';
  const mSuffix = dateObj ? String(dateObj.getMonth() + 1) : 'M';
  
  const divCode = service?.serviceNumber ? service.serviceNumber.substring(0, 2) : 'DIV';
  const displayDate = dateObj ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // Dynamic Bill No Pattern: [DIV][SEQ][DDMMYY][HHMMSS]1[M][YY]
  const seqPart = currentCleanPrefix.padEnd(3, '_');
  const ddmmyyPart = dateObj ? `${dd}${mm}${yy}` : 'DDMMYY';
  const hhmmssPart = currentCleanTime.padEnd(6, '_');
  const myyPart = `1${mSuffix}${yy}`;
  const billNoDisplay = `${divCode}${seqPart}${ddmmyyPart}${hhmmssPart}${myyPart}`;

  useEffect(() => {
    if (open && service) {
      // billTime is stored as HHMMSS (e.g. 101530)
      const bt = service.billTime || '';
      if (bt.length === 6) {
        setTimeInput(`${bt.substring(0, 2)}:${bt.substring(2, 4)}:${bt.substring(4, 6)}`);
      } else {
        setTimeInput('');
      }

      // billNoPrefix is stored as 3 digits (e.g. 551)
      setPrefixInput(service.billNoPrefix || '');

      setIsEditing(!service.billTime || !service.billNoPrefix); // Auto-open edit mode if data is missing
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
        else if (isEditing && service?.billTime && service?.billNoPrefix) setIsEditing(false);
        else onClose();
      }
    };
    const handleBack = (e) => {
      if (open && !e.detail?.handled) {
        if (showInfo) {
          setShowInfo(false);
          if (e.detail) e.detail.handled = true;
        } else if (isEditing && service?.billTime && service?.billNoPrefix) {
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
    billTime: currentCleanTime.length === 6 ? currentCleanTime : null,
    billNoPrefix: currentCleanPrefix.length === 3 ? currentCleanPrefix : null
  });

  const handleSaveData = async () => {
    if (currentCleanTime.length !== 6 || currentCleanPrefix.length !== 3) return;
    
    setIsSaving(true);
    try {
      await onSave(service.id, {
        billTime: currentCleanTime,
        billNoPrefix: currentCleanPrefix
      });
      setIsEditing(false);
    } catch (e) {
      toast.error('Failed to save data');
    } finally {
      setIsSaving(false);
    }
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
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '340px', position: 'relative' }}>
        <div className="sheet__header" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)', display: 'block', position: 'relative' }}>
          <h3 className="sheet__title" style={{ textAlign: 'center', width: '100%', marginBottom: '4px', fontSize: '18px' }}>{t('pay_bill', 'Pay Bill')}</h3>
          <p className="sheet__eyebrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '10px' }}>
            <span style={{ fontWeight: '600' }}>{service.label || service.customerName || t('untitled')}</span>
            <span style={{ color: 'var(--text-3)', fontSize: '8px' }}>•</span>
            <span className="mono">{service.serviceNumber}</span>
            <button 
              onClick={() => setShowInfo(true)}
              className="icon-btn" 
              style={{ width: '18px', height: '18px', padding: 0, marginLeft: '2px', background: 'none', border: 'none' }}
              aria-label="Show Technical Details"
            >
              <FiInfo size={13} style={{ color: 'var(--text-3)' }} />
            </button>
          </p>
          <button className="icon-btn sheet__close" onClick={onClose} style={{ position: 'absolute', right: '-5px', top: '-5px', border: 'none', background: 'none' }} aria-label="Close"><FiX size={18} /></button>
        </div>

        <div className="dialog__body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* 1. QR Code Section */}
          <div style={{ 
            background: '#fff', 
            padding: '16px', 
            borderRadius: '12px', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
            marginBottom: '12px', 
            flexShrink: 0,
            border: isDataMissing ? '2px solid var(--red)' : 'none',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{ 
              filter: isDataMissing ? 'blur(2px)' : 'none', 
              opacity: isDataMissing ? 0.3 : 1, 
              transition: 'all 0.3s ease',
              display: 'flex'
            }}>
              <QRCodeSVG
                value={upiString}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
            
            {isDataMissing && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: '20px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'var(--red)', fontWeight: '800',
                zIndex: 2
              }}>
                <FiAlertCircle size={32} style={{ marginBottom: '8px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
                <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>QR Disabled</span>
                <span style={{ fontSize: '10px', fontWeight: '700', textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>Enter Details Below</span>
              </div>
            )}
          </div>

          {/* 2. Amount Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-1)' }}>
              ₹{Number(service.publicBillAmount || service.lastAmountDue).toLocaleString('en-IN')}
            </h2>
            {isDataMissing && (
              <button 
                onClick={() => {
                  setIsTimeInfoHighlighted(true);
                  setTimeout(() => setIsTimeInfoHighlighted(false), 3000);
                }}
                style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0 }}
                title="Why is this required?"
              >
                <FiInfo size={16} />
              </button>
            )}
          </div>

          {/* 3. Pay via UPI Button */}
          <a
            href={isDataMissing ? '#' : upiString}
            className={`btn btn--primary ${isDataMissing ? 'btn--disabled' : ''}`}
            onClick={(e) => {
              if (isDataMissing) {
                e.preventDefault();
                setIsTimeInfoHighlighted(true);
                setTimeout(() => setIsTimeInfoHighlighted(false), 2000);
              }
            }}
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              height: '44px', 
              fontSize: '15px', 
              padding: '6px 12px', 
              textDecoration: 'none',
              cursor: isDataMissing ? 'not-allowed' : 'pointer',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              background: isDataMissing ? 'var(--surface-3)' : 'var(--primary)',
              color: isDataMissing ? 'var(--text-3)' : '#fff',
              border: isDataMissing ? '1px solid var(--border)' : 'none',
              opacity: isDataMissing ? 0.6 : 1,
              marginBottom: '20px'
            }}
          >
            {isDataMissing && <FiAlertCircle size={18} style={{ marginRight: '8px' }} />}
            Pay via UPI
          </a>

          {/* 4. Bill Number Visualization */}
          <div style={{ width: '100%', marginBottom: '12px', padding: '8px', background: 'var(--surface-3)', borderRadius: '8px', border: '1px solid var(--border)' }}>
             <p style={{ fontSize: '9px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: '800', marginBottom: '4px' }}>Bill Number for QR</p>
             <p className="mono" style={{ fontSize: '14px', letterSpacing: '1px', color: isDataMissing ? 'var(--text-3)' : 'var(--primary)', fontWeight: '700' }}>
               {billNoDisplay}
             </p>
             <p style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '4px', fontStyle: 'italic' }}>
               Verify if this matches the "Bill No" on your paper receipt.
             </p>
          </div>

          {/* 5. Configuration Section (Verification Details) */}
          <div style={{ 
            width: '100%', 
            marginBottom: '20px', 
            padding: '12px', 
            background: 'var(--surface-2)', 
            borderRadius: '10px', 
            border: '1px solid var(--border)',
            borderBottom: isTimeInfoHighlighted ? '2px solid var(--amber)' : '1px solid var(--border)',
            transition: 'border 0.3s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: '700' }}>Verification Details</p>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '2px 6px' }}
                >
                  Edit Data
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Bill Date</p>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)' }}>{displayDate}</p>
                </div>

                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Sequence ID (3 digits)</p>
                  {isEditing ? (
                    <input
                      type="text"
                      className="field__input"
                      style={{ height: '32px', padding: '0 8px', fontSize: '12px', width: '100%', textAlign: 'center', fontFamily: 'var(--mono)', borderColor: !service?.billNoPrefix ? 'var(--red)' : 'var(--border-md)' }}
                      placeholder="e.g. 551"
                      value={prefixInput}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').substring(0, 3);
                        setPrefixInput(val);
                      }}
                    />
                  ) : (
                    <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)' }}>
                      {prefixInput || '—'}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Gen. Time (HH:MM:SS)</p>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <input
                      type="text"
                      className="field__input"
                      style={{ height: '32px', flex: 1, padding: '0 8px', fontSize: '12px', textAlign: 'center', fontFamily: 'var(--mono)', borderColor: !service?.billTime ? 'var(--red)' : 'var(--border-md)' }}
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
                      onClick={handleSaveData}
                      disabled={currentCleanTime.length !== 6 || currentCleanPrefix.length !== 3}
                      style={{ background: 'var(--primary)', border: 'none', borderRadius: '4px', color: '#fff', width: '44px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (currentCleanTime.length === 6 && currentCleanPrefix.length === 3) ? 1 : 0.5 }}
                      aria-label="Save verification data"
                    >
                      <FiCheck size={16} />
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FiClock size={12} style={{ color: !service?.billTime ? 'var(--red)' : 'var(--primary)' }} />
                    {timeInput || '—'}
                  </p>
                )}
              </div>
            </div>

            <p style={{ 
              fontSize: '10px', 
              color: isTimeInfoHighlighted ? 'var(--text-1)' : 'var(--text-3)', 
              marginTop: '10px', 
              fontStyle: 'italic', 
              textAlign: 'left', 
              lineHeight: '1.6',
              background: isTimeInfoHighlighted ? 'var(--amber-dim)' : 'transparent',
              padding: isTimeInfoHighlighted ? '6px' : '0',
              borderRadius: '4px',
              transition: 'all 0.3s ease'
            }}>
              * Sequence ID and Generation Time are found on your physical receipt. Both are required for a valid payment QR.
            </p>
          </div>

          {/* 6. Experimental Alert */}
          <div style={{ padding: '12px', background: 'var(--red-dim)', borderRadius: '8px', border: '1px solid var(--red-glow)', marginTop: '4px', marginBottom: '24px' }}>
            <p style={{ fontSize: '11px', color: 'var(--red)', fontWeight: '600', lineHeight: '1.4' }}>
              ⚠️ EXPERIMENTAL FEATURE
            </p>
            <p style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '4px', lineHeight: '1.6', textAlign: 'left' }}>
              Currently, APSPDCL does not store generation data in public records, so <b>manual entry</b> is required for valid Direct UPI payment.
            </p>
          </div>
        </div>

        {/* Info Sub-popup */}
        {showInfo && (
          <div
            className="overlay overlay--center"
            style={{ position: 'absolute', zIndex: 100, borderRadius: 'inherit' }}
            onClick={() => setShowInfo(false)}
          >
            <div className="dialog" onClick={e => e.stopPropagation()}>
              <div className="sheet__header" style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--border)' }}>
                <h3 className="sheet__title" style={{ fontSize: '15px' }}>Internal Segments</h3>
                <button className="icon-btn" onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none' }}><FiX size={16} /></button>
              </div>
              <div className="dialog__body" style={{ padding: '16px 0' }}>
                <div style={{ padding: '12px', background: 'var(--surface-3)', borderRadius: '8px', border: '1px solid var(--border)', position: 'relative' }}>
                  <code style={{ display: 'block', fontSize: '11px', wordBreak: 'break-all', textAlign: 'left', color: 'var(--text-2)', fontFamily: 'var(--mono)', lineHeight: '1.5', paddingRight: '32px' }}>
                    {upiString}
                  </code>
                  <button
                    onClick={copyUpiString}
                    className="icon-btn"
                    style={{ position: 'absolute', right: '8px', top: '8px', color: 'var(--primary)', background: 'none', border: 'none' }}
                    title="Copy UPI String"
                  >
                    <FiCopy size={16} />
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '12px', textAlign: 'left', lineHeight: '1.6' }}>
                  These segments are used to construct the UPI payment URI.
                </p>
              </div>
              <div className="dialog__footer" style={{ marginTop: 0, justifyContent: 'center' }}>
                <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowInfo(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
