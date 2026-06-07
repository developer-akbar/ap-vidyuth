/**
 * Services API — frontend HTTP client
 *
 * All calls go to our own local API server (server/index.js).
 * The server handles APSPDCL internally — raw APSPDCL URLs never appear here.
 *
 * REST contract (matches server/index.js routes exactly):
 *
 *   POST /api/services/validate            → validate + get initial snapshot
 *   POST /api/services/:sn/refresh         → refresh one service
 *   POST /api/services/refresh-all         → refresh many services (body: serviceNumbers[])
 *
 * Persistence (list / trash / CRUD) is local-only via storage.js.
 * The server has no database — it is a pure processing proxy.
 */

import { db } from '../../../shared/db/storage.js';

// ── HTTP base ─────────────────────────────────────────────────────────────────

/**
 * In dev:  Vite proxies /api/* → http://localhost:4100/api/*
 * On Android: set VITE_API_URL to your LAN server, e.g. http://192.168.1.10:4100/api
 */
export function apiBase() {
  const env = import.meta.env?.VITE_API_URL;
  if (env && !env.includes('127.0.0.1:5173') && !env.includes('localhost:5173')) return env.replace(/\/$/, '');
  return '/api';
}

export async function apiPost(path, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s global timeout

  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `API error ${res.status}`);
    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' || err.message.includes('Timeout')) {
      throw new Error('Server request timed out. Please try again.');
    }
    throw err;
  }
}

// ── Snapshot → DB patch mapper ────────────────────────────────────────────────

function snapshotToPatch(snapshot, existing = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const patch = {
    customerName:      snapshot.customerName,
    lastBillDate:      snapshot.billDate,
    billTime:          snapshot.billTime,
    lastDueDate:       snapshot.dueDate,
    lastAmountDue:     snapshot.amountDue,
    lastBilledUnits:   snapshot.billedUnits,
    lastStatus:        snapshot.status,
    lastFetchedAt:     snapshot.fetchedAt || new Date().toISOString(),
    lastRefreshedDate: today,
    isPaid:            snapshot.isPaid,
    paidDate:          snapshot.paidDate,
    receiptNumber:     snapshot.receiptNumber,
    paidAmount:        snapshot.paidAmount,
    billBreakup:       snapshot.billBreakup,
    category:          snapshot.category,
    closingRdg:        snapshot.closingRdg,
    ctrLoad:           snapshot.ctrLoad,
    divisionCode:      snapshot.divisionCode,
    circleName:        snapshot.circleName,
    divisionName:      snapshot.divisionName,
    sectionName:       snapshot.sectionName,
    uniqueServiceNumber: snapshot.uniqueServiceNumber,
  };

  // ── Handle Service Number Migration ─────────────────────────────────────
  // If the server detected a migration (via BillDesk or Prefix Map), update it locally.
  if (snapshot.migratedServiceNumber && snapshot.migratedServiceNumber !== (existing.serviceNumber || snapshot.serviceNumber)) {
    patch.serviceNumber = snapshot.migratedServiceNumber;
    console.log(`[servicesApi] Migration detected: ${existing.serviceNumber || snapshot.serviceNumber} → ${patch.serviceNumber}`);
  }

  // ── Handle Partial History Success ────────────────────────────────────────
  // Even if there's an apspdclError (e.g. payment history down), we might still have bill history.
  // Save whatever new data we got; fallback to existing only if new data is empty/missing.
  
  if (!snapshot.apspdclError || (snapshot.billHistory && snapshot.billHistory.length > 0)) {
    patch.billHistory      = snapshot.billHistory;
    patch.trendData        = snapshot.trendData;
    patch.insights         = snapshot.insights;
    patch.lastThreeAmounts = snapshot.lastThreeAmounts;
  } else {
    patch.billHistory      = existing.billHistory      || null;
    patch.trendData        = existing.trendData        || null;
    patch.insights         = existing.insights         || null;
    patch.lastThreeAmounts = existing.lastThreeAmounts || [];
  }

  if (!snapshot.apspdclError || (snapshot.paymentHistory && snapshot.paymentHistory.length > 0)) {
    patch.paymentHistory   = snapshot.paymentHistory;
  } else {
    patch.paymentHistory   = existing.paymentHistory   || null;
  }

  // Only update history timestamp if we actually received something
  if (snapshot.billHistory?.length || snapshot.paymentHistory?.length) {
    patch.historyFetchedAt = snapshot.fetchedAt || new Date().toISOString();
  } else {
    patch.historyFetchedAt = existing.historyFetchedAt || null;
  }

  // Shorten error messages
  if (snapshot.apspdclError) {
    patch.lastError = `APSPDCL history unavailable. Few data might be missing.`;
  } else if (snapshot.billDeskError) {
    patch.lastError = `Live BillDesk unavailable. Showing APSPDCL historical data.`;
  } else {
    patch.lastError = null;
  }

  return patch;
}

/**
 * shouldAutoRefresh(service)
 *
 * Returns true if the service hasn't been refreshed today.
 * Strategy: refresh on first load of the day (date-level staleness).
 * This means: open the app in the morning → all services auto-refresh once.
 * Any subsequent opens on the same calendar day → no auto-refresh (use cached data).
 */
export function shouldAutoRefresh(service) {
  if (!service.lastRefreshedDate) return true;
  const today = new Date().toISOString().slice(0, 10);
  return service.lastRefreshedDate < today;
}

// ── Concurrency queue ─────────────────────────────────────────────────────────

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = { status: 'fulfilled', value: await tasks[i]() }; }
      catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * GET /services  (local DB only)
 */
export async function listServices() {
  return db.getAll();
}

/**
 * GET /services/trash  (local DB only)
 */
export async function listTrash() {
  return db.getTrash();
}

/**
 * POST /services
 *
 * Calls POST /api/services/validate (→ server makes 2 APSPDCL calls).
 * On success, persists to local DB and applies the snapshot immediately.
 * No second refresh needed.
 */
export async function createService({ serviceNumber, label }, billdeskSession) {
  const results = await createBulkServices([{ number: serviceNumber, label }], billdeskSession);
  const result = results[0];
  if (result && result._error) {
    throw new Error(result._error);
  }
  return result;
}

/**
 * Bulk create services
 * @param {Array<{number: string, label: string}>} entries 
 * @param {object} billdeskSession 
 */
export async function createBulkServices(entries, billdeskSession) {
  const results = [];
  
  for (const entry of entries) {
    try {
      const existing = await db.getByNumber(entry.number);
      if (existing && !existing.isDeleted) {
        results.push({ ...existing, _error: 'Already added' });
        continue;
      }

      const { snapshot } = await apiPost('/services/validate', { serviceNumber: entry.number, billdeskSession });
      
      // FINAL GUARD: If both BillDesk and APSPDCL return nothing, reject it.
      if (!snapshot || snapshot.billDeskSource === 'UNKNOWN') {
        results.push({ number: entry.number, _error: 'Invalid APSPDCL service number' });
        continue;
      }

      const service = await db.create({ serviceNumber: entry.number, label: entry.label });
      const updated = await db.update(service.id, { ...snapshotToPatch(snapshot, service), lastError: null });
      results.push(updated);
    } catch (err) {
      results.push({ number: entry.number, _error: err.message || 'Failed to add' });
    }
  }
  
  return results;
}

/**
 * POST /services/:id/refresh
 *
 * Calls POST /api/services/:serviceNumber/refresh (→ server makes 2 APSPDCL calls).
 * Updates local DB on success, records error on failure.
 */
export async function refreshService(id, billdeskSession) {
  const service = await db.getById(id);
  if (!service) throw new Error(`Service ${id} not found`);

  try {
    const { snapshot } = await apiPost(`/services/${service.serviceNumber}/refresh`, { billdeskSession });
    return db.update(id, snapshotToPatch(snapshot, service));
  } catch (err) {
    await db.update(id, { lastError: err.message || 'Refresh failed', lastFetchedAt: new Date().toISOString() });
    throw err;
  }
}

/**
 * POST /services/refresh-all
 *
 * Sends all services to POST /api/services/refresh-all in one request.
 * Server processes them sequentially. Client updates local DB from results.
 *
 * @param {(done:number, total:number)=>void} onProgress
 * @param {object} billdeskSession
 * @returns {{ succeeded:number, failed:number, errors:string[], results:any[] }}
 */
export async function refreshAllServices(onProgress, billdeskSession) {
  const services = await db.getAll();
  if (!services.length) return { succeeded: 0, failed: 0, errors: [] };

  // One API call to the server — send the full service list so the server can map snapshots back to local IDs
  const json = await apiPost('/services/refresh-all', { services, billdeskSession });
  const { results } = json;

  // Apply each result to local DB
  let done = 0;
  const tasks = results.map(result => async () => {
    const service = services.find(s => s.id === result.id);
    if (!service) return;

    if (result.ok && result.snapshot) {
      await db.update(service.id, snapshotToPatch(result.snapshot, service));
    } else {
      await db.update(service.id, {
        lastError: result.error || 'Refresh failed',
        lastFetchedAt: new Date().toISOString(),
      });
    }
    done++;
    onProgress?.(done, results.length);
  });

  // Apply DB updates with some concurrency (DB writes, not APSPDCL calls)
  await runWithConcurrency(tasks, 4);

  const errors = results.filter(r => !r.ok).map(r => r.error || 'Unknown error');
  return { succeeded: json.succeeded, failed: json.failed, errors, results };
}

/**
 * PUT /services/:id  (local DB only)
 */
export async function updateService(id, patch) {
  if (patch.pinned !== undefined) {
    patch = { ...patch, pinnedAt: patch.pinned ? new Date().toISOString() : null };
  }
  return db.update(id, patch);
}

/**
 * PUT /services/:id/restore  (local DB only)
 */
export async function restoreService(id) {
  return db.update(id, { isDeleted: false, deletedAt: null });
}

export async function bulkRestoreServices(ids) {
  const tasks = ids.map(id => () => restoreService(id));
  return runWithConcurrency(tasks, 4);
}

/**
 * DELETE /services/:id  (local DB only, soft delete)
 */
export async function moveToTrash(id) {
  await db.delete(id, false);
}

export async function bulkMoveToTrash(ids) {
  const tasks = ids.map(id => () => moveToTrash(id));
  return runWithConcurrency(tasks, 4);
}

/**
 * DELETE /services/:id/permanent  (local DB only, hard delete)
 */
export async function deletePermanently(id) {
  await db.delete(id, true);
}

export async function bulkDeletePermanently(ids) {
  const tasks = ids.map(id => () => deletePermanently(id));
  return runWithConcurrency(tasks, 4);
}