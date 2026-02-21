import { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="page-shell">
      <header className="top-nav">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => (
              <span key={index} />
            ))}
          </span>
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
