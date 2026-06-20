import { createPool } from '@vercel/postgres';

/**
 * Initializes/Migrates Postgres database tables.
 */
export async function initDb() {
  if (!process.env.POSTGRES_URL) {
    console.warn('[db] POSTGRES_URL environment variable is missing. Database functions will be bypassed.');
    return null;
  }

  const pool = createPool();

  try {
    const client = await pool.connect();
    console.log('[db] Connected to Postgres. Starting schema migrations...');

    // Enable UUID extension if not already present
    await client.sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;

    // 1. Create users table
    await client.sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        device_id VARCHAR(255),
        role VARCHAR(20) DEFAULT 'STANDARD',
        pro_source VARCHAR(50),
        profile_completed BOOLEAN DEFAULT FALSE,
        registered_at TIMESTAMP,
        pro_granted_at TIMESTAMP,
        last_seen_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        heard_from VARCHAR(255),
        pro_request_status VARCHAR(20) DEFAULT 'NONE',
        pro_requested_at TIMESTAMP,
        pro_request_message TEXT
      );
    `;

    // 2. Create notifications table
    await client.sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // 3. Create stub tables for future features (WhatsApp, Push, Reminders)
    await client.sql`
      CREATE TABLE IF NOT EXISTS subscriptions_future (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        plan_name VARCHAR(50),
        status VARCHAR(20),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await client.sql`
      CREATE TABLE IF NOT EXISTS whatsapp_settings_future (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        phone_number VARCHAR(20),
        enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await client.sql`
      CREATE TABLE IF NOT EXISTS bill_alerts_future (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        service_number VARCHAR(20),
        alert_threshold NUMERIC,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await client.sql`
      CREATE TABLE IF NOT EXISTS payment_reminders_future (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        service_number VARCHAR(20),
        remind_before_days INTEGER DEFAULT 3,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    console.log('[db] Postgres schema check and migrations completed successfully.');
    client.release();
    return pool;
  } catch (err) {
    console.error('[db] Migrations script encountered error:', err.message);
    throw err;
  }
}
