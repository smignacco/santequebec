import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { api, apiForm } from '../api/client';
import { AppShell } from '../components/AppShell';

export function AdminDashboard() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const [batchName, setBatchName] = useState('Inventaire Réseau 2026-Q1');
  const [orgForm, setOrgForm] = useState({ orgCode: '', regionCode: '', displayName: '', typeCode: 'CISSS', isDrill: false });
  const [assignment, setAssignment] = useState({ batchId: '', orgId: '' });
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [generatedPin, setGeneratedPin] = useState('');

  const load = async () => {
    const [orgData, typeData, batchData] = await Promise.all([api('/admin/orgs'), api('/admin/org-types'), api('/admin/batches')]);
    setOrgs(orgData);
    setTypes(typeData);
    setBatches(batchData);
    setAssignment((current) => ({
      batchId: current.batchId || batchData[0]?.id || '',
      orgId: current.orgId || orgData[0]?.id || ''
    }));
  };

  useEffect(() => {
    load().catch(() => setMessage('Impossible de charger les données admin.'));
  }, []);

  const createBatch = async () => {
    await api('/admin/batches', { method: 'POST', body: JSON.stringify({ name: batchName }) });
    setMessage('Batch créé.');
    await load();
  };

  const createOrg = async (e: FormEvent) => {
    e.preventDefault();
    await api('/admin/orgs', { method: 'POST', body: JSON.stringify(orgForm) });
    setMessage('Organisation créée.');
    setOrgForm({ orgCode: '', regionCode: '', displayName: '', typeCode: orgForm.typeCode, isDrill: false });
    await load();
  };

  const prepareAccess = async () => {
    if (!assignment.batchId || !assignment.orgId) return;
    const out = await api(`/admin/batches/${assignment.batchId}/orgs/${assignment.orgId}/access-pin`, { method: 'POST' });
    setGeneratedPin(out.pin);
    setMessage('NIP régénéré pour l\'organisation sélectionnée.');
  };

  const importInventory = async () => {
    if (!assignment.batchId || !assignment.orgId || !xlsx) return;
    const form = new FormData();
    form.append('file', xlsx);
    const out = await apiForm(`/admin/batches/${assignment.batchId}/orgs/${assignment.orgId}/import-excel`, form, { method: 'POST' });
    setMessage(`Inventaire importé (${out.rowCount} lignes).`);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => setXlsx(e.target.files?.[0] || null);

  return (
    <AppShell>
      <section className="hero">
        <h1>Administration centrale</h1>
        <p>Création d&apos;organisations et chargement d&apos;inventaires XLSX pour validation ciblée par organisation.</p>
      </section>

      <section className="panel stack">
        <h3>Créer une organisation</h3>
        <form className="stack" onSubmit={createOrg}>
          <input className="input" placeholder="Code organisation (ex: 06-CIUSSS-CENTRE-SUD)" value={orgForm.orgCode} onChange={(e) => setOrgForm({ ...orgForm, orgCode: e.target.value })} required />
          <input className="input" placeholder="Code région (ex: 06)" value={orgForm.regionCode} onChange={(e) => setOrgForm({ ...orgForm, regionCode: e.target.value })} required />
          <input className="input" placeholder="Nom affiché" value={orgForm.displayName} onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })} required />
          <select className="input" value={orgForm.typeCode} onChange={(e) => setOrgForm({ ...orgForm, typeCode: e.target.value })}>
            {types.map((t) => <option key={t.id} value={t.code}>{t.code}</option>)}
          </select>
          <label>
            <input type="checkbox" checked={orgForm.isDrill} onChange={(e) => setOrgForm({ ...orgForm, isDrill: e.target.checked })} /> Organisation de drill
          </label>
          <button className="button" type="submit">Créer l&apos;organisation</button>
        </form>
      </section>

      <section className="panel stack">
        <h3>Préparer un inventaire à valider</h3>
        <div className="button-row">
          <input className="input" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          <button className="button secondary" type="button" onClick={createBatch}>Créer batch</button>
        </div>
        <select className="input" value={assignment.batchId} onChange={(e) => setAssignment({ ...assignment, batchId: e.target.value })}>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input" value={assignment.orgId} onChange={(e) => setAssignment({ ...assignment, orgId: e.target.value })}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.displayName} ({o.orgCode})</option>)}
        </select>

        <div className="button-row">
          <button className="button" type="button" onClick={prepareAccess}>Générer NIP d&apos;accès</button>
          {generatedPin && <span className="badge">NIP: {generatedPin}</span>}
        </div>

        <input className="input" type="file" accept=".xlsx,.xls" onChange={onFile} />
        <button className="button" type="button" onClick={importInventory}>Charger le fichier XLSX</button>
      </section>

      <section className="panel stack">
        <h3>Organisations</h3>
        {message && <p>{message}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Région</th>
                <th>Type</th>
                <th>Nom</th>
                <th>Code</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.regionCode}</td>
                  <td>{o.organizationType?.code}</td>
                  <td>{o.displayName}</td>
                  <td>{o.orgCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
