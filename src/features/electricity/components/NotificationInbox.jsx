import { useState, useEffect } from 'react';
import { FiBell, FiTrash2, FiCheck, FiX, FiInfo, FiAlertCircle, FiChevronRight, FiCreditCard } from 'react-icons/fi';
import { db } from '../../../shared/db/storage';
import { formatInr, fromNow } from '../../../shared/utils';

export function NotificationInbox({ open, onClose, onAction }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await db.getSetting('notification_history') || [];
      // Sort: unread first, then newest first
      const sorted = [...data].sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      setNotifications(sorted);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    const data = await db.getSetting('notification_history') || [];
    const updated = data.map(n => n.id === id ? { ...n, read: true } : n);
    await db.setSetting('notification_history', updated);
    // Refresh local state to reflect change immediately
    const sorted = [...updated].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    setNotifications(sorted);
    
    // Trigger global UI update (badge)
    if (typeof window !== 'undefined' && window.updateUnread) {
      window.updateUnread();
    }
  };

  const deleteNotification = async (id) => {
    const data = await db.getSetting('notification_history') || [];
    const updated = data.filter(n => n.id !== id);
    await db.setSetting('notification_history', updated);
    setNotifications(updated);

    // Trigger global UI update (badge)
    if (typeof window !== 'undefined' && window.updateUnread) {
      window.updateUnread();
    }
  };

  const clearAll = async () => {
    await db.setSetting('notification_history', []);
    setNotifications([]);

    // Trigger global UI update (badge)
    if (typeof window !== 'undefined' && window.updateUnread) {
      window.updateUnread();
    }
  };

  if (!open) return null;

  return (
    <div className="overlay overlay--center" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="dialog inbox-dialog" onClick={e => e.stopPropagation()}>
        <header className="dialog__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiBell size={18} />
            <h2 className="dialog__title">Notifications</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {notifications.length > 0 && (
              <button className="icon-btn-ghost" onClick={clearAll} title="Clear All">
                <FiTrash2 size={16} />
              </button>
            )}
            <button className="icon-btn-ghost" onClick={onClose}>
              <FiX size={20} />
            </button>
          </div>
        </header>

        <div className="dialog__body" style={{ padding: 0, maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>Loading...</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ marginBottom: '16px', color: 'var(--text-3)' }}>
                <FiBell size={32} style={{ opacity: 0.3 }} />
              </div>
              <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>No notifications yet</p>
            </div>
          ) : (
            <div className="inbox-list">
              {notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`inbox-item ${n.read ? 'inbox-item--read' : 'inbox-item--unread'}`}
                  onClick={() => {
                    markAsRead(n.id);
                    if (onAction) onAction(n);
                  }}
                >
                  <div className="inbox-item__icon">
                    {n.type === 'BILL_OVERDUE' ? <FiAlertCircle color="var(--red)" /> : <FiInfo color="var(--primary)" />}
                  </div>
                  <div className="inbox-item__content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 className="inbox-item__title">{n.title}</h4>
                      <span className="inbox-item__time">{fromNow(n.timestamp)}</span>
                    </div>
                    <p className="inbox-item__body">{n.body}</p>
                    {n.serviceNumber && (
                      <div className="inbox-item__footer">
                        <span className="mono-sm">SN: {n.serviceNumber}</span>
                        <FiChevronRight size={14} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to save a new notification to history
export async function saveNotificationToHistory(notification) {
  try {
    const history = await db.getSetting('notification_history') || [];
    
    // De-duplicate: If a notification with the same body and SN exists, skip.
    // This is more robust than just checking the last item or timestamp.
    const isDuplicate = history.some(n => 
      n.serviceNumber === notification.serviceNumber &&
      n.body === notification.body
    );
      
    if (isDuplicate) {
      console.log('[inbox] Skipping duplicate notification entry');
      return history;
    }

    const newNotif = {
      // Use the provided ID if available (from native tray), otherwise generate unique
      id: notification.id || `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: notification.timestamp || new Date().toISOString(),
      read: false,
      ...notification
    };
    
    // Keep only last 50 notifications
    const updated = [newNotif, ...history].slice(0, 50);
    await db.setSetting('notification_history', updated);
    return updated;
  } catch (err) {
    console.error('[inbox] Failed to save history:', err);
    return [];
  }
}
