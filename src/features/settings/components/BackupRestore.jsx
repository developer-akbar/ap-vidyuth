import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiUpload, FiTrash2 } from 'react-icons/fi';
import { SettingsItem } from './SettingsItem.jsx';
import { db } from '../../../shared/db/storage.js';
import toast from 'react-hot-toast';
import { usePostHog } from '@posthog/react';
import { importBackupData } from '../../../shared/utils/backupRestore.js';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog.jsx';
import { RestoreDialog } from './RestoreDialog.jsx';
import { ExportDialog } from './ExportDialog.jsx';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

export function BackupRestore({ electricityContext }) {
  const { t } = useTranslation();
  const context = electricityContext;
  const { services, trash, actions } = context;
  const fileInputRef = useRef(null);
  const ph = usePostHog();
  const [isImporting, setIsImporting] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', isDanger: false, onConfirm: () => {} });
  const [restoreState, setRestoreState] = useState({ open: false, file: null });
  const [exportState, setExportState] = useState({ open: false, blob: null, filename: '', activeCount: 0 });

  const prepareExport = async () => {
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
    const timestamp = new Date().getTime();
    const filename = `ap_vidyuth_apspdcl_bills_backup_${timestamp}.json`;
    
    setExportState({ open: true, blob, filename, activeCount: activeServices.length });
  };

  const handleSaveToDevice = () => {
    if (!exportState.blob) return;
    const url = URL.createObjectURL(exportState.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportState.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    if (ph) ph.capture('data_exported', { count: exportState.activeCount, method: 'save' });
    toast.success(`${exportState.activeCount} services exported successfully`);
  };

  const handleExportCsv = async () => {
    const activeServices = services.filter(s => !s.isDeleted);
    
    // Define CSV Headers
    const headers = ['Service Number', 'Label', 'Customer Name', 'Category', 'Section Name', 'Last Amount Due', 'Last Billed Units', 'Status'];
    
    // Format rows
    const rows = activeServices.map(s => {
      return [
        s.serviceNumber,
        s.label || '',
        s.customerName || '',
        s.category || '',
        s.sectionName || '',
        s.lastAmountDue || '',
        s.lastBilledUnits || '',
        s.lastStatus || ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','); // Escape quotes and wrap in quotes
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().getTime();
    link.href = url;
    link.download = `ap_vidyuth_services_${timestamp}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    if (ph) ph.capture('data_exported_csv', { count: activeServices.length });
    toast.success(`${activeServices.length} services exported as CSV`);
  };

  const handleShareFile = async () => {
    if (!exportState.blob) return;
    
    const safeFilename = exportState.filename.replace('.json', '.txt');

    if (Capacitor.getPlatform() !== 'web') {
      try {
        // Convert Blob to Base64
        const base64data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(exportState.blob);
        });

        // Write file to Cache directory
        const savedFile = await Filesystem.writeFile({
          path: safeFilename,
          data: base64data,
          directory: Directory.Cache
        });

        // Share the file URL using Capacitor Share
        await Share.share({
          title: 'AP Vidyuth Backup',
          text: 'Here is my backup data for AP Vidyuth.',
          url: savedFile.uri,
          dialogTitle: 'Share Backup'
        });

        if (ph) ph.capture('data_exported', { count: exportState.activeCount, method: 'share_native' });
        toast.success('Backup shared successfully');
      } catch (err) {
        console.error('Native share failed', err);
        toast.error('Sharing failed. Try Saving to Device instead.');
      }
    } else {
      // Web Share API fallback
      const file = new File([exportState.blob], safeFilename, { type: 'text/plain' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'AP Vidyuth Backup',
            text: 'Here is my backup data for AP Vidyuth.',
          });
          if (ph) ph.capture('data_exported', { count: exportState.activeCount, method: 'share_web' });
          toast.success('Backup shared successfully');
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('Share failed', err);
            toast.error('Sharing failed. Try Saving to Device instead.');
          }
        }
      } else {
        toast.error('File sharing is not supported on this device/browser. Please save to device instead.');
      }
    }
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

    // Read file for preview
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawData = JSON.parse(event.target.result);
        let entries = [];
        if (Array.isArray(rawData)) {
           entries = rawData.filter(item => !item._meta).map(item => ({
             ...item,
             serviceNumber: item.serviceNumber || item.number
           }));
        } else if (rawData.version === 2 || rawData.services) {
           entries = rawData.services || [];
        } else if (rawData['ap-vidyuth-services'] || rawData['my-dashboard-services']) {
           entries = rawData['ap-vidyuth-services'] || rawData['my-dashboard-services'] || [];
        } else {
           const anyArrayKey = Object.keys(rawData).find(k => Array.isArray(rawData[k]) && rawData[k].length > 0 && (rawData[k][0].serviceNumber || rawData[k][0].number));
           if (anyArrayKey) entries = rawData[anyArrayKey];
        }
        
        const validEntries = entries.filter(e => e.serviceNumber && e.serviceNumber.length === 13);
        const hasData = services.length > 0 || trash.length > 0;
        
        setRestoreState({ open: true, file, previewCount: validEntries.length, hasData });
      } catch (err) {
        toast.error('Invalid backup file');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
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
        onClick={prepareExport}
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
        accept=".json,.txt" 
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
      <ExportDialog
        open={exportState.open}
        onClose={() => setExportState(prev => ({ ...prev, open: false }))}
        onSave={handleSaveToDevice}
        onShare={handleShareFile}
        onExportCsv={handleExportCsv}
      />
    </>
  );
}
