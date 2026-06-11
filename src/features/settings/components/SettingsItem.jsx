import React from 'react';
import { FiChevronRight } from 'react-icons/fi';

export function SettingsItem({ icon: Icon, label, description, onClick, color = 'var(--primary)' }) {
  return (
    <button className="settings-item settings-item--v2" onClick={onClick}>
      <div className="settings-item__icon-wrap--v2" style={{ color }}>
        <Icon size={20} />
      </div>
      <div className="settings-item__content">
        <span className="settings-item__label">{label}</span>
        {description && <span className="settings-item__description">{description}</span>}
      </div>
      <FiChevronRight className="settings-item__chevron--v2" size={18} />
    </button>
  );
}
