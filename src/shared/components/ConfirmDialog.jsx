import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function ConfirmDialog({ open, title, description, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onClose, isDanger = false }) {
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
    </div>,
    document.body
  );
}
