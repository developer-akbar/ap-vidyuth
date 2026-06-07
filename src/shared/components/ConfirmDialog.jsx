import { useEffect } from 'react';

export function ConfirmDialog({ open, title, description, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onClose, isDanger = false }) {
  // Prevent scrolling when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <h2 className="dialog__title">{title}</h2>
        <p className="dialog__desc">{description}</p>
        <div className="dialog__footer">
          <button className="btn btn--ghost" onClick={onClose}>{cancelText}</button>
          <button className={`btn ${isDanger ? 'btn--danger' : 'btn--primary'}`} onClick={() => { onConfirm(); onClose(); }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
