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
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Cisco_logo_blue_2016.svg/1280px-Cisco_logo_blue_2016.svg.png"
            alt="Cisco logo"
          />
          <strong>Cisco - Validation de l'inventaire d'un établissement</strong>
        </div>
        <nav className="nav-links">
          <button className="button secondary" type="button" onClick={logout}>Déconnexion</button>
        </nav>
      </header>
      <main className={`main-content ${contentClassName || ''}`.trim()}>{children}</main>
    </div>
  );
}
