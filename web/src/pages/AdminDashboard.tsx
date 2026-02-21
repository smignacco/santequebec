import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { api, apiForm } from '../api/client';
import { AppShell } from '../components/AppShell';

type AdminView = 'LIST' | 'CREATE';

export function AdminDashboard() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<AdminView>('CREATE');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [details, setDetails] = useState<any | null>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [columnFilter, setColumnFilter] = useState('ALL');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['rowNumber', 'assetTag', 'serial', 'status']);

  const [orgForm, setOrgForm] = useState({ orgCode: '', regionCode: '', displayName: '', pin: '' });
  const [uploadOrgId, setUploadOrgId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [xlsx, setXlsx] = useState<File | null>(null);

  const loadOrgs = async () => {
    const orgData = await api('/admin/orgs');
    setOrgs(orgData);
  };

  useEffect(() => {
    loadOrgs().catch(() => setMessage('Impossible de charger la liste des organisations.'));
  }, []);

  const loadOrgDetails = async (orgId: string) => {
    const data = await api(`/admin/orgs/${orgId}/details`);
    setDetails(data);
    setSelectedOrgId(orgId);
    setSelectedFileId('');
    setInventoryItems([]);
    setColumnFilter('ALL');
    setVisibleColumns(['rowNumber', 'assetTag', 'serial', 'status']);
  };

  const loadInventory = async (fileId: string) => {
    const items = await api(`/admin/inventory-files/${fileId}/items`);
    setSelectedFileId(fileId);
    setInventoryItems(items);
    setColumnFilter('ALL');
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

    setOrgForm({ orgCode: '', regionCode: '', displayName: '', pin: '' });
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
    await api(`/admin/inventory-files/${selectedFileId}/publish`, { method: 'PATCH' });
    setMessage('Inventaire publié pour validation par l\'organisation.');
    if (selectedOrgId) await loadOrgDetails(selectedOrgId);
  };

  const removeItem = async (itemId: string) => {
    await api(`/admin/inventory-items/${itemId}`, { method: 'DELETE' });
    if (selectedFileId) {
      await loadInventory(selectedFileId);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => setXlsx(e.target.files?.[0] || null);

  const inventoryDbColumns = useMemo(() => {
    const technicalColumns = new Set(['id', 'inventoryFileId', 'updatedAt']);
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
      return inventoryDbColumns.slice(0, 6);
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
        </div>
      </section>

      {view === 'CREATE' ? (
        <section className="panel stack">
          <h3>Créer une organisation</h3>
          <form className="stack" onSubmit={createOrg}>
            <input className="input" placeholder="Code Organisation" value={orgForm.orgCode} onChange={(e) => setOrgForm({ ...orgForm, orgCode: e.target.value })} required />
            <input className="input" placeholder="Code Region" value={orgForm.regionCode} onChange={(e) => setOrgForm({ ...orgForm, regionCode: e.target.value })} required />
            <input className="input" placeholder="Nom affiché" value={orgForm.displayName} onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })} required />
            <input className="input" placeholder="NIP (Clé d'accès unique)" value={orgForm.pin} onChange={(e) => setOrgForm({ ...orgForm, pin: e.target.value })} required />
            <button className="button" type="submit">Créer l&apos;organisation</button>
          </form>
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
              <h4>Inventaires chargés</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Statut</th>
                      <th>Total</th>
                      <th>Confirmés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.inventoryFiles.map((f: any) => (
                      <tr key={f.id}>
                        <td><button className="link-button" type="button" onClick={() => loadInventory(f.id)}>{f.name}</button></td>
                        <td>{f.status}</td>
                        <td>{f.rowCount}</td>
                        <td>{f.confirmedCount}</td>
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
              </div>

              <div className="stack">
                <h4>Colonnes affichées</h4>
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
