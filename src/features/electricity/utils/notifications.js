import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db } from '../../../shared/db/storage';
import { saveNotificationToHistory } from '../components/NotificationInbox.jsx';

const getApiBase = () => {
  const env = import.meta.env?.VITE_API_URL;
  if (env && !env.includes('127.0.0.1:5173') && !env.includes('localhost:5173')) {
    return env.replace(/\/$/, '');
  }
  return '/api';
};

let listenersRegistered = false;

export async function setupPushNotifications() {
  if (Capacitor.getPlatform() === 'web') return;

  try {
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive !== 'granted') {
      const requestStatus = await PushNotifications.requestPermissions();
      if (requestStatus.receive !== 'granted') return;
    }

    if (listenersRegistered) return;
    listenersRegistered = true;

    // 1. Token Registration
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[push] registration success:', token.value);
      await syncPushTokenWithServer(token.value);
    });

    // 2. Incoming while App is OPEN
    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[push] received (foreground):', notification);

      const payload = {
        title: notification.title || 'Bill Update',
        body: notification.body || '',
        serviceNumber: notification.data?.serviceNumber,
        type: notification.data?.type || 'BILL_REMINDER',
        read: false
      };

      await saveNotificationToHistory(payload);

      // Trigger UI refresh for badge and inbox
      if (typeof window !== 'undefined' && window.updateUnread) {
        window.updateUnread();
      }

      // Dispatch for child components
      window.dispatchEvent(new CustomEvent('notification-received', { detail: payload }));
    });

    // 3. User TAPS notification (Background or Cold Start)
    await PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      console.log('[push] action performed:', action);
      const notification = action.notification;

      const payload = {
        title: notification.title || 'Bill Update',
        body: notification.body || '',
        serviceNumber: notification.data?.serviceNumber,
        type: notification.data?.type || 'BILL_REMINDER',
        read: false
      };

      await saveNotificationToHistory(payload);

      // Persist the intent to open this bill so the UI can check it on boot
      if (payload.serviceNumber) {
        await db.setSetting('pending_notification_action', {
          serviceNumber: payload.serviceNumber,
          timestamp: Date.now()
        });
      }

      // Fire events as immediate fallback
      window.dispatchEvent(new CustomEvent('notification-received', { detail: payload }));
      if (payload.serviceNumber) {
        window.dispatchEvent(new CustomEvent('notification-deep-link', { 
          detail: { serviceNumber: payload.serviceNumber } 
        }));
      }
    });

    // Register with FCM
    await PushNotifications.register();

    // 4. BOOT SYNC: Catch any notifications that were delivered while app was closed
    // but the user opened the app directly (without tapping a notification).
    setTimeout(async () => {
      try {
        const delivered = await PushNotifications.getDeliveredNotifications();
        if (delivered.notifications?.length > 0) {
          console.log('[push] Syncing delivered notifications on boot:', delivered.notifications.length);
          
          for (const notif of delivered.notifications) {
            const payload = {
              id: notif.id,
              title: notif.title || 'Bill Update',
              body: notif.body || '',
              serviceNumber: notif.data?.serviceNumber,
              type: notif.data?.type || 'BILL_REMINDER',
              read: false,
              timestamp: new Date().toISOString()
            };
            await saveNotificationToHistory(payload);
          }

          // Clear processed notifications from the system tray
          await PushNotifications.removeAllDeliveredNotifications();

          // Refresh UI - Retry 3 times with increasing delay to ensure Dashboard is ready
          const refresh = () => {
            if (typeof window !== 'undefined' && window.updateUnread) {
              window.updateUnread();
              return true;
            }
            return false;
          };

          if (!refresh()) {
            setTimeout(refresh, 1000);
            setTimeout(refresh, 3000);
          }
        }
      } catch (e) {
        console.warn('[push] Boot sync failed', e);
      }
    }, 1000); // 1s delay to ensure DB and window.updateUnread are ready

  } catch (err) {
    console.error('[push] setup error:', err);
  }
}

/**
 * Syncs the device token and service numbers with the backend.
 * @param {string} [token] - Optional token if just received from registration
 * @param {boolean} [force] - If true, ignores the local cache and forces a sync
 */
export async function syncPushTokenWithServer(token, force = false) {
  try {
    const services = await db.getAll();
    const serviceNumbers = services.map(s => s.serviceNumber);
    
    if (token) {
      await db.setSetting('push_token', token);
    }
    
    const storedToken = token || await db.getSetting('push_token');
    
    if (!storedToken) {
      if (Capacitor.getPlatform() === 'web') return false;
      throw new Error('Device not yet registered for push notifications. Please wait a moment and try again.');
    }

    const currentState = JSON.stringify({ token: storedToken, serviceNumbers });
    const lastSynced = await db.getSetting('last_synced_push_state');
    
    if (!force && lastSynced === currentState) {
      console.log('[notifications] Already in sync');
      return true;
    }

    const baseUrl = getApiBase();
    // Use URL constructor for safety if it's a full URL, otherwise fallback to string concat
    let url;
    if (baseUrl.startsWith('http')) {
      url = `${baseUrl.replace(/\/api$/, '')}/api/notifications/register`;
    } else {
      url = '/api/notifications/register';
    }
    
    console.log('[notifications] Syncing to:', url);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: storedToken,
        serviceNumbers,
        platform: Capacitor.getPlatform()
      }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Server returned ${res.status}: ${errorText || 'Unknown error'}`);
    }

    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error || 'Server rejected registration');
    }

    await db.setSetting('last_synced_push_state', currentState);
    console.log('[notifications] Sync successful');
    return true;
  } catch (err) {
    console.error('[notifications] Sync error:', err.message);
    throw err; // Re-throw so the UI can show the specific error
  }
}
