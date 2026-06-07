import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';
import { apiBase } from '../api/servicesApi.js';

function CaptchaModal({ serviceNumber, initialSessionData, resolve, cleanup }) {
  const [sessionData, setSessionData] = useState(initialSessionData);
  const [captcha, setCaptcha] = useState('');
  const [validating, setValidating] = useState(false);

  // Prevent scrolling when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!captcha || captcha.length !== 6) {
      toast.error('Enter valid 6-digit captcha');
      return;
    }
    
    const finalSession = {
      ...sessionData,
      captcha,
      timestamp: Date.now()
    };
    
    setValidating(true);
    const validateToast = toast.loading('Validating captcha...');
    try {
      const res = await fetch(`${apiBase()}/billdesk/validate-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceNumber, billdeskSession: finalSession })
      });
      const json = await res.json();
      
      if (!json.ok) {
        toast.error(`Validation failed: ${json.error || 'Unknown error'}`, { id: validateToast });
        setCaptcha('');
        
        // Fetch new session because captcha is single-use
        try {
          const initRes = await fetch(`${apiBase()}/billdesk/init-session`);
          const initJson = await initRes.json();
          if (initJson.ok) setSessionData(initJson);
        } catch (e) {
          toast.error(`Failed to get new captcha image: ${e?.message || 'Unknown'}`);
        }
        
        setValidating(false);
        return;
      }
      toast.success('Validation successful', { id: validateToast });
    } catch (err) {
      toast.error(`Network error during validation: ${err?.message || 'Unknown'}`, { id: validateToast });
      setValidating(false);
      return;
    }
    
    // Store in localStorage for 1 hour
    localStorage.setItem('billdesk_session', JSON.stringify(finalSession));
    
    resolve(finalSession);
    cleanup();
  };

  const handleCancel = () => {
    resolve(null); // Resolving null cancels the refresh action
    cleanup();
  };

  return (
    <div className="overlay overlay--center" onClick={e => e.target === e.currentTarget && !validating && handleCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" style={{ width: '320px' }}>
        <h2 className="dialog__title">Manual Authentication</h2>
        <p className="dialog__desc" style={{ marginBottom: '16px' }}>
          Our automated solver needs help. Please solve this Captcha to fetch fresh billing data.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px', textAlign: 'center', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src={`${apiBase()}/billdesk/captcha-image?cookie=${encodeURIComponent(sessionData.cookie)}`} 
                alt="Captcha" 
                style={{ mixBlendMode: 'darken', maxWidth: '100%' }}
                onError={(e) => { e.target.style.display = 'none'; toast.error('Failed to load image'); }}
              />
            </div>
            
            <div className="field">
              <label htmlFor="captcha" className="field__label">Captcha Code</label>
              <input
                id="captcha"
                type="text"
                className="field__input"
                value={captcha}
                onChange={e => setCaptcha(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter numbers"
                autoComplete="off"
                autoFocus
                disabled={validating}
              />
            </div>
          </div>
          
          <div className="dialog__footer" style={{ marginTop: '24px' }}>
            <button type="button" className="btn btn--ghost" onClick={handleCancel} disabled={validating}>Cancel</button>
            <button type="submit" className={`btn btn--primary ${validating ? 'btn--loading' : ''}`} disabled={validating}>
              {validating ? 'Verifying...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export async function getValidSession(serviceNumber) {
  if (!serviceNumber) throw new Error('serviceNumber is required for session validation');

  // 1. Check local storage
  const stored = localStorage.getItem('billdesk_session');
  if (stored) {
    try {
      const session = JSON.parse(stored);
      // Check if valid for 1 hour (3600000 ms)
      if (Date.now() - session.timestamp < 3600000) {
        return session;
      }
    } catch (e) {
      // ignore parse error
    }
  }

  // 2. Try automatic OCR solver
  const loadToast = toast.loading('Connecting and solving Captcha automatically...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    const warningId = setTimeout(() => toast.loading('Taking longer than usual...', { id: loadToast }), 8000); // 8s warning
    
    const res = await fetch(`${apiBase()}/billdesk/auto-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceNumber }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    clearTimeout(warningId);
    
    const contentType = res.headers.get('content-type');
    if (!res.ok || !contentType || !contentType.includes('application/json')) {
      throw new Error(res.status === 504 ? 'Timeout from server' : 'Server error');
    }
    
    const json = await res.json();
    
    if (json.ok) {
      toast.success('Captcha solved automatically', { id: loadToast });
      localStorage.setItem('billdesk_session', JSON.stringify(json.session));
      window.dispatchEvent(new Event('storage'));
      return json.session;
    }
    
    // If auto failed, dismiss toast and move to fallback
    toast.error(`Auto-solver failed: ${json.error || 'Unknown reason'}`, { id: loadToast });
  } catch (err) {
    const isTimeout = err.name === 'AbortError' || err.message.includes('Timeout');
    toast.error(isTimeout ? 'Auto-solver timed out. Please enter manually.' : `Network error during auto-session: ${err.message}`, { id: loadToast });
  }

  // 3. Fallback to Manual Modal
  // Fetch fresh session for the manual modal
  const initToast = toast.loading('Loading manual captcha...');
  let sessionData;
  try {
    const res = await fetch(`${apiBase()}/billdesk/init-session`);
    const json = await res.json();
    toast.dismiss(initToast);
    if (!json.ok) throw new Error(json.error);
    sessionData = json;
  } catch (err) {
    toast.dismiss(initToast);
    toast.error(`Failed to initialize manual BillDesk session: ${err.message}`);
    return null;
  }

  // Present Modal and wait for user
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };

    root.render(
      <CaptchaModal 
        serviceNumber={serviceNumber}
        initialSessionData={sessionData} 
        resolve={resolve} 
        cleanup={cleanup} 
      />
    );
  });
}