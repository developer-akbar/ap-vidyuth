import { db } from '../db/storage.js';
import toast from 'react-hot-toast';

export async function importBackupData(file, { services, trash, actions }, t, ph, onComplete, options = {}) {
  const { wipeFirst = false, onProgress } = options;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawData = JSON.parse(event.target.result);
        
        let entries = [];
        let meta = null;

        // Extract meta and entries robustly
        if (Array.isArray(rawData)) {
           meta = rawData.find(item => item._meta);
           entries = rawData.filter(item => !item._meta).map(item => ({
             ...item,
             serviceNumber: item.serviceNumber || item.number || Object.keys(item).find(k => k.length === 13 && !isNaN(k))
           }));
        } else if (rawData.version === 2 || rawData.services) {
           // Support V2 format and generic services objects
           meta = rawData._meta || rawData;
           entries = rawData.services || [];
        } else if (rawData['ap-vidyuth-services'] || rawData['my-dashboard-services']) {
           // Legacy formats
           entries = rawData['ap-vidyuth-services'] || rawData['my-dashboard-services'] || [];
        } else {
           // Maybe it's just an object mapping keys to objects? Let's check for an array anywhere
           const anyArrayKey = Object.keys(rawData).find(k => Array.isArray(rawData[k]) && rawData[k].length > 0 && (rawData[k][0].serviceNumber || rawData[k][0].number));
           if (anyArrayKey) {
              entries = rawData[anyArrayKey];
           } else {
              throw new Error('Invalid backup format');
           }
        }

        if (wipeFirst) {
          const allServices = await db.getAll();
          const allTrash = await db.getTrash();
          const allIds = [...allServices, ...allTrash].map(s => s.id);
          if (allIds.length > 0) {
            if (onProgress) onProgress('Wiping old data...');
            window.dispatchEvent(new CustomEvent('global-progress', { detail: 'Wiping old data...' }));
            await actions.bulkPurge(allIds);
          }
          // Clear settings as well
          await db.setSetting('saved_appliances', []);
          await db.setSetting('saved_appliances_v2', []);
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
            // Restore to the latest version key
            await db.setSetting('saved_appliances_v2', meta.appliances);
            // Also keep legacy for backward compatibility if needed by other components
            await db.setSetting('saved_appliances', meta.appliances);
          }
        }

        const validEntries = entries.filter(e => e.serviceNumber && e.serviceNumber.length === 13);

        if (validEntries.length === 0) {
          toast.error(t('no_valid_services_in_backup', 'No valid service numbers found in backup'));
          window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
          resolve(false);
          return;
        }

        if (onProgress) onProgress(`Restoring ${validEntries.length} services...`);
        window.dispatchEvent(new CustomEvent('global-progress', { detail: `Restoring ${validEntries.length} services...` }));
        let skipCount = 0;
        const toAdd = [];

        // Restore settings for existing, prepare bulk add for new
        const nowMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
        const readingCutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;

        for (const entry of validEntries) {
          const sn = entry.serviceNumber;
          const inActive = services.find(s => s.serviceNumber === sn);
          const inTrash = trash.find(t => t.serviceNumber === sn);

          const backupMonth = entry.lastBillDate ? entry.lastBillDate.slice(0, 7) : null;
          const isCurrentPeriod = backupMonth === nowMonth;

          if (inActive || inTrash) {
            skipCount++;
            if (inActive) {
              const patch = {};
              if (entry.label && !inActive.label) patch.label = entry.label;
              if (entry.pinned) patch.pinned = true;
              
              // Only restore month-specific data if it's from the current period
              if (isCurrentPeriod) {
                if (entry.billTime) patch.billTime = entry.billTime;
                if (entry.billNoPrefix) patch.billNoPrefix = entry.billNoPrefix;
              }

              if (Object.keys(patch).length > 0) {
                await actions.update(inActive.id, patch);
              }
            }
            if (entry.meterReadings && entry.meterReadings.length > 0) {
              // Handle meter readings: Filter for freshness
              const freshReadings = entry.meterReadings.filter(r => new Date(r.date).getTime() > readingCutoff);
              if (freshReadings.length > 0) {
                await db.setSetting(`readings_${sn}`, freshReadings);
              }
            }
          } else {
            toAdd.push({ number: sn, label: entry.label, pinned: !!entry.pinned, entryData: entry });
          }
        }

        let successCount = 0;
        let failCount = 0;

        if (toAdd.length > 0) {
          try {
            // We can track progress of the API requests inside importBackupData 
            // by passing a callback to actions.add
            const results = await actions.add({ 
              isBulk: true, 
              entries: toAdd,
              onProgress: (done, total) => {
                const msg = `Validating ${done}/${total} new services...`;
                if (onProgress) onProgress(msg);
                window.dispatchEvent(new CustomEvent('global-progress', { detail: msg }));
              }
            });

            if (Array.isArray(results)) {
               for (const result of results) {
                 if (result._error) {
                   failCount++;
                 } else {
                   successCount++;
                   // Restore meter readings and billTime for newly added service (period-aware)
                   const originalEntry = toAdd.find(a => a.number === result.serviceNumber)?.entryData;
                   if (originalEntry) {
                     const patch = {};
                     const backupMonth = originalEntry.lastBillDate ? originalEntry.lastBillDate.slice(0, 7) : null;
                     const isCurrentPeriod = backupMonth === nowMonth;

                     if (isCurrentPeriod) {
                       if (originalEntry.billTime) patch.billTime = originalEntry.billTime;
                       if (originalEntry.billNoPrefix) patch.billNoPrefix = originalEntry.billNoPrefix;
                       if (Object.keys(patch).length > 0) await actions.update(result.id, patch);
                     }
                     
                     if (originalEntry.meterReadings?.length > 0) {
                       const freshReadings = originalEntry.meterReadings.filter(r => new Date(r.date).getTime() > readingCutoff);
                       if (freshReadings.length > 0) {
                         await db.setSetting(`readings_${result.serviceNumber}`, freshReadings);
                       }
                     }
                   }
                 }
               }
            }
          } catch (err) {
            if (err?.message !== 'CANCELLED') {
              console.error('Failed bulk import', err);
              failCount = toAdd.length;
            } else {
              // User cancelled captcha, stop import process
              window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
              resolve(false);
              return;
            }
          }
        }

        let msg = `Imported ${successCount} new services.`;
        if (skipCount > 0) msg += ` Updated ${skipCount} existing.`;
        if (failCount > 0) msg += ` Failed ${failCount}.`;
        
        toast.success(msg);
        if (ph) ph.capture('data_imported', { count: successCount });

        window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
        if (onComplete) onComplete();
        resolve(true);
        
      } catch (err) {
        toast.error(t('import_failed', 'Failed to read backup file: ' + err.message));
        window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
        resolve(false);
      }
    };
    reader.onerror = (e) => {
      window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
      reject(e);
    };
    reader.readAsText(file);
  });
}
