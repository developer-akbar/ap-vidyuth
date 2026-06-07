import { useState, useEffect } from 'react';
import { FiInfo, FiZap, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const TIPS = [
  "Unplug electronics when not in use. Standby power can account for up to 10% of your bill.",
  "Set your AC to 24°C instead of 18°C to save up to 24% on cooling costs.",
  "Clean your AC filters monthly to improve efficiency and reduce power draw.",
  "Use LED bulbs instead of incandescent. They use 75% less energy and last much longer.",
  "Run full loads in your washing machine to maximize energy and water efficiency.",
  "Defrost your refrigerator regularly. Ice buildup forces the motor to work harder.",
  "Use natural light during the day. Keep curtains open to save on lighting costs.",
  "Keep your fridge coils clean and ensure it's not placed directly in sunlight.",
  "Turn off the fan when leaving a room. Fans cool people, not empty rooms.",
  "Use a microwave or air fryer instead of a conventional oven for small meals."
];

export function DailyTip() {
  const { t } = useTranslation();
  const [tip, setTip] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Pick a tip based on the day of the year so it changes daily
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    setTip(TIPS[dayOfYear % TIPS.length]);
    
    // Check if dismissed today
    const lastDismissed = localStorage.getItem('daily_tip_dismissed');
    if (lastDismissed === new Date().toDateString()) {
      setDismissed(true);
    }
  }, []);

  if (dismissed || !tip) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('daily_tip_dismissed', new Date().toDateString());
  };

  return (
    <div className="scard" style={{ marginBottom: '8px', padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--primary-dim)', display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center' }}>
      <div style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FiZap size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <h4 style={{ fontSize: '12px', margin: '0 0 2px', color: 'var(--primary)' }}>Daily Saving Tip</h4>
        <p style={{ fontSize: '11px', margin: 0, color: 'var(--text-2)', lineHeight: 1.4 }}>{tip}</p>
      </div>
      <button onClick={handleDismiss} className="icon-btn-micro" style={{ color: 'var(--text-3)' }}>
        <FiX size={14} />
      </button>
    </div>
  );
}
