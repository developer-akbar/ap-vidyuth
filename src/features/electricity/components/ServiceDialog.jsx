import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiZap, FiChevronDown } from 'react-icons/fi';
import { isValidServiceNumber } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

export function ServiceDialog({ open, service, initialServiceNumber, onClose, onSubmit, services = [] }) {
  const [label, setLabel] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPrefixes, setShowPrefixes] = useState(false);
  const { t } = useTranslation();
  
  const triggerRef = useRef(null);
  const sheetRef = useRef(null);
  const labelRef = useRef(null);
  const numRef = useRef(null);
  const bulkRef = useRef(null);
  const prefixRef = useRef(null);

  // Extract unique 9-digit prefixes from existing services
  const prefixes = useMemo(() => {
    if (!services || services.length === 0) return [];
    const set = new Set();
    services.forEach(s => {
      if (s.serviceNumber && s.serviceNumber.length >= 8) {
        set.add(s.serviceNumber.substring(0, 9)); 
      }
    });
    return Array.from(set).sort();
  }, [services]);

  // Filter prefixes based on what user has already typed
  const filteredPrefixes = useMemo(() => {
    if (!serviceNumber) return prefixes;
    const filtered = prefixes.filter(p => p.startsWith(serviceNumber));
    // If exact match found, hide suggestions
    if (filtered.length === 1 && filtered[0] === serviceNumber) return [];
    return filtered;
  }, [prefixes, serviceNumber]);

  useEffect(() => {
    if (!open) return;
    
    triggerRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const handleBack = (e) => {
      if (e.type === 'app-back-button' && e.detail) {
        e.detail.handled = true;
      }
      onClose();
    };

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = sheetRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('app-back-button', handleBack);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('keydown', handleTab);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('keydown', handleTab);
      triggerRef.current?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) { 
      setLabel(service?.label || ''); 
      setServiceNumber(service?.serviceNumber || initialServiceNumber || ''); 
      setIsBulk(false);
      setBulkInput('');
      setShowPrefixes(false);
      
      // Auto-focus Label field
      const timer = setTimeout(() => {
        if (!service && !isBulk) {
           if (labelRef.current) labelRef.current.focus();
        } else if (service) {
          if (labelRef.current) {
            labelRef.current.focus();
            const len = (service.label || '').length;
            labelRef.current.setSelectionRange(len, len);
          }
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [service, open, isBulk, initialServiceNumber]);

  // Handle clicking outside prefix dropdown
  useEffect(() => {
    const handleClick = (e) => {
      if (prefixRef.current && !prefixRef.current.contains(e.target)) {
        setShowPrefixes(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus bulk textarea when switching to bulk mode
  useEffect(() => {
    if (isBulk) {
      setTimeout(() => {
        if (bulkRef.current) bulkRef.current.focus();
      }, 100);
    }
  }, [isBulk]);

  const numError = useMemo(() => {
    if (isBulk || !serviceNumber) return '';
    return isValidServiceNumber(serviceNumber) ? '' : t('must_be_13_digits');
  }, [serviceNumber, isBulk, t]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (isBulk) {
      const lines = bulkInput.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
      const entries = lines.map(line => {
        let label = '';
        let number = '';
        if (line.includes(':')) {
          const parts = line.split(':');
          number = parts.pop().trim();
          label = parts.join(':').trim();
        } else {
          number = line.trim();
        }
        number = number.replace(/\D/g, '');
        return { label, number };
      }).filter(entry => entry.number.length === 13);

      if (entries.length === 0) {
        toast.error('No valid 13-digit service numbers found');
        return;
      }
      
      setSaving(true);
      try {
        await onSubmit({ isBulk: true, entries });
        onClose();
      } catch (err) {
        // Error toast handled by onSubmit in Dashboard
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!isValidServiceNumber(serviceNumber)) return;
    setSaving(true);
    try { 
      await onSubmit({ label: label.trim(), serviceNumber }); 
      onClose(); 
    } catch (err) {
      // Error toast handled by onSubmit in Dashboard
    } finally { 
      setSaving(false); 
    }
  }

  return createPortal(
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" ref={sheetRef}>
        <div className="sheet__handle" />

        <div className="sheet__header">
          <div className="sheet__icon"><FiZap size={16} /></div>
          <div style={{ flex: 1 }}>
            <p className="sheet__eyebrow">{service ? t('edit_service') : (isBulk ? t('bulk_add') : t('new_service'))}</p>
            <h2 className="sheet__title">{service ? t('update_details') : (isBulk ? t('add_multiple_services') : t('add_apspdcl_service'))}</h2>
          </div>
          {!service && (
            <button 
              type="button" 
              className={`btn btn--xs ${isBulk ? 'btn--primary' : 'btn--ghost'}`} 
              onClick={() => setIsBulk(!isBulk)}
              style={{ marginRight: '8px' }}
            >
              {isBulk ? t('single_mode') : t('bulk_mode')}
            </button>
          )}
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <form className="sheet__form" onSubmit={handleSubmit}>
          {isBulk ? (
            <label className="field">
              <span className="field__label">{t('service_numbers_comma')}</span>
              <textarea
                ref={bulkRef}
                className="field__input"
                style={{ height: '120px', fontFamily: 'monospace', paddingTop: '10px' }}
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                placeholder="name1:0000000000000, name2:0000000000000"
                required
              />
              <span className="field__hint">{t('bulk_hint')}</span>
            </label>
          ) : (
            <>
              <label className="field">
                <span className="field__label">{t('label')} <span className="field__optional">{t('optional')}</span></span>
                <input 
                  ref={labelRef}
                  className="field__input" 
                  value={label} 
                  onChange={e => setLabel(e.target.value)} 
                  placeholder={t('label_placeholder')} 
                />
              </label>

              <label className="field">
                <span className="field__label">{t('service_number')}</span>
                <div style={{ position: 'relative' }} ref={prefixRef}>
                  <input
                    ref={numRef}
                    className={`field__input field__input--mono ${numError ? 'field__input--error' : ''}`}
                    value={serviceNumber}
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setServiceNumber(val);
                      if (!service && !isBulk && val.length < 9) setShowPrefixes(true);
                      else setShowPrefixes(false);
                    }}
                    onFocus={() => {
                      if (!service && !isBulk && prefixes.length > 0 && serviceNumber.length < 9) {
                        setShowPrefixes(true);
                      }
                    }}
                    placeholder="0000000000000"
                    required
                    disabled={saving}
                  />
                  {!service && !isBulk && prefixes.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setShowPrefixes(!showPrefixes)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: '4px', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <FiChevronDown size={14} style={{ transform: showPrefixes ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                  )}
                  {showPrefixes && filteredPrefixes.length > 0 && (
                    <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                      {filteredPrefixes.map(p => (
                        <button
                          key={p}
                          type="button"
                          className="dropdown-item"
                          onClick={() => {
                            setServiceNumber(p);
                            setShowPrefixes(false);
                            if (numRef.current) {
                              numRef.current.focus();
                              // Move cursor to end
                              setTimeout(() => {
                                const len = p.length;
                                numRef.current.setSelectionRange(len, len);
                              }, 10);
                            }
                          }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '13px', border: 'none', background: 'none', color: 'var(--text-1)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        >
                          {p}<span style={{ color: 'var(--text-3)', fontSize: '11px', marginLeft: '6px' }}>... (prefix)</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {serviceNumber && (
                  <span className={`field__hint ${numError ? 'field__hint--error' : 'field__hint--ok'}`}>
                    {numError || t('valid_format')}
                  </span>
                )}
              </label>
            </>
          )}

          <div className="sheet__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn--primary" disabled={saving || (!isBulk && (!!numError || serviceNumber.length !== 13)) || (isBulk && !bulkInput.trim())}>
              {saving ? t('saving') : (service ? t('save_changes') : t('add_service'))}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
