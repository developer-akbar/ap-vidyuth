/**
 * Storage abstraction layer
 * - Android (Capacitor): uses @capacitor-community/sqlite
 * - Browser / Desktop: uses IndexedDB via idb
 */

import { openDB } from 'idb';

const DB_NAME = 'my-dashboard';
const DB_VERSION = 5;  // bumped: adds billTime
const STORE = 'electricity_services';
const SETTINGS_STORE = 'settings';

let _idb = null;
let _sqlite = null;
let _platform = null; // 'android' | 'browser'

// ── Platform detection ──────────────────────────────────────────────────────

/**
 * Detects if the app is running as a native Android app via Capacitor.
 */
function isAndroid() {
  return (
    typeof window !== 'undefined' &&
    (window.Capacitor?.isNativePlatform?.() ||
      window.Capacitor?.getPlatform?.() === 'android')
  );
}

async function getPlatform() {
  if (_platform) return _platform;
  const { Device } = await import('@capacitor/device');
  const info = await Device.getInfo();
  _platform = info.platform === 'android' ? 'android' : 'browser';
  return _platform;
}

// ── IndexedDB (browser/desktop) ─────────────────────────────────────────────

/**
 * Initializes and upgrades the IndexedDB database.
 */
async function getIdb() {
  if (_idb) return _idb;
  _idb = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: false });
        store.createIndex('serviceNumber', 'serviceNumber', { unique: false });
        store.createIndex('isDeleted', 'isDeleted', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      }
    },
  });
  return _idb;
}

// ── SQLite (Android) ─────────────────────────────────────────────────────────

let _sqliteConnection = null;

/**
 * Initializes the SQLite connection for native Android.
 * Handles schema creation and surgical column migrations.
 */
async function getSqlite() {
  if (_sqlite) return _sqlite;

  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  if (!_sqliteConnection) {
    _sqliteConnection = new SQLiteConnection(CapacitorSQLite);
  }
  const conn = _sqliteConnection;

  let db;
  try {
    const isConn = await conn.isConnection('apvidyuth', false);
    if (isConn.result) {
      db = await conn.retrieveConnection('apvidyuth', false);
    } else {
      db = await conn.createConnection('apvidyuth', false, 'no-encryption', 1, false);
    }

    await db.open();

    // Migrate: add missing columns (surgical updates for existing installs)
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN historyFetchedAt TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN lastReportedBillDate TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN billTime TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN category TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN closingRdg REAL;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN ctrLoad REAL;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN divisionCode TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN divisionName TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN circleName TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN sectionName TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE electricity_services ADD COLUMN uniqueServiceNumber TEXT;"); } catch (e) {}

    await db.execute(`
      CREATE TABLE IF NOT EXISTS electricity_services (
        id TEXT PRIMARY KEY,
        serviceNumber TEXT NOT NULL,
        label TEXT,
        customerName TEXT,
        lastBillDate TEXT,
        lastDueDate TEXT,
        lastAmountDue REAL,
        lastBilledUnits REAL,
        lastThreeAmounts TEXT,
        lastStatus TEXT DEFAULT 'UNKNOWN',
        lastFetchedAt TEXT,
        historyFetchedAt TEXT,
        lastReportedBillDate TEXT,
        billTime TEXT,
        lastRefreshedDate TEXT,
        lastError TEXT,
        isPaid INTEGER DEFAULT 0,
        paidDate TEXT,
        receiptNumber TEXT,
        paidAmount REAL,
        billBreakup TEXT,
        billHistory TEXT,
        paymentHistory TEXT,
        trendData TEXT,
        insights TEXT,
        category TEXT,
        closingRdg REAL,
        ctrLoad REAL,
        divisionCode TEXT,
        divisionName TEXT,
        circleName TEXT,
        sectionName TEXT,
        uniqueServiceNumber TEXT,
        pinned INTEGER DEFAULT 0,
        pinnedAt TEXT,
        isDeleted INTEGER DEFAULT 0,
        deletedAt TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    
    _sqlite = db;
    return db;
  } catch (err) {
    console.error("SQLite init error:", err);
    throw err;
  }
}

/**
 * Persists the SQLite state to the device's permanent storage.
 */
async function sqliteSave() {
  if (_sqlite && (await getPlatform()) === 'android') {
    const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
    try {
      await CapacitorSQLite.saveToStore({ database: 'apvidyuth' });
    } catch (e) {
      console.warn("SQLite saveToStore failed:", e);
    }
  }
}

// ── UUID generator ───────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Serializers ──────────────────────────────────────────────────────────────

/**
 * Prepares a record for SQLite storage by converting objects/arrays to JSON strings.
 */
function serializeRecord(record) {
  return {
    ...record,
    lastThreeAmounts: JSON.stringify(record.lastThreeAmounts || []),
    billBreakup:      record.billBreakup      ? JSON.stringify(record.billBreakup)      : null,
    billHistory:      record.billHistory      ? JSON.stringify(record.billHistory)      : null,
    paymentHistory:   record.paymentHistory   ? JSON.stringify(record.paymentHistory)   : null,
    trendData:        record.trendData        ? JSON.stringify(record.trendData)        : null,
    insights:         record.insights         ? JSON.stringify(record.insights)         : null,
    isPaid:           record.isPaid ? 1 : 0,
    pinned:           record.pinned ? 1 : 0,
    isDeleted:        record.isDeleted ? 1 : 0,
  };
}

/**
 * Converts a SQLite row back to a JS object by parsing JSON strings.
 */
function deserializeRow(row) {
  if (!row) return null;
  return {
    ...row,
    lastThreeAmounts: typeof row.lastThreeAmounts === 'string' ? JSON.parse(row.lastThreeAmounts) : row.lastThreeAmounts || [],
    billBreakup:      typeof row.billBreakup      === 'string' ? JSON.parse(row.billBreakup)      : row.billBreakup    || null,
    billHistory:      typeof row.billHistory      === 'string' ? JSON.parse(row.billHistory)      : row.billHistory    || null,
    paymentHistory:   typeof row.paymentHistory   === 'string' ? JSON.parse(row.paymentHistory)   : row.paymentHistory || null,
    trendData:        typeof row.trendData        === 'string' ? JSON.parse(row.trendData)        : row.trendData      || null,
    insights:         typeof row.insights         === 'string' ? JSON.parse(row.insights)         : row.insights       || null,
    isPaid:           !!row.isPaid,
    pinned:           !!row.pinned,
    isDeleted:        !!row.isDeleted,
  };
}

// ── DB Operations ─────────────────────────────────────────────────────────────

/**
 * Returns all active (non-deleted) services.
 */
async function getAllServices() {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(`SELECT * FROM electricity_services WHERE isDeleted = 0 ORDER BY pinned DESC, pinnedAt DESC, createdAt DESC`);
    return (result.values || []).map(deserializeRow);
  } else {
    const db = await getIdb();
    const all = await db.getAll(STORE);
    return all.filter(s => !s.isDeleted).sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
}

/**
 * Returns all soft-deleted services.
 */
async function getTrashServices() {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(`SELECT * FROM electricity_services WHERE isDeleted = 1 ORDER BY deletedAt DESC`);
    return (result.values || []).map(deserializeRow);
  } else {
    const db = await getIdb();
    const all = await db.getAll(STORE);
    return all.filter(s => s.isDeleted).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  }
}

/**
 * Retrieves a single service by its unique internal ID.
 */
async function getServiceById(id) {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(`SELECT * FROM electricity_services WHERE id = ?`, [id]);
    return result.values?.length ? deserializeRow(result.values[0]) : null;
  } else {
    const db = await getIdb();
    return await db.get(STORE, id);
  }
}

/**
 * Retrieves a single service by its APSPDCL service number.
 */
async function getServiceByNumber(number) {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(`SELECT * FROM electricity_services WHERE serviceNumber = ? AND isDeleted = 0`, [number]);
    return result.values?.length ? deserializeRow(result.values[0]) : null;
  } else {
    const db = await getIdb();
    return await db.getFromIndex(STORE, 'serviceNumber', number);
  }
}

/**
 * Persists a new service record to the appropriate database.
 */
async function createService(data) {
  const platform = await getPlatform();
  const now = new Date().toISOString();
  const record = {
    id: generateId(),
    serviceNumber: data.serviceNumber,
    label: data.label || '',
    customerName: null,
    lastBillDate: null,
    lastDueDate: null,
    lastAmountDue: null,
    lastBilledUnits: null,
    lastThreeAmounts: [],
    lastStatus: 'UNKNOWN',
    lastFetchedAt: null,
    historyFetchedAt: null,
    lastReportedBillDate: null,
    billTime: null,
    lastRefreshedDate: null,
    lastError: null,
    isPaid: false,
    paidDate: null,
    receiptNumber: null,
    paidAmount: null,
    billBreakup: null,
    billHistory: [],
    paymentHistory: [],
    trendData: [],
    insights: null,
    category: null,
    closingRdg: null,
    ctrLoad: null,
    divisionCode: null,
    divisionName: null,
    circleName: null,
    sectionName: null,
    uniqueServiceNumber: data.serviceNumber,
    pinned: !!data.pinned,
    pinnedAt: data.pinned ? now : null,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (platform === 'android') {
    const db = await getSqlite();
    const ser = serializeRecord(record);
    await db.run(
      `INSERT INTO electricity_services
        (id, serviceNumber, label, customerName, lastBillDate, lastDueDate,
         lastAmountDue, lastBilledUnits, lastThreeAmounts, lastStatus, lastFetchedAt,
         historyFetchedAt, lastReportedBillDate, billTime, lastRefreshedDate, lastError, isPaid, paidDate, receiptNumber, paidAmount,
         billBreakup, billHistory, paymentHistory, trendData, insights,
         category, closingRdg, ctrLoad,
         divisionCode, divisionName, circleName, sectionName, uniqueServiceNumber,
         pinned, pinnedAt, isDeleted, deletedAt, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ser.id, ser.serviceNumber, ser.label, ser.customerName,
        ser.lastBillDate, ser.lastDueDate, ser.lastAmountDue, ser.lastBilledUnits,
        ser.lastThreeAmounts, ser.lastStatus, ser.lastFetchedAt, ser.historyFetchedAt, ser.lastReportedBillDate, ser.billTime, ser.lastRefreshedDate,
        ser.lastError, ser.isPaid, ser.paidDate, ser.receiptNumber, ser.paidAmount,
        ser.billBreakup, ser.billHistory, ser.paymentHistory, ser.trendData, ser.insights,
        ser.category, ser.closingRdg, ser.ctrLoad,
        ser.divisionCode, ser.divisionName, ser.circleName, ser.sectionName, ser.uniqueServiceNumber,
        ser.pinned, ser.pinnedAt, ser.isDeleted, ser.deletedAt, ser.createdAt, ser.updatedAt
      ]
    );
    await sqliteSave();
  } else {
    const db = await getIdb();
    await db.add(STORE, record);
  }
  return record;
}

/**
 * Updates an existing service record with a partial patch.
 */
async function updateService(id, patch) {
  const platform = await getPlatform();
  const now = new Date().toISOString();

  if (platform === 'android') {
    const existing = await getServiceById(id);
    if (!existing) throw new Error('Service not found');
    const updated = { ...existing, ...patch, updatedAt: now };
    const ser = serializeRecord(updated);
    await (await getSqlite()).run(
      `UPDATE electricity_services SET
        serviceNumber=?, label=?, customerName=?, lastBillDate=?, lastDueDate=?,
        lastAmountDue=?, lastBilledUnits=?, lastThreeAmounts=?, lastStatus=?,
        lastFetchedAt=?, historyFetchedAt=?, lastReportedBillDate=?, billTime=?, lastRefreshedDate=?, lastError=?, isPaid=?, paidDate=?,
        receiptNumber=?, paidAmount=?, billBreakup=?, billHistory=?,
        paymentHistory=?, trendData=?, insights=?,
        category=?, closingRdg=?, ctrLoad=?,
        divisionCode=?, divisionName=?, circleName=?, sectionName=?, uniqueServiceNumber=?,
        pinned=?, pinnedAt=?, isDeleted=?, deletedAt=?, updatedAt=?
       WHERE id=?`,
      [
        ser.serviceNumber, ser.label, ser.customerName, ser.lastBillDate,
        ser.lastDueDate, ser.lastAmountDue, ser.lastBilledUnits, ser.lastThreeAmounts,
        ser.lastStatus, ser.lastFetchedAt, ser.historyFetchedAt, ser.lastReportedBillDate, ser.billTime, ser.lastRefreshedDate, ser.lastError,
        ser.isPaid, ser.paidDate, ser.receiptNumber, ser.paidAmount,
        ser.billBreakup, ser.billHistory, ser.paymentHistory, ser.trendData, ser.insights,
        ser.category, ser.closingRdg, ser.ctrLoad,
        ser.divisionCode, ser.divisionName, ser.circleName, ser.sectionName, ser.uniqueServiceNumber,
        ser.pinned, ser.pinnedAt, ser.isDeleted, ser.deletedAt, ser.updatedAt, ser.id
      ]
    );
    await sqliteSave();
    return updated;
  } else {
    const db = await getIdb();
    const existing = await db.get(STORE, id);
    if (!existing) throw new Error('Service not found');
    const updated = { ...existing, ...patch, updatedAt: now };
    await db.put(STORE, updated);
    return updated;
  }
}

/**
 * Deletes a service (soft-delete by default, hard-delete if requested).
 */
async function deleteService(id, permanent = false) {
  const platform = await getPlatform();
  if (permanent) {
    if (platform === 'android') {
      const db = await getSqlite();
      await db.run(`DELETE FROM electricity_services WHERE id = ?`, [id]);
      await sqliteSave();
    } else {
      const db = await getIdb();
      await db.delete(STORE, id);
    }
  } else {
    await updateService(id, { 
      isDeleted: true, 
      deletedAt: new Date().toISOString(),
      pinned: false,
      pinnedAt: null,
    });
  }
}

/**
 * Persists and retrieves application-wide settings.
 */
async function getSetting(key, defaultValue = null) {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [key]);
    if (!result.values?.length) return defaultValue;
    try { return JSON.parse(result.values[0].value); }
    catch { return result.values[0].value; }
  } else {
    const db = await getIdb();
    const result = await db.get(SETTINGS_STORE, key);
    return result ? result.value : defaultValue;
  }
}

async function setSetting(key, value) {
  const platform = await getPlatform();
  if (platform === 'android') {
    const db = await getSqlite();
    const valStr = JSON.stringify(value);
    await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, valStr]);
    await sqliteSave();
  } else {
    const db = await getIdb();
    await db.put(SETTINGS_STORE, { key, value });
  }
}

/**
 * Exposed DB API
 */
export const db = {
  init: async () => {
    const platform = await getPlatform();
    if (platform === 'android') {
      await getSqlite();
    } else {
      await getIdb();
    }
  },
  getAll: getAllServices,
  getTrash: getTrashServices,
  getById: getServiceById,
  getByNumber: getServiceByNumber,
  create: createService,
  update: updateService,
  delete: deleteService,
  getPlatform,
  getSetting,
  setSetting,
};
