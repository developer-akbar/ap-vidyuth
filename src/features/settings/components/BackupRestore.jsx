import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiUpload, FiTrash2 } from 'react-icons/fi';
import { SettingsItem } from './SettingsItem.jsx';
import { useElectricityServices } from '../../electricity/hooks/useElectricityServices.js';
import { db } from '../../../shared/db/storage.js';
import toast from 'react-hot-toast';
import { usePostHog } from '@posthog/react';
import { importBackupData } from '../../../shared/utils/backupRestore.js';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog.jsx';
import { RestoreDialog } from './RestoreDialog.jsx';

export function BackupRestore() {
  const { t } = useTranslation();
  const context = useElectricityServices();
  const { services, trash, actions } = context;
  const fileInputRef = useRef(null);
  const ph = usePostHog();
  const [isImporting, setIsImporting] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [restoreState, setRestoreState] = useState({ open: false, file: null });

  const handleExport = async () => {
    const activeServices = services.filter(s => !s.isDeleted);
    
    const servicesData = await Promise.all(activeServices.map(async s => {
      const readings = await db.getSetting(`readings_${s.serviceNumber}`) || [];
      return {
        serviceNumber: s.serviceNumber,
        label: s.label,
        customerName: s.customerName,
        pinned: s.pinned,
        billTime: s.billTime,
        meterReadings: readings
      };
    }));

    // Generate backward-compatible array format
    // Old app will ignore the metadata object because it lacks a 13-digit serviceNumber
    const data = [
      {
        _meta: true,
        version: 2,
        theme: localStorage.getItem('theme') || 'light',
        language: localStorage.getItem('i18nextLng') || 'en',
        appliances: await db.getSetting('saved_appliances') || []
      },
      ...servicesData
    ];
    
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
    
    if (ph) ph.capture('data_exported', { count: activeServices.length });
    toast.success(`${activeServices.length} services exported successfully`);
  };

  const executeRestore = async (file, wipeFirst) => {
    setIsImporting(true);
    try {
      await importBackupData(file, context, t, ph, () => {
        window.dispatchEvent(new CustomEvent('app-navigate', { detail: { page: 'electricity' } }));
      }, { wipeFirst });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const hasData = services.length > 0 || trash.length > 0;
    
    if (hasData) {
      setRestoreState({ open: true, file });
    } else {
      executeRestore(file, false);
    }
  };

  const handleWipeData = () => {
    setConfirmState({
      open: true,
      title: 'Wipe all data?',
      description: 'This will completely erase all your saved services, history, and settings from this device. We highly recommend backing up your data first.\n\nAre you absolutely sure?',
      isDanger: true,
      onConfirm: async () => {
        const toastId = toast.loading('Wiping data...');
        try {
          const allServices = await db.getAll();
          const allTrash = await db.getTrash();
          const allIds = [...allServices, ...allTrash].map(s => s.id);
          
          await actions.bulkPurge(allIds);
          
          // Clear some specific settings
          await db.setSetting('saved_appliances', []);
          await db.setSetting('notification_history', []);
          
          toast.success('All data wiped successfully', { id: toastId });
          if (ph) ph.capture('data_wiped');
          
          window.dispatchEvent(new CustomEvent('app-navigate', { detail: { page: 'electricity' } }));
        } catch (e) {
          toast.error('Failed to wipe data', { id: toastId });
        }
      }
    });
  };

  return (
    <>
      <SettingsItem 
        icon={FiDownload} 
        label={t('backup', 'Backup Data')} 
        description="Save your services and settings to a file"
        onClick={handleExport}
        color="var(--blue)"
      />
      <SettingsItem 
        icon={FiUpload} 
        label={t('restore', 'Restore Data')} 
        description="Load services and settings from a backup"
        onClick={() => {
          if (!isImporting && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        color="var(--green)"
      />
      <SettingsItem 
        icon={FiTrash2} 
        label="Wipe Data" 
        description="Delete all services, history, and settings permanently"
        onClick={handleWipeData}
        color="var(--red)"
      />
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".json" 
        onChange={handleImport} 
      />
      <ConfirmDialog 
        open={confirmState.open} 
        title={confirmState.title} 
        description={confirmState.description} 
        isDanger={confirmState.isDanger} 
        onClose={() => setConfirmState(prev => ({ ...prev, open: false }))} 
        onConfirm={confirmState.onConfirm} 
      />
      <RestoreDialog
        open={restoreState.open}
        onClose={() => setRestoreState({ open: false, file: null })}
        onConfirm={() => {
          if (restoreState.file) executeRestore(restoreState.file, true);
        }}
      />
    </>
  );
}
