import { db } from '../db/storage.js';
import toast from 'react-hot-toast';
import { SERVICE_CAP } from './index.js';

export async function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawData = JSON.parse(event.target.result);
        let entries = [];
        let meta = null;

        if (Array.isArray(rawData)) {
           meta = rawData.find(item => item._meta);
           entries = rawData.filter(item => !item._meta).map(item => ({
             ...item,
             serviceNumber: item.serviceNumber || item.number || Object.keys(item).find(k => k.length === 13 && !isNaN(k))
           }));
        } else if (rawData.version === 2 || rawData.services) {
           meta = rawData._meta || rawData;
           entries = rawData.services || [];
        } else if (rawData['ap-vidyuth-services'] || rawData['my-dashboard-services']) {
           entries = rawData['ap-vidyuth-services'] || rawData['my-dashboard-services'] || [];
        } else {
           const anyArrayKey = Object.keys(rawData).find(k => Array.isArray(rawData[k]) && rawData[k].length > 0 && (rawData[k][0].serviceNumber || rawData[k][0].number));
           if (anyArrayKey) {
              entries = rawData[anyArrayKey];
           } else {
              throw new Error('Invalid backup format');
           }
        }
        resolve({ entries, meta });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function importBackupData(entries, meta, { services, trash, actions, isPro }, t, ph, onComplete, options = {}) {
  const { wipeFirst = false, onProgress } = options;
  try {
        if (wipeFirst) {
          const allServices = await db.getAll();
          const allTrash = await db.getTrash();
          const allIds = [...allServices, ...allTrash].map(s => s.id);
          if (allIds.length > 0) {
            if (onProgress) onProgress('Wiping old data...');
            window.dispatchEvent(new CustomEvent('global-progress', { detail: 'Wiping old data...' }));
            await actions.bulkPurge(allIds);
          }
          await db.setSetting('saved_appliances', []);
          await db.setSetting('saved_appliances_v2', []);
          await db.setSetting('notification_history', []);
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
          if (meta.language) localStorage.setItem('i18nextLng', meta.language);
          if (meta.appliances) {
            await db.setSetting('saved_appliances_v2', meta.appliances);
            await db.setSetting('saved_appliances', meta.appliances);
          }
        }

        const validEntries = entries.filter(e => e.serviceNumber && e.serviceNumber.length === 13);
        if (validEntries.length === 0) {
          toast.error(t('no_valid_services_in_backup', 'No valid service numbers found in backup'));
          window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
          return false;
        }

        if (onProgress) onProgress(`Restoring ${validEntries.length} services...`);
        window.dispatchEvent(new CustomEvent('global-progress', { detail: `Restoring ${validEntries.length} services...` }));
        let skipCount = 0;
        const toAdd = [];
        const nowMonth = new Date().toISOString().slice(0, 7);
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
              if (isCurrentPeriod) {
                if (entry.billTime) patch.billTime = entry.billTime;
                if (entry.billNoPrefix) patch.billNoPrefix = entry.billNoPrefix;
              }
              if (Object.keys(patch).length > 0) await actions.update(inActive.id, patch);
            }
            if (entry.meterReadings && entry.meterReadings.length > 0) {
              const freshReadings = entry.meterReadings.filter(r => new Date(r.date).getTime() > readingCutoff);
              if (freshReadings.length > 0) await db.setSetting(`readings_${sn}`, freshReadings);
            }
          } else {
            toAdd.push({ number: sn, label: entry.label, pinned: !!entry.pinned, entryData: entry });
          }
        }

        let successCount = 0;
        let failCount = 0;

        if (toAdd.length > 0) {
          try {
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
                 if (result._error) failCount++;
                 else {
                   successCount++;
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
                       if (freshReadings.length > 0) await db.setSetting(`readings_${result.serviceNumber}`, freshReadings);
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
              window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
              return false;
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
        return true;
  } catch (err) {
        toast.error(t('import_failed', 'Failed to restore data: ' + err.message));
        window.dispatchEvent(new CustomEvent('global-progress', { detail: null }));
        return false;
  }
}
