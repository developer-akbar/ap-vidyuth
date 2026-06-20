import { createPool } from '@vercel/postgres';

/**
 * Initializes/Migrates Postgres database tables.
 */
export async function initDb() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[db] Neither POSTGRES_URL nor DATABASE_URL environment variable is configured. Database functions will be bypassed.');
    return null;
  }

  if (!process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = connectionString;
  }

  const pool = createPool();

  try {
    const client = await pool.connect();
    console.log('[db] Connected to Postgres. Starting schema migrations...');

    // Enable UUID extension if not already present (catch permission issues on managed instances)
    try {
      await client.sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;
    } catch (e) {
      console.warn('[db] Pre-check or creation of pgcrypto extension bypassed:', e.message);
    }

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

    // Surgical updates for user accounts, settings, and password recovery
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'system';");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS density VARCHAR(20) DEFAULT 'comfortable';");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP;");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_name VARCHAR(50) DEFAULT 'FREE';");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS service_limit INTEGER DEFAULT 4;");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_plan VARCHAR(50);");

    // 1.5 Create user_services table to sync IndexedDB services to cloud
    await client.sql`
      CREATE TABLE IF NOT EXISTS user_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_number VARCHAR(50) NOT NULL,
        label VARCHAR(255),
        customer_name VARCHAR(255),
        last_bill_date TIMESTAMP,
        last_due_date TIMESTAMP,
        last_amount_due NUMERIC,
        last_billed_units NUMERIC,
        last_three_amounts TEXT,
        last_status VARCHAR(50) DEFAULT 'UNKNOWN',
        last_fetched_at TIMESTAMP,
        history_fetched_at TIMESTAMP,
        last_reported_bill_date TIMESTAMP,
        bill_time VARCHAR(20),
        bill_no_prefix VARCHAR(50),
        last_refreshed_date TIMESTAMP,
        last_error TEXT,
        is_paid BOOLEAN DEFAULT FALSE,
        paid_date TIMESTAMP,
        receipt_number VARCHAR(255),
        paid_amount NUMERIC,
        bill_breakup TEXT,
        bill_history TEXT,
        payment_history TEXT,
        trend_data TEXT,
        insights TEXT,
        category VARCHAR(100),
        closing_rdg NUMERIC,
        ctr_load NUMERIC,
        division_code VARCHAR(100),
        division_name VARCHAR(255),
        circle_name VARCHAR(255),
        section_name VARCHAR(255),
        unique_service_number VARCHAR(50),
        pinned BOOLEAN DEFAULT FALSE,
        pinned_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service_number)
      );
    `;

    // 1.6 Create user_readings table to sync IndexedDB manual meter logs to cloud
    await client.sql`
      CREATE TABLE IF NOT EXISTS user_readings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_number VARCHAR(50) NOT NULL,
        reading_date DATE NOT NULL,
        reading_value NUMERIC NOT NULL,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service_number, reading_date)
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
