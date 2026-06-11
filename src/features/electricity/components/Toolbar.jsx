import { FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiChevronDown, FiGlobe, FiZap, FiCopy, FiLayout, FiEye, FiArrowUp, FiArrowDown, FiWifiOff } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Loader } from '../../../shared/components/Loader.jsx';
import { SessionIndicator } from './SessionIndicator.jsx';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { useNetwork } from '../../../shared/hooks/useNetwork.js';

export function Toolbar({ filters, onFiltersChange, onAdd, onRefreshAll, refreshingAll, activeView, onViewChange, trashCount, hasServices, services, cardStyle, onToggleCardStyle }) {
  const { t, i18n } = useTranslation();
  const [localQuery, setLocalQuery] = useState(filters.query || '');
  const { isOffline } = useNetwork();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (filters.query !== localQuery) {
        onFiltersChange({ ...filters, query: localQuery });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, filters, onFiltersChange]);

  const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
  const isTelugu = currentLang.startsWith('te');

  const toggleLanguage = () => {
    i18n.changeLanguage(isTelugu ? 'en' : 'te');
  };

  const copyAllNumbers = async () => {
    if (!services || services.length === 0) return;
    const numbers = services.map(s => s.serviceNumber).join(', ');
    try {
      await navigator.clipboard.writeText(numbers);
      toast.success(t('copied_all', 'All service numbers copied'));
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  const toggleSortOrder = () => {
    const nextOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
    onFiltersChange({ ...filters, sortOrder: nextOrder });
  };

  return (
    <div className="toolbar toolbar--v2">
      {/* ── Top Row: Search, Language, Add ── */}
      <div className="toolbar__row toolbar__row--top">
        <div className="search-box search-box--v2">
          <FiSearch size={16} className="search-box__icon" />
          <input
            value={localQuery}
            onChange={e => setLocalQuery(e.target.value)}
            placeholder={t('search_services')}
          />
        </div>
        
        <div className="toolbar__group">
          <button 
            className="btn btn--ghost btn--sm btn--v2 btn--lang" 
            onClick={toggleLanguage} 
            title={t('language')} 
            aria-label={t('language')}
          >
            <FiGlobe size={15} />
            <span className="hide-mobile-sm">{isTelugu ? 'English' : 'తెలుగు'}</span>
            <span className="show-mobile-sm">{isTelugu ? 'En' : 'తె'}</span>
          </button>

          <button className="btn btn--primary btn--sm btn--v2 btn--add" onClick={onAdd} aria-label={t('add_service')}>
            <FiPlus size={16} />
            <span>{t('add')}</span>
          </button>
        </div>
      </div>

      <div className="toolbar__row toolbar__row--bottom toolbar__row--v2">
        <div className="toolbar__group toolbar__group--v2">
          <div className="seg seg--v2">
            <button 
              className={`seg__btn seg__btn--v2 ${activeView === 'active' ? 'seg__btn--active' : ''}`} 
              onClick={() => onViewChange('active')}
              aria-label={t('view_active_services', 'View active services')}
            >
               <FiZap size={14} className="seg__icon" />
               <span>{t('active')}</span>
            </button>
            <button 
              className={`seg__btn seg__btn--v2 ${activeView === 'trash' ? 'seg__btn--active' : ''}`} 
              onClick={() => onViewChange('trash')}
              aria-label={t('view_trash', 'View trash')}
            >
              <FiTrash2 size={14} className="seg__icon" />
              {trashCount > 0 && <span className="badge badge--v2">{trashCount}</span>}
              <span className="hide-mobile-sm">{t('trash')}</span>
            </button>
          </div>

          <button 
            className={`btn btn--ghost btn--sm btn--v2 btn--style ${cardStyle === 'rich' ? 'btn--style-active' : ''}`}
            onClick={onToggleCardStyle} 
            title={cardStyle === 'classic' ? 'Switch to Quick Glance' : 'Switch to Classic'}
            aria-label={cardStyle === 'classic' ? 'Switch to Quick Glance' : 'Switch to Classic'}
          >
            {cardStyle === 'classic' ? <FiLayout size={16} /> : <FiEye size={16} />}
            <span className="hide-xs">{cardStyle === 'classic' ? 'Classic' : 'Glance'}</span>
          </button>

          <div className="toolbar__filters-group">
            <div className="select-wrap select-wrap--v2">
              <select 
                className="select select--v2" 
                value={filters.status} 
                onChange={e => onFiltersChange({ ...filters, status: e.target.value })}
                aria-label={t('filter_by_status', 'Filter by status')}
              >
                <option value="">{t('filter_all')}</option>
                <option value="DUE">{t('filter_due')}</option>
                <option value="PAID">{t('filter_paid')}</option>
                <option value="NO_DUES">{t('filter_no_dues')}</option>
                <option value="UNKNOWN">{t('filter_unknown')}</option>
              </select>
              <FiChevronDown size={14} className="select-icon" />
            </div>

            <div className="sort-group--v2">
              <div className="select-wrap select-wrap--v2">
                <select 
                  className="select select--v2" 
                  value={filters.sort} 
                  onChange={e => onFiltersChange({ ...filters, sort: e.target.value })}
                  aria-label={t('sort_by', 'Sort by')}
                >
                  <option value="amount">{t('sort_amount')}</option>
                  <option value="dueDate">{t('sort_due_date')}</option>
                  <option value="name">{t('sort_name')}</option>
                </select>
                <FiChevronDown size={14} className="select-icon" />
              </div>
              <button 
                className="icon-btn-micro icon-btn-micro--v2" 
                onClick={toggleSortOrder}
                title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                aria-label={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {filters.sortOrder === 'asc' ? <FiArrowUp size={14} /> : <FiArrowDown size={14} />}
              </button>
            </div>
          </div>
        </div>

        <div className="toolbar__actions--v2">
          <button 
            className="btn btn--ghost btn--sm btn--v2 btn--refresh-all" 
            onClick={(e) => {
              if (isOffline) {
                toast('You are offline. Reconnect to refresh.', { icon: <FiWifiOff color="var(--amber)" /> });
                return;
              }
              onRefreshAll(e);
            }} 
            disabled={refreshingAll || !hasServices || isOffline} 
            aria-label={t('refresh_all', 'Refresh all services')}
            title={isOffline ? 'Offline' : ''}
          >
            {refreshingAll ? <Loader size={14} /> : (isOffline ? <FiWifiOff size={14} /> : <FiRefreshCw size={14} />)}
            <span className="hide-xs">{t('refresh')}</span>
          </button>
          <div className="toolbar__divider" />
          <SessionIndicator />
        </div>
      </div>
    </div>
  );
}
