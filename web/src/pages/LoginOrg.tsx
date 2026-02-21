import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';

type PublicOrg = {
  displayName: string;
  orgCode: string;
};

export function LoginOrg() {
  const [form, setForm] = useState({ orgCode: '', pin: '', name: '', email: '' });
  const [orgs, setOrgs] = useState<PublicOrg[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    api('/public/orgs')
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = await api('/auth/org-login', { method: 'POST', body: JSON.stringify(form) });
    localStorage.setItem('token', data.token);
    nav('/org');
  };

  return (
    <AppShell>
      <section className="hero">
        <h1>Portail de validation d&apos;inventaire</h1>
        <p>Expérience harmonisée avec les standards Cisco pour le déploiement Santé Québec.</p>
      </section>
      <section className="panel">
        <form onSubmit={submit} className="stack">
          <select
            className="input"
            value={form.orgCode}
            onChange={(e) => setForm({ ...form, orgCode: e.target.value })}
            required
          >
            <option value="">Sélectionner une organisation</option>
            {orgs.map((org) => (
              <option key={org.orgCode} value={org.orgCode}>
                {org.displayName} ({org.orgCode})
              </option>
            ))}
          </select>
          <input className="input" placeholder="NIP" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          <input className="input" placeholder="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Courriel" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="button-row">
            <button className="button" type="submit">Se connecter</button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
