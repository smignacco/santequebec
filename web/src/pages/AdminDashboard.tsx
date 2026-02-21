import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

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
  useEffect(() => { api('/admin/orgs').then(setOrgs).catch(() => null); }, []);

  return <div><h1>Admin</h1><form onSubmit={doLogin}><input placeholder='username' onChange={(e) => setLogin({ ...login, username: e.target.value })} /><input placeholder='password' type='password' onChange={(e) => setLogin({ ...login, password: e.target.value })} /><button>Login</button></form><button onClick={() => api('/admin/batches', { method: 'POST', body: JSON.stringify({ name: batchName }) })}>Créer batch</button><input value={batchName} onChange={(e) => setBatchName(e.target.value)} /><ul>{orgs.map((o) => <li key={o.id}>{o.regionCode} - {o.organizationType?.code} - {o.displayName} ({o.orgCode}) drill={String(o.isDrill)}</li>)}</ul></div>;
}
