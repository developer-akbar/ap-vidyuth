import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FiLink, FiXCircle } from 'react-icons/fi';

export function SessionIndicator() {
  const [sessionActive, setSessionActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const checkSession = () => {
    const stored = localStorage.getItem('billdesk_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        // Valid for 1 hour
        const expiresAt = session.timestamp + 3600000;
        const remaining = expiresAt - Date.now();
        if (remaining > 0) {
          setSessionActive(true);
          const mins = Math.floor(remaining / 60000);
          setTimeLeft(`${mins}m left`);
          return;
        }
      } catch (e) {
        // ignore parse error
      }
    }
    setSessionActive(false);
    setTimeLeft('');
  };

  useEffect(() => {
    checkSession();
    // Check every minute
    const interval = setInterval(checkSession, 60000);
    // Also listen for storage changes from other tabs if applicable
    window.addEventListener('storage', checkSession);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkSession);
    };
  }, []);

  const killSession = () => {
    localStorage.removeItem('billdesk_session');
    checkSession();
    toast.success('Session cleared. Next refresh will create a new one.');
  };

  return (
    <div className="session-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', background: sessionActive ? '#e0f2fe' : 'var(--surface-2)', color: sessionActive ? '#0369a1' : 'var(--text-2)', padding: '4px 10px', borderRadius: '12px', border: sessionActive ? 'none' : '1px solid var(--border)' }}>
      <FiLink size={12} />
      <span>{sessionActive ? `Session Active (${timeLeft})` : 'No Active Session'}</span>
      {sessionActive && (
        <button 
          onClick={killSession} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', color: '#0369a1', marginLeft: '4px' }}
          title="Kill active session"
          aria-label="Kill active session"
        >
          <FiXCircle size={14} />
        </button>
      )}
    </div>
  );
}