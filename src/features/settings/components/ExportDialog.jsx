import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiDownload, FiShare2, FiFileText, FiX, FiList } from 'react-icons/fi';

export function ExportDialog({ open, onClose, onSave, onShare, onExportCsv }) {
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
          <div style={{ background: 'var(--blue-dim)', color: 'var(--blue)', width: '44px', height: '44px', borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <FiFileText size={24} />
          </div>
          <button className="icon-btn-ghost" onClick={onClose}><FiX size={20} /></button>
        </div>
        
        <h2 className="dialog__title" style={{ fontSize: '19px', marginBottom: '10px' }}>Export Backup</h2>
        <p className="dialog__desc" style={{ color: 'var(--text-2)', lineHeight: '1.6' }}>
          Your services and settings have been packed into a secure backup file. How would you like to export it?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px', maxHeight: '50vh', overflowY: 'auto' }}>
          <button 
            className="btn btn--ghost" 
            style={{ justifyContent: 'flex-start', padding: '16px', height: 'auto', textAlign: 'left', border: '1px solid var(--border-hi)', whiteSpace: 'normal', width: '100%' }}
            onClick={() => { onSave(); onClose(); }}
          >
            <div style={{ background: 'var(--green-dim)', color: 'var(--green)', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', marginRight: '12px', flexShrink: 0 }}>
              <FiDownload size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>Save to Device (JSON)</b>
              <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '400' }}>Download as a .json file directly to your downloads folder. Best for restoring later.</span>
            </div>
          </button>

          <button 
            className="btn btn--ghost" 
            style={{ justifyContent: 'flex-start', padding: '16px', height: 'auto', textAlign: 'left', border: '1px solid var(--border-hi)', whiteSpace: 'normal', width: '100%' }}
            onClick={() => { onShare(); onClose(); }}
          >
            <div style={{ background: 'var(--primary-dim)', color: 'var(--primary)', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', marginRight: '12px', flexShrink: 0 }}>
              <FiShare2 size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>Share File</b>
              <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '400' }}>Send via WhatsApp or Email. (Shared as .txt for compatibility, perfectly safe to restore).</span>
            </div>
          </button>

          <button 
            className="btn btn--ghost" 
            style={{ justifyContent: 'flex-start', padding: '16px', height: 'auto', textAlign: 'left', border: '1px solid var(--border-hi)', whiteSpace: 'normal', width: '100%' }}
            onClick={() => { onExportCsv(); onClose(); }}
          >
            <div style={{ background: 'var(--orange-dim)', color: 'var(--orange)', width: '32px', height: '32px', borderRadius: '8px', display: 'grid', placeItems: 'center', marginRight: '12px', flexShrink: 0 }}>
              <FiList size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>Export as CSV</b>
              <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '400' }}>Download your active services as a spreadsheet for easy reading. (Cannot be used to restore).</span>
            </div>
          </button>
        </div>

        <div className="dialog__footer" style={{ marginTop: '24px' }}>
          <button className="btn btn--ghost" onClick={onClose} style={{ width: '100%' }}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
