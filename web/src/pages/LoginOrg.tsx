import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { saveToken } from '../auth';

export function LoginOrg() {
  const [searchParams] = useSearchParams();
  const orgCodeFromUrl = (searchParams.get('orgCode') || '').trim();
  const [orgForm, setOrgForm] = useState({ orgCode: orgCodeFromUrl, pin: '', name: '', email: '' });
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [mode, setMode] = useState<'ORG' | 'ADMIN'>('ORG');
  const [error, setError] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    if (!orgCodeFromUrl) return;
    setOrgForm((prev) => ({ ...prev, orgCode: orgCodeFromUrl }));
  }, [orgCodeFromUrl]);

  const submitOrg = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      const data = await api('/auth/org-login', { method: 'POST', body: JSON.stringify(orgForm) });
      saveToken(data.token);
      nav('/org');
    } catch {
      setError('Accès refusé. Vérifiez les informations de votre organisation.');
    }
  };

  const submitAdmin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      const data = await api('/auth/admin-login', { method: 'POST', body: JSON.stringify(adminForm) });
      saveToken(data.token);
      nav('/admin');
    } catch {
      setError('Accès admin refusé. Vérifiez votre identifiant et votre mot de passe.');
    }
  };

  return (
    <div className="page-shell">
      <main className="main-content login-main-content">
        <section className="hero login-hero">
          <div className="login-brand">
            <img
              className="login-brand-logo"
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Cisco_logo_blue_2016.svg/1280px-Cisco_logo_blue_2016.svg.png"
              alt="Logo Cisco"
            />
            <div>
              <h1>Gestion de l&apos;inventaire Cisco</h1>
              <p>Portail sécurisé de validation d&apos;inventaire. Seules les organisations autorisées et les administrateurs peuvent accéder aux sections de l&apos;application.</p>
            </div>
          </div>
        </section>

        <section className="panel stack login-panel">
          <div className="login-tabs" role="tablist" aria-label="Modes de connexion">
            <button
              className={`login-tab ${mode === 'ORG' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={mode === 'ORG'}
              onClick={() => setMode('ORG')}
            >
              Connexion Établissement
            </button>
            <button
              className={`login-tab ${mode === 'ADMIN' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={mode === 'ADMIN'}
              onClick={() => setMode('ADMIN')}
            >
              Connexion Administration
            </button>
          </div>

          {mode === 'ORG' ? (
            <form onSubmit={submitOrg} className="stack" role="tabpanel">
              <input className="input" placeholder="Code organisation" value={orgForm.orgCode} onChange={(e) => setOrgForm({ ...orgForm, orgCode: e.target.value })} required />
              <input className="input" type="password" placeholder="NIP" value={orgForm.pin} onChange={(e) => setOrgForm({ ...orgForm, pin: e.target.value })} required />
              <input className="input" placeholder="Nom complet" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required />
              <input className="input" placeholder="Courriel" type="email" value={orgForm.email} onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })} required />
              <button className="button" type="submit">Accéder à mon inventaire</button>
            </form>
          ) : (
            <form onSubmit={submitAdmin} className="stack" role="tabpanel">
              <input className="input" placeholder="Identifiant admin" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} required />
              <input className="input" placeholder="Mot de passe admin" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required />
              <button className="button" type="submit">Accéder à l&apos;administration</button>
            </form>
          )}

          {error && <p>{error}</p>}
        </section>
      </main>
    </div>
  );
}
