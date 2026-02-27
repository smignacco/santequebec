import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { api, apiForm, apiFormWithProgress } from '../api/client';
import { AppShell } from '../components/AppShell';

type AdminView = 'LIST' | 'CREATE' | 'ADMINS' | 'VIDEO' | 'WEBEX';

const ORG_PIN_ALLOWED_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ORG_PIN_MAX_LENGTH = 9;

const sanitizeOrgPin = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, ORG_PIN_MAX_LENGTH);

const generateRandomOrgPin = () => {
  let generatedPin = '';
  for (let i = 0; i < ORG_PIN_MAX_LENGTH; i += 1) {
    const randomIndex = Math.floor(Math.random() * ORG_PIN_ALLOWED_CHARS.length);
    generatedPin += ORG_PIN_ALLOWED_CHARS[randomIndex];
  }
  return generatedPin;
};

const INVENTORY_STATUS_LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'Non soumis',
  PUBLISHED: 'En validation',
  SUBMITTED: 'Soumis',
  CONFIRMED: 'Confirmé'
};

const formatInventoryStatus = (status?: string | null) => {
  if (!status) return 'Aucun inventaire';
  return INVENTORY_STATUS_LABELS[status] || status;
};

export function AdminDashboard() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<AdminView>('CREATE');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [details, setDetails] = useState<any | null>(null);
  const [supportContactDraft, setSupportContactDraft] = useState('');
  const [orgCodeDraft, setOrgCodeDraft] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryAuditLogs, setInventoryAuditLogs] = useState<any[]>([]);
  const [columnFilter, setColumnFilter] = useState('ALL');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['rowNumber', 'serialNumber', 'productId', 'productDescription', 'productType', 'architecture', 'status']);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const [orgForm, setOrgForm] = useState({ orgCode: '', regionCode: '', displayName: '', supportContactEmail: '', pin: '' });
  const [uploadOrgId, setUploadOrgId] = useState('');
  const [orgSort, setOrgSort] = useState<{ key: 'orgCode' | 'regionCode' | 'displayName' | 'progress' | 'latestInventoryStatus' | 'loginCount'; direction: 'asc' | 'desc' }>({ key: 'displayName', direction: 'asc' });
  const [batchName, setBatchName] = useState('');
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [xlsxToAppend, setXlsxToAppend] = useState<File | null>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminForm, setAdminForm] = useState({ username: '', email: '', displayName: '', password: '' });
  const [welcomeVideoUrlDraft, setWelcomeVideoUrlDraft] = useState('');
  const [webexEnabled, setWebexEnabled] = useState(false);
  const [webexBotToken, setWebexBotToken] = useState('');
  const [webexRoomId, setWebexRoomId] = useState('');
  const [webexNotifyOnSubmit, setWebexNotifyOnSubmit] = useState(true);
  const [webexNotifyOnHelp, setWebexNotifyOnHelp] = useState(true);
  const [webexNotifyOnLogin, setWebexNotifyOnLogin] = useState(false);
  const [webexSpaces, setWebexSpaces] = useState<Array<{ id: string; title: string }>>([]);
  const [isLoadingWebexSpaces, setIsLoadingWebexSpaces] = useState(false);
  const [welcomeVideoFile, setWelcomeVideoFile] = useState<File | null>(null);
  const [welcomeVideoUploadPercent, setWelcomeVideoUploadPercent] = useState(0);
  const [isUploadingWelcomeVideo, setIsUploadingWelcomeVideo] = useState(false);
  const [isOrgAccessLogsModalOpen, setIsOrgAccessLogsModalOpen] = useState(false);
  const [accessLogsOrg, setAccessLogsOrg] = useState<any | null>(null);
  const [orgAccessLogs, setOrgAccessLogs] = useState<any[]>([]);
  const [isBusyAction, setIsBusyAction] = useState('');

  const runBusyAction = async (key: string, callback: () => Promise<void>) => {
    if (isBusyAction) return;
    setIsBusyAction(key);
    setMessage('');
    try {
      await callback();
    } finally {
      setIsBusyAction('');
    }
  };

  const loadOrgs = async () => {
    const orgData = await api('/admin/orgs');
    setOrgs(orgData);
  };

  const loadAdminUsers = async () => {
    const data = await api('/admin/admin-users');
    setAdminUsers(data);
  };

  const loadAppSettings = async () => {
    const data = await api('/admin/app-settings');
    setWelcomeVideoUrlDraft(data?.welcomeVideoUrl || '');
    setWebexEnabled(Boolean(data?.webexEnabled));
    setWebexBotToken(data?.webexBotToken || '');
    setWebexRoomId(data?.webexRoomId || '');
    setWebexNotifyOnSubmit(data?.webexNotifyOnSubmit !== false);
    setWebexNotifyOnHelp(data?.webexNotifyOnHelp !== false);
    setWebexNotifyOnLogin(Boolean(data?.webexNotifyOnLogin));
  };

  useEffect(() => {
    Promise.all([loadOrgs(), loadAdminUsers(), loadAppSettings()]).catch(() => setMessage('Impossible de charger les données d\'administration.'));
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => {
      setMessage('');
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [message]);

  const loadOrgDetails = async (orgId: string) => {
    const data = await api(`/admin/orgs/${orgId}/details`);
    setDetails(data);
    setUploadOrgId(orgId);
    setSupportContactDraft(data.org?.supportContactEmail || '');
    setOrgCodeDraft(data.org?.orgCode || '');
    setPinDraft('');
    setSelectedOrgId(orgId);
    setSelectedFileId('');
    setInventoryItems([]);
    setInventoryAuditLogs([]);
    setColumnFilter('ALL');
    setVisibleColumns(['rowNumber', 'serialNumber', 'productId', 'productDescription', 'productType', 'architecture', 'status']);
  };

  const loadInventory = async (fileId: string) => {
    const [items, logs] = await Promise.all([
      api(`/admin/inventory-files/${fileId}/items`),
      api(`/admin/inventory-files/${fileId}/audit-logs`)
    ]);
    setSelectedFileId(fileId);
    setInventoryItems(items);
    setInventoryAuditLogs(logs);
    setColumnFilter('ALL');
    setXlsxToAppend(null);
  };

  const createAdminUser = async (e: FormEvent) => {
    e.preventDefault();
    await runBusyAction('create-admin', async () => {
      await api('/admin/admin-users', {
        method: 'POST',
        body: JSON.stringify({
          username: adminForm.username.trim(),
          email: adminForm.email.trim(),
          displayName: adminForm.displayName.trim(),
          password: adminForm.password
        })
      });

      setAdminForm({ username: '', email: '', displayName: '', password: '' });
      setMessage('Administrateur ajouté avec succès.');
      await loadAdminUsers();
    });
  };

  const createOrg = async (e: FormEvent) => {
    e.preventDefault();
    await runBusyAction('create-org', async () => {
      const createdOrg = await api('/admin/orgs', {
        method: 'POST',
        body: JSON.stringify({
          orgCode: orgForm.orgCode,
          regionCode: orgForm.regionCode,
          displayName: orgForm.displayName,
          supportContactEmail: orgForm.supportContactEmail || null,
          typeCode: 'CISSS',
          isDrill: false
        })
      });

      const createdBatch = await api('/admin/batches', {
        method: 'POST',
        body: JSON.stringify({
          name: `Accès ${orgForm.displayName}`
        })
      });

      await api(`/admin/batches/${createdBatch.id}/orgs/${createdOrg.id}/access-pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: sanitizeOrgPin(orgForm.pin) })
      });

      setOrgForm({ orgCode: '', regionCode: '', displayName: '', supportContactEmail: '', pin: '' });
      setView('LIST');
      setMessage('Organisation créée avec succès. Vous pouvez maintenant téléverser son inventaire depuis la liste.');
      await loadOrgs();
    });
  };

  const openUpload = async (orgId: string) => {
    setUploadOrgId(orgId);
    setBatchName('');
    setXlsx(null);
    setMessage('');
    await loadOrgDetails(orgId);
  };

  const generateOrgPin = () => {
    setOrgForm((current) => ({ ...current, pin: generateRandomOrgPin() }));
  };

  const importInventory = async () => {
    const targetOrgId = uploadOrgId || details?.org?.id || selectedOrgId;
    if (!targetOrgId) {
      setMessage('Veuillez sélectionner une organisation dans la liste pour téléverser un inventaire.');
      return;
    }
    if (!batchName.trim() || !xlsx) {
      setMessage('Veuillez renseigner le nom de l\'inventaire et sélectionner un fichier Excel.');
      return;
    }

    const createdBatch = await api('/admin/batches', {
      method: 'POST',
      body: JSON.stringify({ name: batchName.trim() })
    });

    await api(`/admin/batches/${createdBatch.id}/orgs/${targetOrgId}/access-pin`, { method: 'POST' });

    const form = new FormData();
    form.append('file', xlsx);
    const out = await apiForm(`/admin/batches/${createdBatch.id}/orgs/${targetOrgId}/import-excel`, form, { method: 'POST' });

    setBatchName('');
    setXlsx(null);
    setUploadOrgId('');
    setMessage(`Inventaire téléversé avec succès (${out.rowCount} lignes).`);
    await loadOrgDetails(targetOrgId);
  };

  const publishInventory = async () => {
    if (!selectedFileId) return;
    await api(`/admin/inventory-files/${selectedFileId}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ visibleColumns })
    });
    setMessage('Inventaire publié pour validation par l\'organisation.');
    if (selectedOrgId) await loadOrgDetails(selectedOrgId);
  };

  const lockInventory = async () => {
    if (!selectedFileId) return;
    await api(`/admin/inventory-files/${selectedFileId}/lock`, { method: 'PATCH' });
    setMessage('Inventaire verrouillé. L\'organisation ne peut plus faire de modifications.');
    if (selectedOrgId) await loadOrgDetails(selectedOrgId);
  };

  const unlockInventory = async () => {
    if (!selectedFileId) return;
    await api(`/admin/inventory-files/${selectedFileId}/unlock`, { method: 'PATCH' });
    setMessage('Inventaire déverrouillé. L\'organisation peut reprendre la validation.');
    if (selectedOrgId) await loadOrgDetails(selectedOrgId);
  };

  const exportSelectedInventory = async () => {
    if (!selectedFileId) return;

    const out = await api(`/admin/inventory-files/${selectedFileId}/export-excel`);
    const binary = window.atob(out.contentBase64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = out.filename || `inventaire-${selectedFileId}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setMessage('Export Excel généré avec succès.');
  };

  const importIntoSelectedInventory = async () => {
    if (!selectedFileId) return;
    if (!xlsxToAppend) {
      setMessage('Veuillez sélectionner un fichier Excel à ajouter à cet inventaire.');
      return;
    }

    const form = new FormData();
    form.append('file', xlsxToAppend);
    const out = await apiForm(`/admin/inventory-files/${selectedFileId}/import-excel`, form, { method: 'POST' });
    setXlsxToAppend(null);
    setMessage(`${out.rowCount} composantes ont été ajoutées à l'inventaire sélectionné.`);
    await loadInventory(selectedFileId);
    if (selectedOrgId) await loadOrgDetails(selectedOrgId);
  };

  const selectedInventory = details?.inventoryFiles?.find((file: any) => file.id === selectedFileId);

  const removeItem = async (itemId: string) => {
    await api(`/admin/inventory-items/${itemId}`, { method: 'DELETE' });
    if (selectedFileId) {
      await loadInventory(selectedFileId);
    }
  };

  const removeInventoryFile = async (fileId: string, inventoryName: string) => {
    const confirmed = window.confirm(`Supprimer l'inventaire « ${inventoryName} » ? Cette action est irréversible.`);
    if (!confirmed) return;

    await api(`/admin/inventory-files/${fileId}`, { method: 'DELETE' });

    if (selectedFileId === fileId) {
      setSelectedFileId('');
      setInventoryItems([]);
      setInventoryAuditLogs([]);
      setColumnFilter('ALL');
    }

    if (selectedOrgId) {
      await loadOrgDetails(selectedOrgId);
    }

    setMessage(`Inventaire « ${inventoryName} » supprimé.`);
  };

  const updateOrgCode = async () => {
    if (!selectedOrgId) return;
    if (!orgCodeDraft.trim()) {
      setMessage("Le code de l'organisation est requis.");
      return;
    }

    await api(`/admin/orgs/${selectedOrgId}/org-code`, {
      method: 'PATCH',
      body: JSON.stringify({ orgCode: orgCodeDraft.trim() })
    });
    setMessage("Code de l'organisation mis à jour.");
    await loadOrgs();
    await loadOrgDetails(selectedOrgId);
  };

  const updateSupportContact = async () => {
    if (!selectedOrgId) return;
    await api(`/admin/orgs/${selectedOrgId}/support-contact`, {
      method: 'PATCH',
      body: JSON.stringify({ supportContactEmail: supportContactDraft.trim() || null })
    });
    setMessage('Contact technique MS Teams mis à jour.');
    await loadOrgDetails(selectedOrgId);
  };

  const updateOrgPin = async () => {
    if (!selectedOrgId) return;
    if (pinDraft.trim().length < 4) {
      setMessage('Le NIP doit contenir au moins 4 caractères.');
      return;
    }

    await api(`/admin/orgs/${selectedOrgId}/access-pin`, {
      method: 'PATCH',
      body: JSON.stringify({ pin: pinDraft.trim() })
    });
    setPinDraft('');
    setMessage("NIP de l'organisation mis à jour.");
  };

  const removeOrg = async (orgId: string, displayName: string) => {
    const confirmed = window.confirm(`Supprimer l'organisation « ${displayName} » ainsi que tous ses inventaires ? Cette action est irréversible.`);
    if (!confirmed) return;

    await api(`/admin/orgs/${orgId}`, { method: 'DELETE' });

    if (selectedOrgId === orgId) {
      setSelectedOrgId('');
      setSelectedFileId('');
      setDetails(null);
      setInventoryItems([]);
      setInventoryAuditLogs([]);
      setSupportContactDraft('');
      setOrgCodeDraft('');
      setPinDraft('');
    }

    if (uploadOrgId === orgId) {
      setUploadOrgId('');
      setBatchName('');
      setXlsx(null);
    }

    setMessage(`Organisation « ${displayName} » supprimée avec ses données d'inventaire.`);
    await loadOrgs();
  };

  const uploadWelcomeVideoFile = async () => {
    if (!welcomeVideoFile) {
      setMessage('Veuillez sélectionner un fichier .mp4.');
      return;
    }

    setMessage('');
    setWelcomeVideoUploadPercent(0);
    setIsUploadingWelcomeVideo(true);

    try {
      const form = new FormData();
      form.append('file', welcomeVideoFile);
      await apiFormWithProgress('/admin/app-settings/welcome-video-file', form, (percent) => {
        setWelcomeVideoUploadPercent(percent);
      });

      setWelcomeVideoUploadPercent(100);
      setWelcomeVideoFile(null);
      setMessage('Vidéo explicative téléversée avec succès.');
      await loadAppSettings();
    } finally {
      setIsUploadingWelcomeVideo(false);
    }
  };

  const saveWebexSettings = async () => {
    await api('/admin/app-settings/webex', {
      method: 'PATCH',
      body: JSON.stringify({
        webexEnabled,
        webexBotToken: webexBotToken.trim() || null,
        webexRoomId: webexRoomId.trim() || null,
        webexNotifyOnSubmit,
        webexNotifyOnHelp,
        webexNotifyOnLogin
      })
    });
    setMessage('Configuration Webex mise à jour.');
    await loadAppSettings();
  };

  const testWebexSettings = async () => {
    const out = await api('/admin/app-settings/webex/test', { method: 'POST' });
    setMessage(out?.message || (out?.ok ? 'Connexion Webex valide.' : 'Échec de connexion Webex.'));
  };

  const loadWebexSpaces = async () => {
    setIsLoadingWebexSpaces(true);
    try {
      const token = webexBotToken.trim();
      const query = token ? `?botToken=${encodeURIComponent(token)}` : '';
      const out = await api(`/admin/app-settings/webex/spaces${query}`);
      setWebexSpaces(Array.isArray(out?.spaces) ? out.spaces : []);
      if (out?.message) {
        setMessage(out.message);
      }
    } finally {
      setIsLoadingWebexSpaces(false);
    }
  };



  const openOrgAccessLogs = async (org: any) => {
    const logs = await api(`/admin/orgs/${org.id}/access-logs`);
    setAccessLogsOrg(org);
    setOrgAccessLogs(logs);
    setIsOrgAccessLogsModalOpen(true);
  };

  const closeOrgAccessLogsModal = () => {
    setIsOrgAccessLogsModalOpen(false);
    setAccessLogsOrg(null);
    setOrgAccessLogs([]);
  };

  const resetOrgAccessLogs = async () => {
    if (!accessLogsOrg) return;
    const confirmed = window.confirm(`Réinitialiser les journaux d'accès de l'organisation « ${accessLogsOrg.displayName} » ?`);
    if (!confirmed) return;

    await api(`/admin/orgs/${accessLogsOrg.id}/access-logs`, { method: 'DELETE' });
    setOrgAccessLogs([]);
    setAccessLogsOrg((current: any) => (current ? { ...current, loginCount: 0 } : current));
    await loadOrgs();
    setMessage(`Journaux d'accès réinitialisés pour « ${accessLogsOrg.displayName} ».`);
  };


  const onFile = (e: ChangeEvent<HTMLInputElement>) => setXlsx(e.target.files?.[0] || null);
  const onAppendFile = (e: ChangeEvent<HTMLInputElement>) => setXlsxToAppend(e.target.files?.[0] || null);

  const toggleOrgSort = (key: 'orgCode' | 'regionCode' | 'displayName' | 'progress' | 'latestInventoryStatus' | 'loginCount') => {
    setOrgSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedOrgs = useMemo(() => {
    const getProgressPercent = (org: any) => {
      if (!org.latestInventoryRowCount) return 0;
      return (org.latestInventoryConfirmedCount || 0) / org.latestInventoryRowCount;
    };

    const sorted = [...orgs].sort((left, right) => {
      const direction = orgSort.direction === 'asc' ? 1 : -1;

      switch (orgSort.key) {
        case 'orgCode':
        case 'regionCode':
        case 'displayName':
        case 'latestInventoryStatus': {
          const a = String(left[orgSort.key] || '').toLocaleLowerCase('fr-CA');
          const b = String(right[orgSort.key] || '').toLocaleLowerCase('fr-CA');
          return a.localeCompare(b, 'fr-CA') * direction;
        }
        case 'loginCount':
          return ((left.loginCount || 0) - (right.loginCount || 0)) * direction;
        case 'progress':
          return (getProgressPercent(left) - getProgressPercent(right)) * direction;
        default:
          return 0;
      }
    });

    return sorted;
  }, [orgs, orgSort]);

  const inventoryDbColumns = useMemo(() => {
    const technicalColumns = new Set(['id', 'inventoryFileId', 'updatedAt', 'assetTag', 'serial', 'model', 'site', 'location']);
    const all = new Set<string>();
    inventoryItems.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (!technicalColumns.has(key)) {
          all.add(key);
        }
      });
    });
    return Array.from(all);
  }, [inventoryItems]);

  useEffect(() => {
    if (!inventoryDbColumns.length) {
      setVisibleColumns([]);
      return;
    }

    setVisibleColumns((current) => {
      const kept = current.filter((column) => inventoryDbColumns.includes(column));
      if (kept.length) return kept;
      const defaultColumns = ['rowNumber', 'serialNumber', 'productId', 'productDescription', 'productType', 'architecture', 'status'];
      const preferred = defaultColumns.filter((column) => inventoryDbColumns.includes(column));
      return preferred.length ? preferred : inventoryDbColumns.slice(0, 6);
    });
  }, [inventoryDbColumns]);

  const availableColumns = useMemo(() => ['ALL', ...inventoryDbColumns], [inventoryDbColumns]);

  const filteredItems = useMemo(() => {
    if (columnFilter === 'ALL') return inventoryItems;
    return inventoryItems.filter((item) => Boolean(item[columnFilter]));
  }, [inventoryItems, columnFilter]);

  const toggleVisibleColumn = (column: string) => {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        return current.filter((col) => col !== column);
      }
      return [...current, column];
    });
  };

  const moveColumn = (sourceColumn: string, targetColumn: string) => {
    if (sourceColumn === targetColumn) return;

    setVisibleColumns((current) => {
      const sourceIndex = current.indexOf(sourceColumn);
      const targetIndex = current.indexOf(targetColumn);
      if (sourceIndex === -1 || targetIndex === -1) return current;

      const reordered = [...current];
      reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, sourceColumn);
      return reordered;
    });
  };

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navigateToMainSection = (nextView: typeof view) => {
    setView(nextView);
    window.requestAnimationFrame(() => {
      scrollToSection('admin-main-section');
    });
  };


  return (
    <AppShell contentClassName="admin-main-content">
      <section className="hero">
        <h1>Administration</h1>
        <p>Gestion des organisations, inventaires et publication pour validation.</p>
      </section>

      {message && (
        <section className="panel admin-message-tile" role="status" aria-live="polite">
          <p>{message}</p>
          <button className="icon-button" type="button" aria-label="Fermer le message" onClick={() => setMessage('')}>
            ✕
          </button>
        </section>
      )}

      <div className="admin-layout">
        <aside className="panel stack admin-nav">
          <h3>Navigation</h3>
          <div className="stack admin-nav-links">
            <button className="button secondary" type="button" onClick={() => navigateToMainSection('VIDEO')}>Vidéo informationnelle</button>
            <button className="button secondary" type="button" onClick={() => navigateToMainSection('WEBEX')}>Intégration Webex Teams</button>
            <button className="button secondary" type="button" onClick={() => navigateToMainSection('LIST')}>Liste des organisations</button>
            <button className="button secondary" type="button" onClick={() => navigateToMainSection('CREATE')}>Créer une organisation</button>
            <button className="button secondary" type="button" onClick={() => navigateToMainSection('ADMINS')}>Gestion des administrateurs</button>
          </div>
        </aside>

        <div className="stack admin-content">
      {view === 'VIDEO' ? (
        <section id="admin-main-section" className="panel stack admin-tile">
          <h3>Vidéo informationnelle</h3>
          <label className="stack">
            Téléverser la vidéo explicative (.mp4)
            <input
              className="input"
              type="file"
              accept="video/mp4,.mp4"
              onChange={(e) => setWelcomeVideoFile(e.target.files?.[0] || null)}
            />
          </label>
          {welcomeVideoUrlDraft ? (
            <p>Vidéo active : <a href={welcomeVideoUrlDraft} target="_blank" rel="noreferrer">{welcomeVideoUrlDraft}</a></p>
          ) : (
            <p>Aucune vidéo explicative configurée.</p>
          )}
          {isUploadingWelcomeVideo && (
            <div className="stack" aria-live="polite">
              <p>Téléversement en cours : {welcomeVideoUploadPercent}%</p>
              <progress max={100} value={welcomeVideoUploadPercent} />
            </div>
          )}
          <div className="button-row">
            <button className="button" type="button" onClick={uploadWelcomeVideoFile} disabled={isUploadingWelcomeVideo}>
              {isUploadingWelcomeVideo ? `Téléversement... ${welcomeVideoUploadPercent}%` : 'Téléverser la vidéo explicative'}
            </button>
          </div>
        </section>
      ) : view === 'WEBEX' ? (
        <section id="admin-main-section" className="panel stack admin-tile">
          <h3>Intégration Webex Teams</h3>
          <label className="button-row">
            <input type="checkbox" checked={webexEnabled} onChange={(e) => setWebexEnabled(e.target.checked)} />
            <span>Activer l&apos;intégration Webex</span>
          </label>
          <input className="input" type="password" placeholder="Jeton Bot Webex" value={webexBotToken} onChange={(e) => setWebexBotToken(e.target.value)} />
          <div className="button-row">
            <select className="input" value={webexRoomId} onChange={(e) => setWebexRoomId(e.target.value)}>
              <option value="">Sélectionner une Space Webex</option>
              {webexSpaces.map((space) => (
                <option key={space.id} value={space.id}>{space.title} ({space.id})</option>
              ))}
            </select>
            <button className="button secondary" type="button" onClick={loadWebexSpaces} disabled={isLoadingWebexSpaces}>
              {isLoadingWebexSpaces ? 'Chargement...' : 'Charger les Spaces'}
            </button>
          </div>
          <input className="input" placeholder="Room/Space ID Webex" value={webexRoomId} onChange={(e) => setWebexRoomId(e.target.value)} />
          <label className="button-row">
            <input type="checkbox" checked={webexNotifyOnSubmit} onChange={(e) => setWebexNotifyOnSubmit(e.target.checked)} />
            <span>Notifier quand une organisation soumet son inventaire</span>
          </label>
          <label className="button-row">
            <input type="checkbox" checked={webexNotifyOnHelp} onChange={(e) => setWebexNotifyOnHelp(e.target.checked)} />
            <span>Notifier quand une organisation clique sur « Besoin d&apos;aide »</span>
          </label>
          <label className="button-row">
            <input type="checkbox" checked={webexNotifyOnLogin} onChange={(e) => setWebexNotifyOnLogin(e.target.checked)} />
            <span>Notifier quand un usager d&apos;organisation se connecte</span>
          </label>
          <div className="button-row">
            <button className="button" type="button" onClick={saveWebexSettings}>Enregistrer Webex</button>
            <button className="button secondary" type="button" onClick={testWebexSettings}>Tester la connexion</button>
          </div>
        </section>
      ) : view === 'CREATE' ? (
        <section id="admin-main-section" className="panel stack admin-tile">
          <h3>Créer une organisation</h3>
          <form className="stack" onSubmit={createOrg}>
            <input className="input" placeholder="Code Organisation" value={orgForm.orgCode} onChange={(e) => setOrgForm({ ...orgForm, orgCode: e.target.value })} required />
            <input className="input" placeholder="Code Region" value={orgForm.regionCode} onChange={(e) => setOrgForm({ ...orgForm, regionCode: e.target.value })} required />
            <input className="input" placeholder="Nom affiché" value={orgForm.displayName} onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })} required />
            <input className="input" type="email" placeholder="Courriel contact support (MS Teams)" value={orgForm.supportContactEmail} onChange={(e) => setOrgForm({ ...orgForm, supportContactEmail: e.target.value })} required />
            <div className="button-row">
              <input
                className="input"
                type="text"
                placeholder="NIP (max 9 caractères, minuscules, sans caractères spéciaux)"
                value={orgForm.pin}
                onChange={(e) => setOrgForm({ ...orgForm, pin: sanitizeOrgPin(e.target.value) })}
                maxLength={ORG_PIN_MAX_LENGTH}
                required
              />
              <button className="button secondary" type="button" onClick={generateOrgPin}>Générer un NIP</button>
            </div>
            <button className="button" type="submit">Créer l&apos;organisation</button>
          </form>
        </section>
      ) : view === 'ADMINS' ? (
        <section id="admin-main-section" className="panel stack admin-tile">
          <h3>Gestion des administrateurs</h3>
          <p>Ajoutez des comptes administrateurs qui pourront se connecter au portail d&apos;administration.</p>

          <section className="panel stack">
            <h4>Ajouter un administrateur</h4>
            <form className="stack" onSubmit={createAdminUser}>
              <input className="input" placeholder="Nom d&apos;utilisateur" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} required />
              <input className="input" type="email" placeholder="Courriel" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} required />
              <input className="input" placeholder="Nom affiché" value={adminForm.displayName} onChange={(e) => setAdminForm({ ...adminForm, displayName: e.target.value })} required />
              <input className="input" type="password" minLength={8} placeholder="Mot de passe (8 caractères minimum)" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required />
              <button className="button" type="submit">Créer l&apos;administrateur</button>
            </form>
          </section>

          <h4>Administrateurs existants</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom d&apos;utilisateur</th>
                  <th>Nom affiché</th>
                  <th>Courriel</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((admin) => (
                  <tr key={admin.id}>
                    <td>{admin.username}</td>
                    <td>{admin.displayName}</td>
                    <td>{admin.email}</td>
                    <td>{admin.isActive ? 'Actif' : 'Inactif'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : !details ? (
        <section id="admin-main-section" className="panel stack admin-tile">
          <h3>Liste des organisations disponibles</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><button className="header-filter" type="button" onClick={() => toggleOrgSort('orgCode')}>Code Organisation</button></th>
                  <th><button className="header-filter" type="button" onClick={() => toggleOrgSort('regionCode')}>Code Region</button></th>
                  <th><button className="header-filter" type="button" onClick={() => toggleOrgSort('displayName')}>Nom affiché</button></th>
                  <th><button className="header-filter" type="button" onClick={() => toggleOrgSort('progress')}>Progression confirmée</button></th>
                  <th><button className="header-filter" type="button" onClick={() => toggleOrgSort('latestInventoryStatus')}>Statut inventaire</button></th>
                  <th><button className="header-filter" type="button" onClick={() => toggleOrgSort('loginCount')}>Connexions</button></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrgs.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button className="link-button" type="button" onClick={() => loadOrgDetails(o.id)}>{o.orgCode}</button>
                    </td>
                    <td>{o.regionCode}</td>
                    <td>{o.displayName}</td>
                    <td>
                      {o.latestInventoryRowCount ? (
                        <div>
                          <span>{o.latestInventoryConfirmedCount || 0}/{o.latestInventoryRowCount}</span>
                          <div className="progress-track" role="progressbar" aria-valuenow={Math.round(((o.latestInventoryConfirmedCount || 0) / o.latestInventoryRowCount) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progression confirmée ${o.displayName}`}>
                            <div
                              className="progress-value"
                              style={{ width: `${Math.min(100, Math.round(((o.latestInventoryConfirmedCount || 0) / o.latestInventoryRowCount) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        '0/0'
                      )}
                    </td>
                    <td>{formatInventoryStatus(o.latestInventoryStatus)}</td>
                    <td>
                      <button className="link-button" type="button" onClick={() => openOrgAccessLogs(o)}>
                        {o.loginCount || 0}
                      </button>
                    </td>
                    <td>
                      <button className="icon-button" type="button" title="Téléverser un inventaire" onClick={() => openUpload(o.id)}>
                        ⬆️
                      </button>
                      <button className="icon-button" type="button" title="Supprimer l'organisation" onClick={() => removeOrg(o.id, o.displayName)}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>


        </section>
      ) : !selectedFileId ? (
        <section id="admin-main-section" className="panel stack admin-tile">
          <div className="button-row">
            <h3>Détails de l&apos;organisation: {details.org.displayName}</h3>
            <button className="button secondary" type="button" onClick={() => setDetails(null)}>Retour à la liste</button>
          </div>
          <p>Code: {details.org.orgCode} · Région: {details.org.regionCode}</p>
          <div className="stack">
            <label htmlFor="orgCode"><strong>Code de l&apos;organisation</strong></label>
            <div className="button-row">
              <input
                id="orgCode"
                className="input"
                type="text"
                placeholder="Code organisation"
                value={orgCodeDraft}
                onChange={(e) => setOrgCodeDraft(e.target.value)}
              />
              <button className="button" type="button" onClick={updateOrgCode}>Enregistrer</button>
            </div>
          </div>
          <div className="stack">
            <label htmlFor="supportContactEmail"><strong>Contact technique MS Teams</strong></label>
            <div className="button-row">
              <input
                id="supportContactEmail"
                className="input"
                type="email"
                placeholder="Courriel contact support (MS Teams)"
                value={supportContactDraft}
                onChange={(e) => setSupportContactDraft(e.target.value)}
              />
              <button className="button" type="button" onClick={updateSupportContact}>Enregistrer</button>
            </div>
            <p>Valeur actuelle: {details.org.supportContactEmail || 'Non configuré'}</p>
          </div>
          <div className="stack">
            <label htmlFor="orgAccessPin"><strong>NIP de l&apos;organisation</strong></label>
            <div className="button-row">
              <input
                id="orgAccessPin"
                className="input"
                type="password"
                placeholder="Nouveau NIP"
                value={pinDraft}
                onChange={(e) => setPinDraft(e.target.value)}
              />
              <button className="button" type="button" onClick={updateOrgPin}>Modifier le NIP</button>
            </div>
            <p>Le NIP n&apos;est jamais affiché pour des raisons de sécurité.</p>
          </div>
          <h4>Inventaires chargés</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Statut</th>
                  <th>Total</th>
                  <th>Confirmés</th>
                  <th>Verrouillage</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {details.inventoryFiles.map((f: any) => (
                  <tr key={f.id}>
                    <td><button className="link-button" type="button" onClick={() => loadInventory(f.id)}>{f.name}</button></td>
                    <td>{f.status}</td>
                    <td>{f.rowCount}</td>
                    <td>{f.confirmedCount}</td>
                    <td>{f.isLocked ? 'Verrouillé' : 'Déverrouillé'}</td>
                    <td>
                      <button className="button danger" type="button" onClick={() => removeInventoryFile(f.id, f.name)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="panel stack upload-panel">
              <h3>Téléverser un inventaire</h3>
              <input className="input" placeholder="Nom de la liste d'inventaire" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
              <input className="input" type="file" accept=".xlsx,.xls" onChange={onFile} />
              <div className="button-row">
                <button className="button" type="button" onClick={importInventory}>Charger le fichier</button>
                <button className="button secondary" type="button" onClick={() => { setBatchName(''); setXlsx(null); }}>Réinitialiser</button>
              </div>
          </section>
        </section>
      ) : (
        <section id="admin-main-section" className="panel stack admin-tile">
          <div className="button-row">
            <h3>Détails de l&apos;inventaire</h3>
            <button className="button secondary" type="button" onClick={() => setSelectedFileId('')}>Retour à l&apos;organisation</button>
            <select className="input" value={columnFilter} onChange={(e) => setColumnFilter(e.target.value)}>
              {availableColumns.map((column) => <option key={column} value={column}>{column === 'ALL' ? 'Toutes les colonnes' : column}</option>)}
            </select>
            <button className="button" type="button" onClick={publishInventory}>Publier pour validation</button>
            <button
              className="button secondary"
              type="button"
              onClick={exportSelectedInventory}
              disabled={!selectedInventory || selectedInventory.status !== 'CONFIRMED'}
            >
              Exporter Excel (.xlsx)
            </button>
            <button className="button secondary" type="button" onClick={lockInventory} disabled={!selectedInventory || selectedInventory.isLocked}>Verrouiller</button>
            <button className="button secondary" type="button" onClick={unlockInventory} disabled={!selectedInventory || !selectedInventory.isLocked}>Déverrouiller</button>
          </div>

          {selectedInventory && <p><strong>État actuel:</strong> {selectedInventory.isLocked ? 'Verrouillé' : 'Déverrouillé'} · Statut: {selectedInventory.status}</p>}

          <div className="stack">
            <h4>Ajouter des composantes depuis Excel</h4>
            <p>Importez un fichier Excel pour ajouter de nouvelles lignes à cet inventaire déjà chargé.</p>
            <div className="button-row">
              <input className="input" type="file" accept=".xlsx,.xls" onChange={onAppendFile} />
              <button className="button" type="button" onClick={importIntoSelectedInventory}>Ajouter à cet inventaire</button>
            </div>
          </div>

          <div className="stack">
            <h4>Colonnes affichées</h4>
            <p>Activez les colonnes puis cliquez-déplacez les étiquettes ci-dessous pour réordonner l&apos;affichage.</p>
            <div className="button-row">
              {inventoryDbColumns.map((column) => (
                <label key={column} className="link-button" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(column)}
                    onChange={() => toggleVisibleColumn(column)}
                  />
                  {column}
                </label>
              ))}
            </div>
            <div className="button-row">
              {visibleColumns.map((column) => (
                <button
                  key={column}
                  className="button secondary"
                  type="button"
                  draggable
                  onDragStart={() => setDraggedColumn(column)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedColumn) return;
                    moveColumn(draggedColumn, column);
                    setDraggedColumn(null);
                  }}
                  onDragEnd={() => setDraggedColumn(null)}
                >
                  ↕ {column}
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    {visibleColumns.map((column) => (
                      <td key={`${item.id}-${column}`}>{item[column] ?? '-'}</td>
                    ))}
                    <td>
                      <button className="button danger" type="button" onClick={() => removeItem(item.id)}>Retirer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stack">
            <h4>Journal d'audit de soumission</h4>
            {!inventoryAuditLogs.length && <p>Aucune soumission enregistrée pour cet inventaire.</p>}
            {!!inventoryAuditLogs.length && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Usager</th>
                      <th>Courriel</th>
                      <th>Date/heure</th>
                      <th>Adresse IP</th>
                      <th>Navigateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryAuditLogs.map((log) => {
                      let details: any = {};
                      try {
                        details = JSON.parse(log.detailsJson || '{}');
                      } catch {
                        details = {};
                      }

                      return (
                        <tr key={log.id}>
                          <td>{log.action}</td>
                          <td>{log.actorName || '-'}</td>
                          <td>{log.actorEmail || '-'}</td>
                          <td>{new Date(log.createdAt).toLocaleString('fr-CA')}</td>
                          <td>{details.ipAddress || '-'}</td>
                          <td>{details.userAgent || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
        </div>
      </div>



      {isOrgAccessLogsModalOpen && accessLogsOrg && (
        <div className="modal-backdrop" role="presentation" onClick={closeOrgAccessLogsModal}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Journaux d'accès" onClick={(event) => event.stopPropagation()}>
            <div className="stack">
              <h3>Journaux d&apos;accès · {accessLogsOrg.displayName}</h3>
              <p>Nombre total de connexions: <strong>{accessLogsOrg.loginCount || 0}</strong></p>
              <div className="button-row">
                <button className="button danger" type="button" onClick={resetOrgAccessLogs}>Ré-initialiser les journaux</button>
                <button className="button secondary" type="button" onClick={closeOrgAccessLogsModal}>Fermer</button>
              </div>

              {!orgAccessLogs.length && <p>Aucune connexion enregistrée pour cette organisation.</p>}
              {!!orgAccessLogs.length && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date/heure</th>
                        <th>Nom</th>
                        <th>Courriel</th>
                        <th>Adresse IP</th>
                        <th>Fureteur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgAccessLogs.map((log) => {
                        let details: any = {};
                        try {
                          details = JSON.parse(log.detailsJson || '{}');
                        } catch {
                          details = {};
                        }

                        return (
                          <tr key={log.id}>
                            <td>{new Date(log.createdAt).toLocaleString('fr-CA')}</td>
                            <td>{log.actorName || '-'}</td>
                            <td>{log.actorEmail || '-'}</td>
                            <td>{details.ipAddress || '-'}</td>
                            <td>{details.userAgent || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

    </AppShell>
  );
}
