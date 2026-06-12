import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function ConfirmDialog({ open, title, description, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onClose, isDanger = false }) {
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);

  // Prevent scrolling and handle focus/accessibility when open
  useEffect(() => {
    if (!open) return;
    
    triggerRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    // Move focus to first button
    setTimeout(() => {
      const firstBtn = dialogRef.current?.querySelector('button');
      firstBtn?.focus();
    }, 10);

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
      const focusables = dialogRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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

  if (!open) return null;

  return createPortal(
    <div className="overlay overlay--center" onClick={e => {
      if (e.target !== e.currentTarget) return;
      if (isDanger) return;
      onClose();
    }}>
      <div className="dialog" role="dialog" aria-modal="true" ref={dialogRef}>
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
