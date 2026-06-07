import { FiRefreshCw, FiTrash2, FiPackage } from 'react-icons/fi';
import { formatDate } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import { Loader } from '../../../shared/components/Loader.jsx';

export function TrashView({ services, onRestore, onDeletePermanent, selectedIds, onToggleSelect, selecting }) {
  const { t } = useTranslation();
  const longPressTimer = useRef(null);
  const touchPos = useRef({ x: 0, y: 0 });

  if (!services.length) return (
    <div className="empty-state">
      <div className="empty-state__icon"><FiPackage size={28} /></div>
      <h3>{t('trash_empty')}</h3>
      <p>{t('deleted_services_here')}</p>
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
    <div className="trash-container">
      <div className="trash-list">
        {services.map(s => (
          <div 
            key={s.id} 
            className={`trash-item ${selectedIds.has(s.id) ? 'trash-item--selected' : ''}`}
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
            {selecting && (
              <div className="trash-item__select" style={{ paddingRight: '12px', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={selectedIds.has(s.id)} 
                  readOnly
                  style={{ width: '18px', height: '18px', margin: 0, pointerEvents: 'none' }}
                />
              </div>
            )}
            <div className="trash-item__info">
              <h4>{s.label || t('untitled')}</h4>
              <span className="mono-sm">{s.serviceNumber}</span>
              <small>{t('deleted')} {formatDate(s.deletedAt)}</small>
            </div>
            <div className="trash-item__actions">
              <button className="btn btn--ghost btn--xs" onClick={(e) => { e.stopPropagation(); onRestore(s.id); }}><Loader size={12} /> {t('restore')}</button>
              <button className="btn btn--danger btn--xs" onClick={(e) => { e.stopPropagation(); onDeletePermanent(s.id); }}><FiTrash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}