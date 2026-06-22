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

  const toggleSortOrder = () => {
    const nextOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
    onFiltersChange({ ...filters, sortOrder: nextOrder });
  };

  return (
    <div className="flex flex-col gap-3 mb-4">
      {/* ── Top Row: Search, Language, Add ── */}
      <div className="flex justify-between items-center gap-3 w-full">
        {/* Search */}
        <div className="flex-1 flex items-center bg-surface-container-low px-3 py-1.5 rounded-xl border border-border-subtle group">
          <span className="material-symbols-outlined text-text-muted text-[20px] mr-2">search</span>
          <input
            value={localQuery}
            onChange={e => setLocalQuery(e.target.value)}
            placeholder={t('search_services')}
            className="bg-transparent border-none focus:ring-0 text-body-base placeholder:text-text-muted w-full outline-none text-[13px] p-0"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <button 
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-card border border-border-medium rounded-xl text-xs font-body-bold hover:bg-surface-container-low transition-all cursor-pointer text-text-secondary disabled:opacity-50"
            onClick={toggleLanguage} 
            title={t('language')} 
            aria-label={t('language')}
            disabled={refreshingAll}
          >
            <span className="material-symbols-outlined text-[18px]">language</span>
            <span>{isTelugu ? 'English' : 'తెలుగు'}</span>
          </button>

          {/* Add Service */}
          <button 
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white hover:bg-primary-hi active:scale-[0.97] transition-all rounded-xl font-body-bold text-xs shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50"
            onClick={onAdd} 
            disabled={refreshingAll} 
            aria-label={t('add_service')}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>{t('add')}</span>
          </button>
        </div>
      </div>

      {/* ── Bottom Row: Segment controls, sort/filter, refresh ── */}
      <div className="flex flex-wrap gap-2.5 justify-between items-center w-full">
        <div className="flex items-center flex-wrap gap-2">
          {/* Active / Trash Toggle */}
          <div className="flex bg-surface-container rounded-full p-0.5 border border-border-medium">
            <button 
              className={`px-3 py-1 text-[11px] font-label-caps rounded-full transition-all duration-150 cursor-pointer ${
                activeView === 'active' 
                  ? 'bg-white shadow-sm text-primary font-bold' 
                  : 'text-text-muted hover:text-on-surface'
              }`}
              onClick={() => onViewChange('active')}
              aria-label={t('view_active_services', 'View active services')}
            >
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">bolt</span>
                {t('active')}
              </span>
            </button>
            <button 
              className={`px-3 py-1 text-[11px] font-label-caps rounded-full transition-all duration-150 cursor-pointer ${
                activeView === 'trash' 
                  ? 'bg-white shadow-sm text-primary font-bold' 
                  : 'text-text-muted hover:text-on-surface'
              }`}
              onClick={() => onViewChange('trash')}
              aria-label={t('view_trash', 'View trash')}
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">delete</span>
                {trashCount > 0 && <span className="px-1.5 py-0.2 bg-red-dim text-red text-[9px] font-black rounded-full">{trashCount}</span>}
              </span>
            </button>
          </div>

          {/* View Style Switcher */}
          <button 
            className="flex items-center gap-1 px-3 py-1.5 bg-surface-card border border-border-medium rounded-xl text-xs font-body-bold hover:bg-surface-container-low transition-all cursor-pointer text-text-secondary"
            onClick={onToggleCardStyle} 
            title={cardStyle === 'classic' ? 'Switch to Quick Glance' : 'Switch to Classic'}
            aria-label={cardStyle === 'classic' ? 'Switch to Quick Glance' : 'Switch to Classic'}
          >
            <span className="text-[11px]">View Style</span>
            <span className="material-symbols-outlined text-[18px] text-text-muted ml-0.5">
              {cardStyle === 'classic' ? 'grid_view' : 'table_rows'}
            </span>
          </button>

          {/* Filters Selects */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center bg-surface-card border border-border-medium rounded-xl px-2.5 py-1">
              <select 
                className="bg-transparent border-none outline-none text-xs font-body-bold text-text-secondary pr-4 cursor-pointer focus:ring-0 focus:border-none appearance-none" 
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
              <span className="material-symbols-outlined text-[16px] text-text-muted absolute right-1 pointer-events-none">expand_more</span>
            </div>

            <div className="flex items-center bg-surface-card border border-border-medium rounded-xl">
              <div className="relative flex items-center px-2.5 py-1">
                <select 
                  className="bg-transparent border-none outline-none text-xs font-body-bold text-text-secondary pr-4 cursor-pointer focus:ring-0 focus:border-none appearance-none" 
                  value={filters.sort} 
                  onChange={e => onFiltersChange({ ...filters, sort: e.target.value })}
                  aria-label={t('sort_by', 'Sort by')}
                >
                  <option value="amount">{t('sort_amount')}</option>
                  <option value="dueDate">{t('sort_due_date')}</option>
                  <option value="name">{t('sort_name')}</option>
                </select>
                <span className="material-symbols-outlined text-[16px] text-text-muted absolute right-1 pointer-events-none">expand_more</span>
              </div>
              <div className="w-[1px] h-4 bg-border-medium" />
              <button 
                className="p-1 hover:bg-surface-container-low rounded-r-xl transition-all cursor-pointer text-text-secondary" 
                onClick={toggleSortOrder}
                title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                aria-label={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {filters.sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Refresh All */}
        <div className="flex items-center gap-1.5 bg-surface-container-low px-2 py-1 rounded-xl border border-border-subtle ml-auto">
          <button 
            className="flex items-center gap-1 px-2.5 py-1 bg-surface-card hover:bg-surface-container-low transition-colors border border-border-medium rounded-lg text-xs font-body-bold text-text-secondary cursor-pointer disabled:opacity-50"
            onClick={(e) => {
              if (isOffline) {
                toast('You are offline. Reconnect to refresh.', { icon: <span className="material-symbols-outlined text-amber text-[16px]">wifi_off</span> });
                return;
              }
              onRefreshAll(e);
            }} 
            disabled={refreshingAll || !hasServices || isOffline} 
            aria-label={t('refresh_all', 'Refresh all services')}
            title={isOffline ? 'Offline' : ''}
          >
            {refreshingAll ? (
              <Loader size={12} />
            ) : (
              <span className="material-symbols-outlined text-[16px]">
                {isOffline ? 'wifi_off' : 'sync'}
              </span>
            )}
            <span>{t('refresh')}</span>
          </button>
          <SessionIndicator />
        </div>
      </div>
    </div>
  );
}
