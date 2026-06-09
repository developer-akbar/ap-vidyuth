import { FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiChevronDown, FiGlobe, FiZap, FiCopy, FiLayout, FiEye, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Loader } from '../../../shared/components/Loader.jsx';
import { SessionIndicator } from './SessionIndicator.jsx';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';

export function Toolbar({ filters, onFiltersChange, onAdd, onRefreshAll, refreshingAll, activeView, onViewChange, trashCount, hasServices, services, cardStyle, onToggleCardStyle }) {
  const { t, i18n } = useTranslation();
  const [localQuery, setLocalQuery] = useState(filters.query || '');

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
    <div className="toolbar">
      {/* ── Top Row: Search, Language, Add ── */}
      <div className="toolbar__row toolbar__row--top">
        <div className="search-box">
          <FiSearch size={14} />
          <input
            value={localQuery}
            onChange={e => setLocalQuery(e.target.value)}
            placeholder={t('search_services')}
          />
        </div>
        
        <div className="toolbar__group">
          <button 
            className="btn btn--ghost btn--sm" 
            onClick={toggleLanguage} 
            title={t('language')} 
            aria-label={t('language')}
            style={{ padding: '0 8px' }}
          >
            <FiGlobe size={15} />
            <span className="hide-mobile-sm" style={{ marginLeft: '4px' }}>{isTelugu ? 'English' : 'తెలుగు'}</span>
            <span className="show-mobile-sm" style={{ marginLeft: '4px', fontSize: '11px', fontWeight: '800' }}>{isTelugu ? 'En' : 'తె'}</span>
          </button>

          <button className="btn btn--primary btn--sm" onClick={onAdd} aria-label={t('add_service')}>
            <FiPlus size={15} />
            <span style={{ marginLeft: '4px' }}>{t('add')}</span>
          </button>
        </div>
      </div>

      <div className="toolbar__row toolbar__row--bottom" style={{ flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="toolbar__group" style={{ flex: '1 1 auto', justifyContent: 'flex-start', gap: '6px', flexWrap: 'wrap' }}>
          <div className="seg">
            <button 
              className={`seg__btn ${activeView === 'active' ? 'seg__btn--active' : ''}`} 
              onClick={() => onViewChange('active')}
              aria-label={t('view_active_services', 'View active services')}
            >
               <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                 <FiZap size={14} className="show-mobile-sm" />
                 {t('active')}
               </span>
            </button>
            <button 
              className={`seg__btn ${activeView === 'trash' ? 'seg__btn--active' : ''}`} 
              onClick={() => onViewChange('trash')}
              aria-label={t('view_trash', 'View trash')}
            >
              <FiTrash2 size={13} />
              {trashCount > 0 && <span className="badge">{trashCount}</span>}
            </button>
          </div>

          <button 
            className="btn btn--ghost btn--sm" 
            onClick={onToggleCardStyle} 
            title={cardStyle === 'classic' ? 'Switch to Quick Glance' : 'Switch to Classic'}
            aria-label={cardStyle === 'classic' ? 'Switch to Quick Glance' : 'Switch to Classic'}
            style={{ padding: '0 6px', height: '32px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <span style={{ fontSize: '11px', fontWeight: '700' }} className="hide-xs">View Style</span>
            <span style={{ fontSize: '11px', fontWeight: '700' }} className="show-xs hide-xxs">Style</span>
            {cardStyle === 'classic' ? <FiLayout size={17} style={{ color: 'var(--text-3)' }} /> : <FiEye size={17} style={{ color: 'var(--primary)' }} />}
          </button>

          <div className="toolbar__filters" style={{ display: 'flex', gap: '4px' }}>
            <div className="select-wrap">
              <select 
                className="select" 
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
              <FiChevronDown size={12} className="select-icon" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', paddingRight: '2px' }}>
              <div className="select-wrap" style={{ border: 'none' }}>
                <select 
                  className="select" 
                  value={filters.sort} 
                  onChange={e => onFiltersChange({ ...filters, sort: e.target.value })}
                  aria-label={t('sort_by', 'Sort by')}
                  style={{ border: 'none', background: 'transparent' }}
                >
                  <option value="amount">{t('sort_amount')}</option>
                  <option value="dueDate">{t('sort_due_date')}</option>
                  <option value="name">{t('sort_name')}</option>
                </select>
                <FiChevronDown size={12} className="select-icon" />
              </div>
              <button 
                className="icon-btn-micro" 
                onClick={toggleSortOrder}
                title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                aria-label={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                style={{ height: '24px', width: '24px', color: 'var(--text-2)' }}
              >
                {filters.sortOrder === 'asc' ? <FiArrowUp size={14} /> : <FiArrowDown size={14} />}
              </button>
            </div>
          </div>
        </div>

        <div className="toolbar__group toolbar__group--refresh" style={{ background: 'var(--surface-2)', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <button 
            className="btn btn--ghost btn--sm" 
            onClick={onRefreshAll} 
            disabled={refreshingAll || !hasServices} 
            aria-label={t('refresh_all', 'Refresh all services')}
            style={{ border: 'none', background: 'transparent', padding: '0 6px' }}
          >
            {refreshingAll ? <Loader size={13} /> : <FiRefreshCw size={13} />}
            <span className="hide-xs" style={{ marginLeft: '4px' }}>{t('refresh')}</span>
          </button>
          <SessionIndicator />
        </div>
      </div>
    </div>
  );
}
