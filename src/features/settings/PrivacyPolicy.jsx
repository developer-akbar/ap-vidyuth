import { FiArrowLeft } from 'react-icons/fi';

export function PrivacyPolicy({ onBack }) {
  return (
    <div className="page page--scrolled" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page__header page__header--sticky">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="icon-btn" onClick={onBack}>
            <FiArrowLeft size={20} style={{ color: 'var(--text-1)' }} />
          </button>
          <h1 className="page__title" style={{ margin: 0 }}>Privacy Policy</h1>
        </div>
      </header>
      
      <div style={{ flex: 1, paddingBottom: '40px' }}>
        <div className="scard" style={{ padding: '24px', lineHeight: '1.7', color: 'var(--text-2)' }}>
          <p className="meta" style={{ color: 'var(--text-3)', fontSize: '13px', marginBottom: '24px' }}>
            <strong>Last updated:</strong> June 2026 • <strong>App:</strong> AP Vidyuth (com.akbar.apvidyuth)
          </p>

          <div style={{ background: 'var(--surface-3)', borderLeft: '4px solid var(--primary)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
            <strong style={{ color: 'var(--primary)' }}>Summary:</strong> AP Vidyuth does not collect, store, or share any personal data on external servers. All your bill data stays on your device.
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>1. What Data We Collect</h2>
          <p>AP Vidyuth does <strong>not</strong> collect personally identifiable information. The following data is stored <strong>locally on your device only</strong>:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li>APSPDCL service numbers you add (stored in SQLite on Android / IndexedDB in browser)</li>
            <li>Bill history and payment records fetched from APSPDCL public APIs on your behalf</li>
            <li>App preferences — theme (dark/light) and language (English/Telugu)</li>
            <li>Temporary BillDesk session tokens (held in device memory, never sent to our servers)</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>2. Third-Party Services</h2>
          <p>The app communicates with these external services to fetch your bill data:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li><strong>APSPDCL:</strong> public API to fetch electricity bill and payment history</li>
            <li><strong>BillDesk:</strong> to fetch current bill demand amount</li>
            <li><strong>Vercel:</strong> our processing API server. Handles requests to APSPDCL/BillDesk on your behalf. Does not store user data.</li>
            <li><strong>Firebase Cloud Messaging:</strong> for optional bill due-date notifications</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>3. Notifications</h2>
          <p>If you grant notification permission, the app schedules local and push notifications for bill due-date reminders. Your device notification token is stored only in association with your bill data and is not used for advertising or shared with third parties.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>4. Analytics</h2>
          <p>The web version may collect anonymous, non-personal usage analytics (page views, feature usage counts) via Vercel Analytics. No personal data or device identifiers are included. The Android app does not include analytics SDKs.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>5. Data Deletion</h2>
          <p>All data is stored locally. To delete it:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li>Remove individual services using the <strong>Trash</strong> feature in the app</li>
            <li>Uninstall the app (permanently deletes all local data)</li>
            <li>Clear app storage in your device Settings → Apps → AP Vidyuth → Storage</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>6. Security</h2>
          <p>All communication between the app and external services uses HTTPS encryption. No cleartext HTTP traffic is permitted.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>7. Contact Us</h2>
          <p>For any privacy-related questions, contact: <a href="mailto:mail.akbarmulla@gmail.com" style={{ color: 'var(--primary)' }}>mail.akbarmulla@gmail.com</a></p>

          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic' }}>
            <p><strong>Disclaimer:</strong> AP Vidyuth is an independent, unofficial application. It is not affiliated with, authorized by, or endorsed by APSPDCL, BillDesk, or any government entity. All product and company names are trademarks™ or registered® trademarks of their respective holders.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
