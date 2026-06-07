import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiClock, FiAlertTriangle, FiCheckCircle, FiChevronDown, FiChevronUp, FiLayers, FiShuffle, FiArrowLeft } from 'react-icons/fi';
import { migrateServicePrefix, getMigrationHistory } from '../utils/migration.js';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog.jsx';
import { Loader } from '../../../shared/components/Loader.jsx';
import toast from 'react-hot-toast';

export function PrefixMigration({ onBack }) {
  const { t } = useTranslation();
  const [oldPrefix, setOldPrefix] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  // Handle Esc and Back button
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (confirmOpen) setConfirmOpen(false);
        else onBack();
      }
    };
    const handleBack = (e) => {
      if (e.detail?.handled) return;
      if (confirmOpen) {
        setConfirmOpen(false);
        if (e.detail) e.detail.handled = true;
      } else {
        onBack();
        if (e.detail) e.detail.handled = true;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('app-back-button', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('app-back-button', handleBack);
    };
  }, [onBack, confirmOpen]);

  const loadHistory = async () => {
    const data = await getMigrationHistory();
    setHistory(data);
  };

  const handleMigrateClick = () => {
    setError(null);
    if (oldPrefix.length !== 5 || newPrefix.length !== 5) {
      setError(t('invalid_prefix'));
      return;
    }
    setConfirmOpen(true);
  };

  const proceedWithMigration = async () => {
    setConfirmOpen(false);
    setIsMigrating(true);
    setError(null);
    setStatus({ key: 'finding_services' });

    try {
      const count = await migrateServicePrefix(oldPrefix, newPrefix, (key, params) => {
        setStatus({ key, params });
      });

      if (count > 0) {
        toast.success(t('migration_completed', { count }));
        setOldPrefix('');
        setNewPrefix('');
        loadHistory();
      } else {
        setError(t('no_matching_services', { prefix: oldPrefix }));
      }
    } catch (err) {
      console.error('[migration] Error:', err);
      if (err.message.startsWith('validation_failed|')) {
        const number = err.message.split('|')[1];
        setError(t('migration_failed_invalid', { number }));
      } else {
        setError(err.message || 'Migration failed');
      }
    } finally {
      setIsMigrating(false);
      setStatus(null);
    }
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page__header page__header--sticky">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="icon-btn" onClick={onBack} aria-label="Back"><FiArrowLeft size={20} /></button>
          <div>
            <h2 className="page__title">{t('prefix_migration')}</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-3)' }}>Batch update service numbers</p>
          </div>
        </div>
      </header>

      <div style={{ flex: 1 }}>
        <div className="scard" style={{ padding: '16px' }}>
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="settings-item__icon" style={{ color: 'var(--primary)', flexShrink: 0 }}>
              <FiLayers size={22} />
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.5', margin: 0 }}>
              Batch update service numbers if your region's prefix has changed.
            </p>
          </div>

          {status && (
            <div className="scard" style={{ padding: '12px', background: 'var(--primary-dim)', border: '1px solid var(--primary-hi)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Loader size={16} />
              <span style={{ fontSize: '12px', color: 'var(--text-1)', fontWeight: '600' }}>
                {t(`status_${status.key}`, status.params)}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="field__label">{t('old_prefix')}</label>
              <input 
                type="text" 
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                className="field__input" 
                placeholder="e.g. 12345"
                value={oldPrefix}
                onChange={e => {
                  setOldPrefix(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
              />
            </div>
            <div className="field">
              <label className="field__label">{t('new_prefix')}</label>
              <input 
                type="text" 
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                className="field__input" 
                placeholder="e.g. 54321"
                value={newPrefix}
                onChange={e => {
                  setNewPrefix(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
              />
            </div>
          </div>

          <button 
            className="btn btn--primary" 
            style={{ width: '100%', marginTop: '8px', justifyContent: 'center', gap: '8px', height: '48px' }}
            onClick={handleMigrateClick}
            disabled={isMigrating || oldPrefix.length < 5 || newPrefix.length < 5}
          >
            {isMigrating ? <Loader size={18} /> : <FiShuffle size={18} />}
            {isMigrating ? t('migration_in_progress') : t('migrate_now')}
          </button>

          {error && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <FiAlertTriangle size={16} color="var(--red)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <p style={{ fontSize: '12px', color: 'var(--red)', margin: 0, fontWeight: '600', lineHeight: '1.4' }}>
                {error}
              </p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <button 
              className="btn btn--ghost" 
              style={{ width: '100%', justifyContent: 'space-between', padding: '12px', color: 'var(--text-2)' }}
              onClick={() => setShowHistory(!showHistory)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600' }}>
                <FiClock size={16} /> {t('migration_history')}
              </span>
              {showHistory ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
            </button>

            {showHistory && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {history.map(item => (
                  <div key={item.id} className="scard" style={{ padding: '16px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-hi)' }}>
                        {t('migration_desc', { old: item.oldPrefix, new: item.newPrefix })}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                        {new Date(item.date).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FiCheckCircle size={14} color="var(--green)" />
                      <span style={{ fontSize: '13px', color: 'var(--text-1)', fontWeight: '600' }}>
                        {item.count} services updated
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('prefix_migration')}
        description={t('migration_warning')}
        confirmText={t('migrate')}
        onConfirm={proceedWithMigration}
        onClose={() => setConfirmOpen(false)}
        isDanger={true}
      />
    </div>
  );
}
