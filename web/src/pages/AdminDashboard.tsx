import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { api, apiForm } from '../api/client';
import { AppShell } from '../components/AppShell';

type AdminView = 'LIST' | 'CREATE' | 'ADMINS';

export function AdminDashboard() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<AdminView>('CREATE');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [details, setDetails] = useState<any | null>(null);
  const [supportContactDraft, setSupportContactDraft] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryAuditLogs, setInventoryAuditLogs] = useState<any[]>([]);
  const [columnFilter, setColumnFilter] = useState('ALL');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['rowNumber', 'serialNumber', 'productId', 'productDescription', 'productType', 'architecture', 'status']);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const [orgForm, setOrgForm] = useState({ orgCode: '', regionCode: '', displayName: '', supportContactEmail: '', pin: '' });
  const [uploadOrgId, setUploadOrgId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminForm, setAdminForm] = useState({ username: '', email: '', displayName: '', password: '' });

  const loadOrgs = async () => {
    const orgData = await api('/admin/orgs');
    setOrgs(orgData);
  };

  const loadAdminUsers = async () => {
    const data = await api('/admin/admin-users');
    setAdminUsers(data);
  };

  useEffect(() => {
    Promise.all([loadOrgs(), loadAdminUsers()]).catch(() => setMessage('Impossible de charger les données d\'administration.'));
  }, []);

  const loadOrgDetails = async (orgId: string) => {
    const data = await api(`/admin/orgs/${orgId}/details`);
    setDetails(data);
    setSupportContactDraft(data.org?.supportContactEmail || '');
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
  };

  const createAdminUser = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');

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
  };

  const createOrg = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');

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
      body: JSON.stringify({ pin: orgForm.pin })
    });

    setOrgForm({ orgCode: '', regionCode: '', displayName: '', supportContactEmail: '', pin: '' });
    setView('LIST');
    setMessage('Organisation créée avec succès. Vous pouvez maintenant téléverser son inventaire depuis la liste.');
    await loadOrgs();
  };

  const openUpload = (orgId: string) => {
    setUploadOrgId(orgId);
    setBatchName('');
    setXlsx(null);
    setMessage('');
  };

  const importInventory = async () => {
    if (!uploadOrgId) {
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

    await api(`/admin/batches/${createdBatch.id}/orgs/${uploadOrgId}/access-pin`, { method: 'POST' });

    const form = new FormData();
    form.append('file', xlsx);
    const out = await apiForm(`/admin/batches/${createdBatch.id}/orgs/${uploadOrgId}/import-excel`, form, { method: 'POST' });

    setBatchName('');
    setXlsx(null);
    setUploadOrgId('');
    setMessage(`Inventaire téléversé avec succès (${out.rowCount} lignes).`);
    await loadOrgDetails(uploadOrgId);
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

  const selectedInventory = details?.inventoryFiles?.find((file: any) => file.id === selectedFileId);

  const removeItem = async (itemId: string) => {
    await api(`/admin/inventory-items/${itemId}`, { method: 'DELETE' });
    if (selectedFileId) {
      await loadInventory(selectedFileId);
    }
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

  const onFile = (e: ChangeEvent<HTMLInputElement>) => setXlsx(e.target.files?.[0] || null);

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


  return (
    <AppShell>
      <section className="hero">
        <h1>Administration</h1>
        <p>Gestion des organisations, inventaires et publication pour validation.</p>
      </section>

      <section className="panel stack">
        <h3>Organisation</h3>
        <div className="button-row">
          <button className={`button ${view === 'LIST' ? '' : 'secondary'}`} type="button" onClick={() => setView('LIST')}>
            Liste
          </button>
          <button className={`button ${view === 'CREATE' ? '' : 'secondary'}`} type="button" onClick={() => setView('CREATE')}>
            Créer
          </button>
          <button className={`button ${view === 'ADMINS' ? '' : 'secondary'}`} type="button" onClick={() => setView('ADMINS')}>
            Administrateurs
          </button>
        </div>
      </section>

      {view === 'CREATE' ? (
        <section className="panel stack">
          <h3>Créer une organisation</h3>
          <form className="stack" onSubmit={createOrg}>
            <input className="input" placeholder="Code Organisation" value={orgForm.orgCode} onChange={(e) => setOrgForm({ ...orgForm, orgCode: e.target.value })} required />
            <input className="input" placeholder="Code Region" value={orgForm.regionCode} onChange={(e) => setOrgForm({ ...orgForm, regionCode: e.target.value })} required />
            <input className="input" placeholder="Nom affiché" value={orgForm.displayName} onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })} required />
            <input className="input" type="email" placeholder="Courriel contact support (MS Teams)" value={orgForm.supportContactEmail} onChange={(e) => setOrgForm({ ...orgForm, supportContactEmail: e.target.value })} required />
            <input className="input" type="password" placeholder="NIP (Clé d'accès unique)" value={orgForm.pin} onChange={(e) => setOrgForm({ ...orgForm, pin: e.target.value })} required />
            <button className="button" type="submit">Créer l&apos;organisation</button>
          </form>
        </section>
      ) : view === 'ADMINS' ? (
        <section className="panel stack">
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
      ) : (
        <section className="panel stack">
          <h3>Liste des organisations disponibles</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code Organisation</th>
                  <th>Code Region</th>
                  <th>Nom affiché</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button className="link-button" type="button" onClick={() => loadOrgDetails(o.id)}>{o.orgCode}</button>
                    </td>
                    <td>{o.regionCode}</td>
                    <td>{o.displayName}</td>
                    <td>
                      <button className="icon-button" type="button" title="Téléverser un inventaire" onClick={() => openUpload(o.id)}>
                        ⬆️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {uploadOrgId && (
            <section className="panel stack upload-panel">
              <h3>Téléverser un inventaire</h3>
              <input className="input" placeholder="Nom de la liste d'inventaire" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
              <input className="input" type="file" accept=".xlsx,.xls" onChange={onFile} />
              <div className="button-row">
                <button className="button" type="button" onClick={importInventory}>Charger le fichier</button>
                <button className="button secondary" type="button" onClick={() => setUploadOrgId('')}>Annuler</button>
              </div>
            </section>
          )}

          {details && (
            <section className="panel stack">
              <h3>Détails de l&apos;organisation: {details.org.displayName}</h3>
              <p>Code: {details.org.orgCode} · Région: {details.org.regionCode}</p>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {selectedFileId && (
            <section className="panel stack">
              <div className="button-row">
                <h3>Détails de l&apos;inventaire</h3>
                <select className="input" value={columnFilter} onChange={(e) => setColumnFilter(e.target.value)}>
                  {availableColumns.map((column) => <option key={column} value={column}>{column === 'ALL' ? 'Toutes les colonnes' : column}</option>)}
                </select>
                <button className="button" type="button" onClick={publishInventory}>Publier pour validation</button>
                <button className="button secondary" type="button" onClick={lockInventory} disabled={!selectedInventory || selectedInventory.isLocked}>Verrouiller</button>
                <button className="button secondary" type="button" onClick={unlockInventory} disabled={!selectedInventory || !selectedInventory.isLocked}>Déverrouiller</button>
              </div>

              {selectedInventory && <p><strong>État actuel:</strong> {selectedInventory.isLocked ? 'Verrouillé' : 'Déverrouillé'} · Statut: {selectedInventory.status}</p>}

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
        </section>
      )}

      {message && (
        <section className="panel">
          <p>{message}</p>
        </section>
      )}
    </AppShell>
  );
}
