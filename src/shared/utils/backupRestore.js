import { db } from '../db/storage.js';
import toast from 'react-hot-toast';

export async function importBackupData(file, { services, trash, actions }, t, ph, onComplete, options = {}) {
  const { wipeFirst = false } = options;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawData = JSON.parse(event.target.result);
        
        if (!Array.isArray(rawData) && !rawData.version) {
           throw new Error('Invalid backup format');
        }

        let entries = [];
        let meta = null;

        // Extract meta and entries
        if (Array.isArray(rawData)) {
           meta = rawData.find(item => item._meta);
           entries = rawData.filter(item => !item._meta).map(item => ({
             ...item,
             serviceNumber: item.serviceNumber || item.number
           }));
        } else if (rawData.version === 2) {
           // Support importing the non-array V2 format we temporarily made
           meta = rawData;
           entries = rawData.services || [];
        }

        if (wipeFirst) {
          const allServices = await db.getAll();
          const allTrash = await db.getTrash();
          const allIds = [...allServices, ...allTrash].map(s => s.id);
          if (allIds.length > 0) {
            await actions.bulkPurge(allIds);
          }
          // Clear settings as well
          await db.setSetting('saved_appliances', []);
          await db.setSetting('notification_history', []);
          
          // Use empty arrays for local matching
          services = [];
          trash = [];
        }

        if (meta) {
          if (meta.theme) {
            localStorage.setItem('theme', meta.theme);
            document.documentElement.setAttribute('data-theme', meta.theme);
            const themeColor = meta.theme === 'dark' ? '#0f172a' : '#f9fafb';
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
          }
          if (meta.language) {
            localStorage.setItem('i18nextLng', meta.language);
          }
          if (meta.appliances) {
            await db.setSetting('saved_appliances', meta.appliances);
          }
        }

        const validEntries = entries.filter(e => e.serviceNumber && e.serviceNumber.length === 13);

        if (validEntries.length === 0) {
          toast.error(t('no_valid_services_in_backup', 'No valid service numbers found in backup'));
          resolve(false);
          return;
        }

        const toastId = toast.loading(`Importing ${validEntries.length} services...`);
        let skipCount = 0;
        const toAdd = [];

        // Restore settings for existing, prepare bulk add for new
        for (const entry of validEntries) {
          const sn = entry.serviceNumber;
          const inActive = services.find(s => s.serviceNumber === sn);
          const inTrash = trash.find(t => t.serviceNumber === sn);

          if (inActive || inTrash) {
            skipCount++;
            if (inActive) {
              const patch = {};
              if (entry.label && !inActive.label) patch.label = entry.label;
              if (entry.pinned) patch.pinned = true;
              if (entry.billTime) patch.billTime = entry.billTime;
              if (Object.keys(patch).length > 0) {
                await actions.update(inActive.id, patch);
              }
            }
            if (entry.meterReadings && entry.meterReadings.length > 0) {
              await db.setSetting(`readings_${sn}`, entry.meterReadings);
            }
          } else {
            toAdd.push({ number: sn, label: entry.label, pinned: !!entry.pinned, entryData: entry });
          }
        }

        let successCount = 0;
        let failCount = 0;

        if (toAdd.length > 0) {
          try {
            const results = await actions.add({ isBulk: true, entries: toAdd });
            // Results is an array of { id, serviceNumber, _error, ... }
            if (Array.isArray(results)) {
               for (const result of results) {
                 if (result._error) {
                   failCount++;
                 } else {
                   successCount++;
                   // Restore meter readings and billTime for newly added service
                   const originalEntry = toAdd.find(a => a.number === result.serviceNumber)?.entryData;
                   if (originalEntry) {
                     if (originalEntry.billTime) await actions.update(result.id, { billTime: originalEntry.billTime });
                     if (originalEntry.meterReadings?.length > 0) await db.setSetting(`readings_${result.serviceNumber}`, originalEntry.meterReadings);
                   }
                 }
               }
            }
          } catch (err) {
            if (err?.message !== 'CANCELLED') {
              console.error('Failed bulk import', err);
              failCount = toAdd.length;
            }
          }
        }

        let msg = `Imported ${successCount} new services.`;
        if (skipCount > 0) msg += ` Updated ${skipCount} existing.`;
        if (failCount > 0) msg += ` Failed ${failCount}.`;
        
        toast.success(msg, { id: toastId });
        if (ph) ph.capture('data_imported', { count: successCount });

        if (onComplete) onComplete();
        resolve(true);
        
      } catch (err) {
        toast.error(t('import_failed', 'Failed to read backup file: ' + err.message));
        resolve(false);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
