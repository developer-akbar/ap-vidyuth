import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

export function RestoreDialog({ open, onClose, onConfirm }) {
  // Prevent scrolling when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ background: 'var(--red-dim)', color: 'var(--red)', width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <FiAlertTriangle size={24} />
          </div>
          <button className="icon-btn-ghost" onClick={onClose}><FiX size={20} /></button>
        </div>
        
        <h2 className="dialog__title" style={{ fontSize: '19px', marginBottom: '10px' }}>Overwrite Existing Data?</h2>
        <p className="dialog__desc" style={{ color: 'var(--text-2)', lineHeight: '1.6' }}>
          We detected existing services and settings on this device. Restoring from this backup will <b>completely replace</b> your current data. 
          <br /><br />
          This action cannot be undone. Are you sure you want to proceed?
        </p>

        <div className="dialog__footer" style={{ marginTop: '28px', gap: '12px' }}>
          <button className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button 
            className="btn btn--danger" 
            onClick={() => { onConfirm(); onClose(); }}
            style={{ flex: 1.2, background: 'var(--red)', color: '#fff' }}
          >
            Yes, Overwrite
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
