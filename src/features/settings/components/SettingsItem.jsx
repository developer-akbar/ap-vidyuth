import React from 'react';
import { FiChevronRight } from 'react-icons/fi';

export function SettingsItem({ icon: Icon, label, description, onClick, color = 'var(--primary)' }) {
  return (
    <button className="settings-item" onClick={onClick}>
      <div className="settings-item__icon" style={{ color }}>
        <Icon size={20} />
      </div>
      <div className="settings-item__content">
        <span className="settings-item__label">{label}</span>
        {description && <span className="settings-item__description">{description}</span>}
      </div>
      <FiChevronRight className="settings-item__chevron" size={18} />
      
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
        .settings-item:active {
          background: var(--surface-3);
        }
        .settings-item__icon {
          width: 40px;
          height: 40px;
          background: var(--bg-1);
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
