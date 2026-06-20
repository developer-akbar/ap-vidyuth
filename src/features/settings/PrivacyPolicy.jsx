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
            <strong style={{ color: 'var(--primary)' }}>Summary:</strong> By default, all AP Vidyuth data is stored locally on your device. If you register a profile, your name, email, credentials, and synchronized bills/readings are securely stored on our cloud servers. Unregistered usage statistics (such as services added) are tracked anonymously via unique device IDs to compile aggregated usage metrics. We never sell or share your data.
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>1. What Data We Collect</h2>
          <p>AP Vidyuth allows completely local, offline tracking by default. However, we collect and store the following data if you use our cloud features:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px', marginBottom: '16px' }}>
            <li><strong>Profile & Accounts:</strong> If you register or log in, we securely store your Name, Email, password hash (hashed using secure PBKDF2), and growth referral responses (e.g. how you heard about us).</li>
            <li><strong>Cloud Synchronization:</strong> For registered users, all added APSPDCL service numbers, custom labels, bill histories, and meter reading logs are backed up and synced to our secure cloud database (PostgreSQL) so they remain accessible across your devices.</li>
            <li><strong>Unregistered User Tracking:</strong> For users who use the app without registering an account, we generate a unique device ID to track the number of services you monitor. This helps us gauge active usage metrics and limit database resource consumption. The device ID and service list are securely stored in our cloud backend, but contain no email, name, or other personally identifying details.</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>2. Third-Party & Cloud Services</h2>
          <p>The app communicates with these external services to fetch bill data and manage subscriptions:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li><strong>APSPDCL:</strong> public API to fetch electricity bill and payment history</li>
            <li><strong>BillDesk:</strong> to fetch current bill demand amount</li>
            <li><strong>Vercel & Vercel Postgres:</strong> Hosts our API server and secure relational database. Stores registered accounts, cloud-sync data, and unregistered device tracking logs.</li>
            <li><strong>Upstash Redis:</strong> Stores whitelisted device ID hashes for high-speed offline access verification.</li>
            <li><strong>Firebase Cloud Messaging:</strong> for optional bill due-date push notifications</li>
            <li><strong>Nodemailer / SMTP:</strong> to deliver subscription validation and activation confirm emails to your inbox</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>3. Notifications</h2>
          <p>If you grant notification permission, the app schedules local and push notifications for bill due-date reminders. Profile-linked inbox notifications are stored on our database. Your details are never shared with advertisers or third parties.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>4. Analytics</h2>
          <p>The web version may collect anonymous, non-personal usage analytics (page views, feature usage counts) via Vercel Analytics. No personal data or device identifiers are included. The Android app does not include analytics SDKs.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>5. Data Deletion</h2>
          <p>Registered users can withdraw their account, delete tracked services, or contact us to request permanent removal of their cloud profiles. For unregistered users, all local data can be cleared by removing services inside the app or uninstalling the application. You can clear the app's cache in Settings → Apps → AP Vidyuth → Storage to wipe local identifiers. To request deletion of profile database records, email us at <a href="mailto:mail.akbarmulla@gmail.com" style={{ color: 'var(--primary)' }}>mail.akbarmulla@gmail.com</a>.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>6. Security</h2>
          <p>All communication between the app, databases, and external servers uses HTTPS/SSL encryption. No cleartext HTTP traffic is permitted.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>7. Contact Us</h2>
          <p>For any privacy-related questions or data deletion requests, contact: <a href="mailto:mail.akbarmulla@gmail.com" style={{ color: 'var(--primary)' }}>mail.akbarmulla@gmail.com</a></p>

          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic' }}>
            <p><strong>Disclaimer:</strong> AP Vidyuth is an independent, unofficial application. It is not affiliated with, authorized by, or endorsed by APSPDCL, BillDesk, or any government entity. All product and company names are trademarks™ or registered® trademarks of their respective holders.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
