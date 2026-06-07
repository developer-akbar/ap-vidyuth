import { db } from '../../../shared/db/storage.js';
import { apiPost } from '../../electricity/api/servicesApi.js';

/**
 * Migrates service number prefixes for all matching services.
 * Includes a validation step to ensure the new prefix is valid.
 * @param {string} oldPrefix - The 5-digit prefix to replace.
 * @param {string} newPrefix - The new 5-digit prefix to use.
 * @param {function} onStatus - Callback for status updates.
 * @returns {Promise<number>} - The number of services updated.
 */
export async function migrateServicePrefix(oldPrefix, newPrefix, onStatus = () => {}) {
  if (!oldPrefix || !newPrefix || oldPrefix.length !== 5 || newPrefix.length !== 5) {
    throw new Error('Prefixes must be exactly 5 digits.');
  }

  onStatus('finding_services');
  const activeServices = await db.getAll();
  const trashServices = await db.getTrash();
  const allServices = [...activeServices, ...trashServices];

  const matchingServices = allServices.filter(s => s.serviceNumber.startsWith(oldPrefix));

  if (matchingServices.length === 0) {
    return 0;
  }

  // --- VALIDATION STEP ---
  // Pick the first matching service to test the new prefix
  const testService = matchingServices[0];
  const testNewNumber = newPrefix + testService.serviceNumber.substring(5);
  
  onStatus('verifying_prefix', { number: testNewNumber });
  
  try {
    const { snapshot } = await apiPost('/services/validate', { serviceNumber: testNewNumber });
    if (!snapshot || snapshot.billDeskSource === 'UNKNOWN') {
      throw new Error(`Invalid prefix. Validation failed for ${testNewNumber}`);
    }
  } catch (err) {
    console.error('[migration] Validation failed:', err);
    throw new Error(`validation_failed|${testNewNumber}`);
  }

  // --- MIGRATION STEP ---
  onStatus('migrating_all', { count: matchingServices.length });

  for (const service of matchingServices) {
    const updatedNumber = newPrefix + service.serviceNumber.substring(5);
    await db.update(service.id, {
      serviceNumber: updatedNumber,
      // Also update uniqueServiceNumber if it matches the old service number
      uniqueServiceNumber: service.uniqueServiceNumber === service.serviceNumber ? updatedNumber : service.uniqueServiceNumber,
      lastError: null // Clear errors since we just migrated
    });
  }

  // Record migration history
  const history = await db.getSetting('migration_history', []);
  const entry = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    oldPrefix,
    newPrefix,
    count: matchingServices.length,
    type: 'PREFIX_MIGRATION'
  };
  
  await db.setSetting('migration_history', [entry, ...history]);

  return matchingServices.length;
}

/**
 * Retrieves the migration history.
 */
export async function getMigrationHistory() {
  return await db.getSetting('migration_history', []);
}
