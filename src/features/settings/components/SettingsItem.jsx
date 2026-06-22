import React from 'react';

export function SettingsItem({ icon: Icon, materialIcon, label, description, onClick, color = 'var(--primary)' }) {
  return (
    <button className="settings-item" onClick={onClick}>
      <div className="settings-item__icon" style={{ color, backgroundColor: `${color}15` }}>
        {materialIcon ? (
          <span className="material-symbols-outlined text-[20px]">{materialIcon}</span>
        ) : (
          Icon && <Icon size={20} />
        )}
      </div>
      <div className="settings-item__content">
        <span className="settings-item__label">{label}</span>
        {description && <span className="settings-item__description">{description}</span>}
      </div>
      <span className="material-symbols-outlined settings-item__chevron text-[20px]">chevron_right</span>
      
      <style>{`
        .settings-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 16px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border);
          text-align: left;
          gap: 16px;
          transition: background 0.2s ease;
        }
        .settings-item:last-child {
          border-bottom: none;
        }
        .settings-item:hover {
          background: var(--surface-2);
        }
        .settings-item:active {
          background: var(--surface-3);
        }
        .settings-item__icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .settings-item__content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .settings-item__label {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-1);
        }
        .settings-item__description {
          font-size: 12px;
          color: var(--text-3);
          margin-top: 2px;
        }
        .settings-item__chevron {
          color: var(--text-3);
          opacity: 0.5;
        }
      `}</style>
    </button>
  );
}
