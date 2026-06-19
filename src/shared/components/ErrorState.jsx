import { FiAlertTriangle } from 'react-icons/fi';
import '../styles/error-state.css';

/**
 * Error State Component
 * 
 * Displays a user-friendly error message with retry button
 * for when data fetching fails.
 * 
 * Usage:
 * {error ? (
 *   <ErrorState
 *     message="Unable to load your bills"
 *     onRetry={handleRetry}
 *   />
 * ) : (
 *   <BillsList />
 * )}
 */
export function ErrorState({
  message = 'Unable to load this data',
  onRetry,
  icon: Icon = FiAlertTriangle,
  title = 'Error',
  compact = false,
}) {
  return (
    <div className={`error-state ${compact ? 'error-state--compact' : ''}`}>
      <Icon className="error-state__icon" size={compact ? 32 : 48} />
      {!compact && <h3 className="error-state__title">{title}</h3>}
      <p className="error-state__message">{message}</p>
      
      {onRetry && (
        <button className="error-state__button" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorState;
