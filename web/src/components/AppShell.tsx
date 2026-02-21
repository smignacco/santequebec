import { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

export function AppShell({ children }: PropsWithChildren) {
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
          <Link to="/login">Portail organisation</Link>
          <Link to="/org">Inventaire</Link>
          <Link to="/admin">Administration</Link>
        </nav>
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
