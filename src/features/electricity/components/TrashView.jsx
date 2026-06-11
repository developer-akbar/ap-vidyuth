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
    <div className="trash-container--v2">
      <div className="trash-list--v2">
        {services.map(s => (
          <div 
            key={s.id} 
            className={`trash-item--v2 ${selectedIds.has(s.id) ? 'trash-item--selected' : ''}`}
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
              <div className="trash-item__select--v2">
                <input 
                  type="checkbox" 
                  checked={selectedIds.has(s.id)} 
                  readOnly
                  className="checkbox--v2"
                />
              </div>
            )}
            <div className="trash-item__info">
              <h4 className="trash-item__name">{s.label || t('untitled')}</h4>
              <div className="trash-item__meta">
                <span className="trash-item__num">{s.serviceNumber}</span>
                <span className="trash-item__dot" />
                <span className="trash-item__date">{t('deleted')} {formatDate(s.deletedAt)}</span>
              </div>
            </div>
            <div className="trash-item__actions--v2">
              <button 
                className="btn btn--ghost btn--sm btn--v2 btn--restore" 
                onClick={(e) => { e.stopPropagation(); onRestore(s.id); }}
                title={t('restore')}
              >
                <FiRefreshCw size={14} />
                <span className="hide-mobile-sm">{t('restore')}</span>
              </button>
              <button 
                className="btn btn--danger btn--sm btn--v2" 
                onClick={(e) => { e.stopPropagation(); onDeletePermanent(s.id); }}
                title={t('delete_permanent')}
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>

  );
}