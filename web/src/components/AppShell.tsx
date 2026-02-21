import { PropsWithChildren } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

export function AppShell({ children, contentClassName }: PropsWithChildren<{ contentClassName?: string }>) {
  const navigate = useNavigate();

  const logout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="page-shell">
      <header className="top-nav">
        <div className="brand">
          <img
            className="brand-logo"
            src="https://companieslogo.com/img/orig/CSCO.D-2114e564.png?t=1728111511"
            alt="Cisco logo"
          />
          <strong>Cisco x Santé Québec</strong>
        </div>
        <nav className="nav-links">
          <button className="button secondary" type="button" onClick={logout}>Déconnexion</button>
        </nav>
      </header>
      <main className={`main-content ${contentClassName || ''}`.trim()}>{children}</main>
    </div>
  );
}
