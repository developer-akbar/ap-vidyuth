import { Component } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { logError } from '../utils/errorHandling.js';
import '../styles/error-boundary.css';

/**
 * Error Boundary Component
 * 
 * Catches React render errors and displays a graceful error UI
 * instead of crashing the entire app.
 * 
 * Usage:
 * <ErrorBoundary context="ElectricityDashboard" fallback={<ErrorPage />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const { context = '[ErrorBoundary]', onError } = this.props;
    
    logError(context, 'React component error', error, {
      componentStack: errorInfo.componentStack,
    });

    onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, context = 'Component' } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <FiAlertTriangle className="error-boundary__icon" size={48} />
            <h2 className="error-boundary__title">Something went wrong</h2>
            <p className="error-boundary__message">
              {error?.message || 'An unexpected error occurred'}
            </p>
            
            <div className="error-boundary__actions">
              <button
                className="error-boundary__button error-boundary__button--primary"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
              <button
                className="error-boundary__button error-boundary__button--secondary"
                onClick={() => window.location.href = '/'}
              >
                Go Home
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details className="error-boundary__details">
                <summary>Technical Details (Development Only)</summary>
                <pre className="error-boundary__stack">
                  {error?.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
