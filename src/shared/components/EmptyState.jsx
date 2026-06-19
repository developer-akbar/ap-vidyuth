import '../styles/empty-state.css';

/**
 * Empty State Component
 * 
 * Displays a meaningful message when no data is available,
 * with optional CTA to help user proceed.
 * 
 * Usage:
 * {services.length === 0 ? (
 *   <EmptyState
 *     icon="⚡"
 *     title="No services yet"
 *     message="Add your first service to get started"
 *     cta={{ label: 'Add Service', onClick: handleAdd }}
 *   />
 * ) : (
 *   <ServicesList />
 * )}
 */
export function EmptyState({
  icon,
  title,
  message,
  cta,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      {icon && <div className="empty-state__icon">{icon}</div>}
      {!compact && <h3 className="empty-state__title">{title}</h3>}
      <p className="empty-state__message">{message}</p>
      
      {cta && (
        <button 
          className="empty-state__button"
          onClick={cta.onClick}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
