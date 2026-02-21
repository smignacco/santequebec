import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';
import { InventoryTable } from './InventoryTable';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

export function OrgDashboard() {
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState('Organisation');
  const [supportContactEmail, setSupportContactEmail] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = (nextPage = page, nextPageSize = pageSize) =>
    api(`/org/items?page=${nextPage}&pageSize=${nextPageSize}`).then(setData);

  useEffect(() => {
    load(page, pageSize);
  }, [page, pageSize]);

  useEffect(() => {
    api('/org/me')
      .then((org) => {
        setOrgName(org?.displayName || 'Organisation');
        setSupportContactEmail(org?.supportContactEmail || '');
      })
      .catch(() => {
        setOrgName('Organisation');
        setSupportContactEmail('');
      });
  }, []);

  const patch = async (id: string, status: string) => {
    await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load(page, pageSize);
  };

  const saveProgress = async () => {
    await load(page, pageSize);
    setMessage('Progression sauvegardée. Vous pouvez reprendre plus tard.');
  };

  const submit = async () => {
    await api('/org/submit', { method: 'POST' });
    setMessage('Inventaire soumis avec succès.');
    await load(page, pageSize);
  };

  const total = data.total || 0;
  const confirmed = data.confirmed || 0;
  const completion = total ? Math.round((confirmed / total) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goToPage = (nextPage: number) => {
    const boundedPage = Math.min(totalPages, Math.max(1, nextPage));
    setPage(boundedPage);
  };

  const teamsHelpLink = supportContactEmail
    ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(supportContactEmail)}`
    : '';

  const onPageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  return (
    <AppShell contentClassName="main-content-wide">
      <section className="hero">
        <div className="hero-header">
          <div>
            <h1>Tableau de bord - {orgName}</h1>
            <p>Inventaire à valider item par item.</p>
          </div>
          <a
            className={`button secondary teams-help-button ${teamsHelpLink ? '' : 'is-disabled'}`}
            href={teamsHelpLink || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!teamsHelpLink}
            onClick={(event) => {
              if (!teamsHelpLink) {
                event.preventDefault();
              }
            }}
            title={teamsHelpLink ? 'Ouvrir le chat Microsoft Teams' : 'Aucun contact support Teams configuré'}
          >
            <span aria-hidden="true" className="teams-logo">
              <svg viewBox="0 0 24 24" width="16" height="16" role="img">
                <rect x="1" y="4" width="14" height="16" rx="3" fill="#5b5fc7" />
                <circle cx="18" cy="8" r="3" fill="#7b83eb" />
                <rect x="15" y="11" width="8" height="8" rx="3" fill="#4f52b2" />
                <path d="M5 8h7v2H9.8v6H7.2v-6H5z" fill="white" />
              </svg>
            </span>
            Besoin d'aide
          </a>
        </div>
      </section>

      <section className="panel stack">
        <div>
          <strong>Progression de validation</strong>
          <div className="progress-track">
            <div className="progress-value" style={{ width: `${completion}%` }} />
          </div>
          <p>{confirmed} validés sur {total} ({completion}%)</p>
        </div>

        <div className="button-row">
          <button className="button" onClick={submit}>Soumettre l&apos;inventaire</button>
          <button className="button secondary" onClick={saveProgress}>Sauvegarder la progression</button>
          <button className="button secondary" onClick={() => load(page, pageSize)}>Actualiser</button>
          <span className="badge">{total} actifs</span>
        </div>

        <div className="table-toolbar">
          <div className="pagination-controls">
            <button className="button secondary" type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
              Précédent
            </button>
            <span>Page {page} / {totalPages}</span>
            <button className="button secondary" type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
              Suivant
            </button>
          </div>

          <label className="rows-control">
            Afficher
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            résultats par page
          </label>
        </div>

        <InventoryTable items={data.items || []} visibleColumns={data.visibleColumns || []} onPatch={patch} />
      </section>

      {message && (
        <section className="panel">
          <p>{message}</p>
        </section>
      )}
    </AppShell>
  );
}
