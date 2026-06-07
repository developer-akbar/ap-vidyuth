import React from 'react';

/**
 * Global Loader component with a standard multi-color spinning animation.
 * Used across the app for loading states, refreshes, and processing overlays.
 */
export function Loader({ size = 24, className = '', style = {} }) {
  return (
    <div className={`loader-container ${className}`} style={style}>
      <svg
        className="loader-spinner"
        viewBox="0 0 50 50"
        style={{ width: size, height: size }}
      >
        <circle
          className="loader-path"
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth="5"
        ></circle>
      </svg>
      <style>{`
        .loader-spinner {
          animation: rotate 2s linear infinite;
        }
        .loader-path {
          stroke: var(--primary);
          stroke-linecap: round;
          animation: dash 1.5s ease-in-out infinite, colors 6s ease-in-out infinite;
        }
        @keyframes rotate {
          100% { transform: rotate(360deg); }
        }
        @keyframes dash {
          0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
          50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
          100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
        }
        @keyframes colors {
          0% { stroke: #4285F4; }
          25% { stroke: #DE3E35; }
          50% { stroke: #F7C223; }
          75% { stroke: #1B9A59; }
          100% { stroke: #4285F4; }
        }
      `}</style>
    </div>
  );
}
