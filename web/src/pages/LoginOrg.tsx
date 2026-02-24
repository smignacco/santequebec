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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);
  const nav = useNavigate();

  const validateOrg = () => {
    const nextErrors: Record<string, string> = {};
    if (!orgForm.orgCode.trim()) nextErrors.orgCode = 'Le code organisation est requis.';
    if (!orgForm.pin.trim()) nextErrors.pin = 'Le NIP est requis.';
    if (!orgForm.name.trim()) nextErrors.name = 'Le nom complet est requis.';
    if (!orgForm.email.trim()) {
      nextErrors.email = 'Le courriel est requis.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orgForm.email.trim())) {
      nextErrors.email = 'Le format du courriel est invalide.';
    }
    return nextErrors;
  };

  const validateAdmin = () => {
    const nextErrors: Record<string, string> = {};
    if (!adminForm.username.trim()) nextErrors.username = 'L’identifiant admin est requis.';
    if (!adminForm.password.trim()) nextErrors.password = 'Le mot de passe est requis.';
    return nextErrors;
  };

  useEffect(() => {
    if (!orgCodeFromUrl) return;
    setOrgForm((prev) => ({ ...prev, orgCode: orgCodeFromUrl }));
  }, [orgCodeFromUrl]);

  const submitOrg = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validateOrg();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Veuillez corriger les champs en erreur.');
      return;
    }
    try {
      setIsSubmittingOrg(true);
      setError('');
      const data = await api('/auth/org-login', { method: 'POST', body: JSON.stringify(orgForm) });
      saveToken(data.token);
      nav('/org');
    } catch {
      setError('Accès refusé. Vérifiez les informations de votre organisation.');
    } finally {
      setIsSubmittingOrg(false);
    }
  };

  const submitAdmin = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors = validateAdmin();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Veuillez corriger les champs en erreur.');
      return;
    }
    try {
      setIsSubmittingAdmin(true);
      setError('');
      const data = await api('/auth/admin-login', { method: 'POST', body: JSON.stringify(adminForm) });
      saveToken(data.token);
      nav('/admin');
    } catch {
      setError('Accès admin refusé. Vérifiez votre identifiant et votre mot de passe.');
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  return (
    <div className="page-shell login-page-shell">
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
              <p>Portail sécurisé de validation d’inventaire. L’accès à cette application est réservé aux établissements autorisés et aux administrateurs.</p>
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
              {fieldErrors.orgCode && <p className="form-error">{fieldErrors.orgCode}</p>}
              <input className="input" type="password" placeholder="NIP" value={orgForm.pin} onChange={(e) => setOrgForm({ ...orgForm, pin: e.target.value })} required />
              {fieldErrors.pin && <p className="form-error">{fieldErrors.pin}</p>}
              <input className="input" placeholder="Nom complet" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required />
              {fieldErrors.name && <p className="form-error">{fieldErrors.name}</p>}
              <input className="input" placeholder="Courriel" type="email" value={orgForm.email} onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })} required />
              {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
              <button className="button" type="submit" disabled={isSubmittingOrg}>{isSubmittingOrg ? 'Connexion…' : 'Accéder à mon inventaire'}</button>
            </form>
          ) : (
            <form onSubmit={submitAdmin} className="stack" role="tabpanel">
              <input className="input" placeholder="Identifiant admin" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} required />
              {fieldErrors.username && <p className="form-error">{fieldErrors.username}</p>}
              <input className="input" placeholder="Mot de passe admin" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required />
              {fieldErrors.password && <p className="form-error">{fieldErrors.password}</p>}
              <button className="button" type="submit" disabled={isSubmittingAdmin}>{isSubmittingAdmin ? 'Connexion…' : "Accéder à l'administration"}</button>
            </form>
          )}

          {error && <p className="form-error">{error}</p>}
        </section>
      </main>
      <footer className="login-footer-note">©2026 Cisco Systems, Inc.</footer>
    </div>
  );
}
