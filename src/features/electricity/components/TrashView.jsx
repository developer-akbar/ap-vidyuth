import { formatDate } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';

export function TrashView({ services, onRestore, onDeletePermanent, selectedIds, onToggleSelect, selecting }) {
  const { t } = useTranslation();
  const longPressTimer = useRef(null);
  const touchPos = useRef({ x: 0, y: 0 });

  if (!services.length) return (
    <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border-medium rounded-xl text-center bg-surface-card min-h-[300px]">
      <span className="material-symbols-outlined text-[36px] text-text-muted mb-3">folder_zip</span>
      <h3 className="font-headline-md text-headline-md text-on-surface">{t('trash_empty')}</h3>
      <p className="text-xs text-text-muted mt-1">{t('deleted_services_here')}</p>
    </div>
  );

  const handlePressStart = (id) => (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchPos.current = { x: clientX, y: clientY };

    longPressTimer.current = setTimeout(() => {
      if (onToggleSelect && !selecting) {
        onToggleSelect(id);
        if (window.navigator.vibrate) window.navigator.vibrate(50);
      }
    }, 700);
  };

  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePressMove = (e) => {
    if (!longPressTimer.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = Math.abs(clientX - touchPos.current.x);
    const dy = Math.abs(clientY - touchPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {services.map(s => {
          const isSelected = selectedIds.has(s.id);
          return (
            <div 
              key={s.id} 
              className={`scard bg-surface-card border border-border-medium rounded-xl p-3 flex items-center justify-between shadow-xs transition-colors cursor-pointer ${
                isSelected ? 'border-primary bg-primary-dim/5' : ''
              }`}
              onMouseDown={handlePressStart(s.id)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onMouseMove={handlePressMove}
              onTouchStart={handlePressStart(s.id)}
              onTouchEnd={handlePressEnd}
              onTouchMove={handlePressMove}
              onContextMenu={e => { if (longPressTimer.current || selecting) e.preventDefault(); }}
              onClick={() => selecting ? onToggleSelect(s.id) : undefined}
              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
            >
              <div className="flex items-center gap-3">
                {selecting && (
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      readOnly
                      className="w-[18px] h-[18px] cursor-pointer rounded border-border-medium text-primary focus:ring-primary"
                    />
                  </div>
                )}
                <div className="flex flex-col">
                  <h4 className="font-body-bold text-[14px] text-on-surface">{s.label || t('untitled')}</h4>
                  <span className="font-mono-data text-xs text-text-secondary mt-0.5">{s.serviceNumber}</span>
                  <small className="text-[10px] text-text-muted mt-1">{t('deleted')} {formatDate(s.deletedAt)}</small>
                </div>
              </div>
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <button 
                  className="flex items-center gap-1 px-3 py-1.5 bg-surface-card hover:bg-surface-container-low border border-border-medium rounded-lg text-xs font-body-bold text-text-secondary cursor-pointer"
                  onClick={() => onRestore(s.id)}
                >
                  <span className="material-symbols-outlined text-[16px]">restore</span>
                  <span>{t('restore')}</span>
                </button>
                <button 
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-dim/10 text-red cursor-pointer border border-transparent"
                  onClick={() => onDeletePermanent(s.id)}
                >
                  <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}