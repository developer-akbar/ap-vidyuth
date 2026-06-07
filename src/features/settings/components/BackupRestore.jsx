import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiUpload } from 'react-icons/fi';
import { SettingsItem } from './SettingsItem.jsx';
import { useElectricityServices } from '../../electricity/hooks/useElectricityServices.js';
import toast from 'react-hot-toast';
import { usePostHog } from '@posthog/react';

export function BackupRestore() {
  const { t } = useTranslation();
  const { services, trash, actions } = useElectricityServices();
  const fileInputRef = useRef(null);
  const ph = usePostHog();
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = () => {
    const activeServices = services.filter(s => !s.isDeleted);
    const data = activeServices.map(s => ({
      label: s.label,
      serviceNumber: s.serviceNumber,
      pinned: s.pinned
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().getTime();
    const link = document.createElement('a');
    link.href = url;
    link.download = `ap_vidyuth_apspdcl_bills_backup_${timestamp}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    if (ph) ph.capture('data_exported', { count: data.length });
    toast.success(`${data.length} services exported successfully`);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsImporting(true);
        const data = JSON.parse(event.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid backup format');
        
        const entries = data.map(item => ({
          label: item.label || '',
          number: item.serviceNumber,
          pinned: !!item.pinned
        })).filter(e => e.number && e.number.length === 13);

        if (entries.length === 0) {
          toast.error(t('no_valid_services_in_backup', 'No valid service numbers found in backup'));
          return;
        }

        const toastId = toast.loading(`Importing ${entries.length} services...`);
        let successCount = 0;
        let skipCount = 0;

        for (const entry of entries) {
          const sn = entry.number;
          const inActive = services.find(s => s.serviceNumber === sn);
          const inTrash = trash.find(t => t.serviceNumber === sn);
          
          if (inActive || inTrash) { 
            skipCount++; 
            continue; 
          }

          try {
            await actions.add({ isBulk: false, serviceNumber: sn, label: entry.label, pinned: !!entry.pinned });
            successCount++;
          } catch (err) {
            if (err?.message !== 'CANCELLED') {
              console.error('Failed to import', sn, err);
            }
          }
        }

        toast.success(`Imported ${successCount} new services. ${skipCount > 0 ? `Skipped ${skipCount} existing.` : ''}`, { id: toastId });
        if (ph) ph.capture('data_imported', { count: successCount });
      } catch (err) {
        toast.error(t('import_failed', 'Failed to read backup file'));
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <SettingsItem 
        icon={FiDownload} 
        label={t('backup', 'Backup Data')} 
        description="Save your services to a file"
        onClick={handleExport}
        color="var(--blue)"
      />
      <SettingsItem 
        icon={FiUpload} 
        label={t('restore', 'Restore Data')} 
        description="Load services from a backup"
        onClick={() => {
          if (!isImporting && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        color="var(--green)"
      />
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".json" 
        onChange={handleImport} 
      />
    </>
  );
}
