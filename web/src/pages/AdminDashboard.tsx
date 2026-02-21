import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';

export function AdminDashboard() {
  const [login, setLogin] = useState({ username: '', password: '' });
  const [orgs, setOrgs] = useState<any[]>([]);
  const [batchName, setBatchName] = useState('Inventaire Réseau 2026-Q1');

  const doLogin = async (e: FormEvent) => {
    e.preventDefault();
    const out = await api('/auth/admin-login', { method: 'POST', body: JSON.stringify(login) });
    localStorage.setItem('token', out.token);
    setOrgs(await api('/admin/orgs'));
  };

  useEffect(() => {
    api('/admin/orgs').then(setOrgs).catch(() => null);
  }, []);

  return (
    <AppShell>
      <section className="hero">
        <h1>Administration centrale</h1>
        <p>Gestion des organisations et des vagues de soumission dans un cadre visuel unifié Cisco.</p>
      </section>

      <section className="panel stack">
        <form onSubmit={doLogin} className="stack">
          <input className="input" placeholder="Username" onChange={(e) => setLogin({ ...login, username: e.target.value })} />
          <input className="input" placeholder="Password" type="password" onChange={(e) => setLogin({ ...login, password: e.target.value })} />
          <button className="button" type="submit">Connexion admin</button>
        </form>

        <div className="button-row">
          <input className="input" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          <button className="button secondary" onClick={() => api('/admin/batches', { method: 'POST', body: JSON.stringify({ name: batchName }) })}>Créer batch</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Région</th>
                <th>Type</th>
                <th>Nom</th>
                <th>Code</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.regionCode}</td>
                  <td>{o.organizationType?.code}</td>
                  <td>{o.displayName}</td>
                  <td>{o.orgCode}</td>
                  <td><span className="badge">drill={String(o.isDrill)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
