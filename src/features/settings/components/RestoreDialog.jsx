import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

export function RestoreDialog({ open, previewCount, hasData, onClose, onConfirm }) {
  // Prevent scrolling when open
  useEffect(() => {
    if (!open) return;
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

    window.addEventListener('app-back-button', handleBack);
    window.addEventListener('keydown', handleEsc);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('app-back-button', handleBack);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ background: hasData ? 'var(--red-dim)' : 'var(--green-dim)', color: hasData ? 'var(--red)' : 'var(--green)', width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <FiAlertTriangle size={24} />
          </div>
          <button className="icon-btn-ghost" onClick={onClose}><FiX size={20} /></button>
        </div>
        
        <h2 className="dialog__title" style={{ fontSize: '19px', marginBottom: '10px' }}>
          {hasData ? 'Overwrite Existing Data?' : 'Restore Backup'}
        </h2>
        
        <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-1)' }}>
            <strong>Preview:</strong> This backup contains <b>{previewCount}</b> valid services.
          </p>
        </div>

        {hasData ? (
          <p className="dialog__desc" style={{ color: 'var(--text-2)', lineHeight: '1.6', marginBottom: 0 }}>
            We detected existing services and settings on this device. Restoring from this backup will <b>completely replace</b> your current data. 
            <br /><br />
            This action cannot be undone. Are you sure you want to proceed?
          </p>
        ) : (
          <p className="dialog__desc" style={{ color: 'var(--text-2)', lineHeight: '1.6', marginBottom: 0 }}>
            Would you like to import these services to your app?
          </p>
        )}

        <div className="dialog__footer" style={{ marginTop: '28px', gap: '12px' }}>
          <button className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button 
            className={`btn ${hasData ? 'btn--danger' : 'btn--primary'}`} 
            onClick={() => { onConfirm(); onClose(); }}
            style={{ flex: 1.2 }}
          >
            {hasData ? 'Yes, Overwrite' : 'Restore Data'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
