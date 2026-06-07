/**
 * useElectricityServices
 *
 * React state layer for electricity services.
 * Calls only servicesApi — never touches db or apspdclClient directly.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  bulkDeletePermanently,
  bulkMoveToTrash,
  bulkRestoreServices,
  createBulkServices,
  createService,
  deletePermanently,
  listServices,
  listTrash,
  moveToTrash,
  refreshAllServices,
  refreshService,
  restoreService,
  shouldAutoRefresh,
  updateService,
} from '../api/servicesApi.js';
import { getValidSession } from '../utils/billdeskSession.jsx';
import { syncPushTokenWithServer } from '../utils/notifications.js';

// ── Reducer ───────────────────────────────────────────────────────────────────

const initialState = {
  services: [],
  trash: [],
  loading: true,
  refreshingIds: new Set(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return { ...state, services: action.services, trash: action.trash, loading: false };

    case 'REFRESHING_ADD': {
      const next = new Set(state.refreshingIds);
      next.add(action.id);
      return { ...state, refreshingIds: next };
    }
    case 'REFRESHING_REMOVE': {
      const next = new Set(state.refreshingIds);
      next.delete(action.id);
      return { ...state, refreshingIds: next };
    }

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useElectricityServices() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Per-service refresh cooldown: id → timestamp when next refresh is allowed
  const cooldowns = useRef(new Map());

  // ── Reload from local DB ────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const [services, trash] = await Promise.all([listServices(), listTrash()]);
      dispatch({ type: 'LOAD', services, trash });
      
      // Sync push notifications state with server
      syncPushTokenWithServer().catch(err => console.error("Push sync failed", err));
      
      return services; // return so auto-refresh can inspect them
    } catch (e) {
      console.error("[useElectricityServices] Failed to load services:", e);
      dispatch({ type: 'LOAD', services: [], trash: [] });
      return [];
    }
  }, []);

  // ── Auto-refresh stale services on first daily load ─────────────────────
  // Runs once on mount. If any service hasn't been refreshed today, refresh-all.
  // Uses a ref to prevent double-fire in React StrictMode.
  const autoRefreshDone = useRef(false);

  useEffect(() => {
    if (autoRefreshDone.current) return;
    autoRefreshDone.current = true;

    (async () => {
      // 1. Ensure DB is fully connected
      try {
        const { db } = await import('../../../shared/db/storage.js');
        await db.init();
      } catch (e) {
        console.error("[useElectricityServices] DB init failed:", e);
      }

      // 2. Load initial data
      const services = await reload();
      
      // 3. Optional auto-refresh logic
      const stale = services.filter(shouldAutoRefresh);
      if (stale.length === 0) return;

      const session = await getValidSession(stale[0].serviceNumber);
      if (!session) return; // User cancelled captcha or failed

      // Mark all stale as refreshing
      stale.forEach(s => dispatch({ type: 'REFRESHING_ADD', id: s.id }));
      try {
        await refreshAllServices(undefined, session);
      } finally {
        stale.forEach(s => dispatch({ type: 'REFRESHING_REMOVE', id: s.id }));
        await reload();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions.add ─────────────────────────────────────────────────────────────
  // POST /services
  // Validates + fetches in one shot (2 APSPDCL calls total), then reloads.
  const add = useCallback(async (params) => {
    const { isBulk, entries, serviceNumber, label } = params;
    const snForSession = isBulk ? entries[0].number : serviceNumber;
    
    const session = await getValidSession(snForSession);
    if (!session) throw new Error('CANCELLED');
    
    let result;
    if (isBulk) {
      result = await createBulkServices(entries, session);
    } else {
      result = await createService({ serviceNumber, label }, session);
    }
    
    await reload();
    return result;
  }, [reload]);

  // ── actions.refresh ─────────────────────────────────────────────────────────
  // POST /services/:id/refresh
  // Enforces a 2-minute per-service cooldown to avoid hammering APSPDCL.
  const refresh = useCallback(async (id) => {
    const now = Date.now();
    const nextAllowed = cooldowns.current.get(id) || 0;
    if (nextAllowed > now) {
      const wait = Math.ceil((nextAllowed - now) / 1000);
      throw new Error(`Please wait ${wait}s before refreshing again`);
    }

    const service = state.services.find(s => s.id === id);
    if (!service) throw new Error('Service not found');

    const session = await getValidSession(service.serviceNumber);
    if (!session) throw new Error('CANCELLED');

    dispatch({ type: 'REFRESHING_ADD', id });
    try {
      await refreshService(id, session);
      cooldowns.current.set(id, Date.now() + 5_000);
    } finally {
      dispatch({ type: 'REFRESHING_REMOVE', id });
      await reload();
    }
    // Note: refreshService already writes lastError to db on failure,
    // so we let the error bubble up for the toast without a second db write.
  }, [state.services, reload]);

  // ── actions.refreshAll ──────────────────────────────────────────────────────
  // POST /services/refresh-all
  // Uses concurrency-limited queue inside servicesApi — at most 2 in-flight.
  // Returns summary { succeeded, failed, errors }.
  const refreshAll = useCallback(async (onProgress) => {
    if (!state.services.length) return { succeeded: 0, failed: 0, errors: [] };
    const session = await getValidSession(state.services[0].serviceNumber);
    if (!session) throw new Error('CANCELLED');
    
    // Mark all as refreshing
    const services = state.services;
    services.forEach((s) => dispatch({ type: 'REFRESHING_ADD', id: s.id }));

    try {
      const summary = await refreshAllServices(async (completed, total) => {
        onProgress?.(completed, total);
        // Reload incrementally so cards update as each service finishes
        await reload();
      }, session);
      return summary;
    } finally {
      services.forEach((s) => dispatch({ type: 'REFRESHING_REMOVE', id: s.id }));
      await reload();
    }
  }, [state.services, reload]);

  // ── actions.update ──────────────────────────────────────────────────────────
  // PUT /services/:id  (label, pinned, etc.)
  const update = useCallback(async (id, patch) => {
    await updateService(id, patch);
    await reload();
  }, [reload]);

  // ── actions.moveToTrash ─────────────────────────────────────────────────────
  // DELETE /services/:id
  const remove = useCallback(async (id) => {
    await moveToTrash(id);
    await reload();
  }, [reload]);

  // ── actions.restore ─────────────────────────────────────────────────────────
  // PUT /services/:id/restore
  const restore = useCallback(async (id) => {
    await restoreService(id);
    await reload();
  }, [reload]);

  const bulkRestore = useCallback(async (ids) => {
    await bulkRestoreServices(ids);
    await reload();
  }, [reload]);

  // ── actions.deletePermanently ───────────────────────────────────────────────
  // DELETE /services/:id/permanent
  const purge = useCallback(async (id) => {
    await deletePermanently(id);
    await reload();
  }, [reload]);

  const bulkPurge = useCallback(async (ids) => {
    await bulkDeletePermanently(ids);
    await reload();
  }, [reload]);

  const bulkRemove = useCallback(async (ids) => {
    await bulkMoveToTrash(ids);
    await reload();
  }, [reload]);

  return {
    ...state,
    actions: { reload, add, refresh, refreshAll, update, remove, bulkRemove, restore, bulkRestore, purge, bulkPurge },
  };
}