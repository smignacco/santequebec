import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { api, apiForm } from '../api/client';
import { AppShell } from '../components/AppShell';

type AdminView = 'LIST' | 'CREATE';

export function AdminDashboard() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<AdminView>('CREATE');

  const [orgForm, setOrgForm] = useState({ orgCode: '', regionCode: '', displayName: '', pin: '' });
  const [batchName, setBatchName] = useState('');
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [lastCreatedOrgId, setLastCreatedOrgId] = useState('');

  const loadOrgs = async () => {
    const orgData = await api('/admin/orgs');
    setOrgs(orgData);
  };

  useEffect(() => {
    loadOrgs().catch(() => setMessage('Impossible de charger la liste des organisations.'));
  }, []);

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

    setLastCreatedOrgId(createdOrg.id);
    setOrgForm({ orgCode: '', regionCode: '', displayName: '', pin: '' });
    setMessage('Organisation créée avec succès.');
    await loadOrgs();
  };

  const importInventory = async () => {
    if (!lastCreatedOrgId) {
      setMessage('Veuillez créer une organisation avant de téléverser un inventaire.');
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

    await api(`/admin/batches/${createdBatch.id}/orgs/${lastCreatedOrgId}/access-pin`, { method: 'POST' });

    const form = new FormData();
    form.append('file', xlsx);
    const out = await apiForm(`/admin/batches/${createdBatch.id}/orgs/${lastCreatedOrgId}/import-excel`, form, { method: 'POST' });

    setBatchName('');
    setXlsx(null);
    setMessage(`Inventaire téléversé avec succès (${out.rowCount} lignes).`);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => setXlsx(e.target.files?.[0] || null);

  return (
    <AppShell>
      <section className="hero">
        <h1>Administration</h1>
        <p>Gestion des organisations et téléversement d&apos;inventaire.</p>
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

          <h3>Volet facultatif</h3>
          <input className="input" placeholder="Nom de l'inventaire chargé" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          <input className="input" type="file" accept=".xlsx,.xls" onChange={onFile} />
          <button className="button" type="button" onClick={importInventory}>Téléverser</button>
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
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orgCode}</td>
                    <td>{o.regionCode}</td>
                    <td>{o.displayName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
