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
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [serialColumn, setSerialColumn] = useState('');
  const [csvError, setCsvError] = useState('');

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
    if (isLocked) return;
    await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load(page, pageSize);
  };

  const saveProgress = async () => {
    await load(page, pageSize);
    setMessage('Progression sauvegardée. Vous pouvez reprendre plus tard.');
  };

  const submit = async () => {
    await api('/org/submit', { method: 'POST' });
    setMessage('La liste a été validée et soumise correctement.');
    await load(page, pageSize);
  };

  const resumeValidation = async () => {
    await api('/org/resume-validation', { method: 'POST' });
    setMessage('La liste est remise en cours de validation. Vous pouvez faire des ajustements.');
    await load(page, pageSize);
  };

  const total = data.total || 0;
  const confirmed = data.confirmed || 0;
  const fileStatus = data.fileStatus || '';
  const isLocked = Boolean(data.isLocked);
  const canSubmit = fileStatus === 'PUBLISHED' || fileStatus === 'SUBMITTED';
  const canResume = fileStatus === 'CONFIRMED' && !isLocked;
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

  const detectCsvDelimiter = (headerLine: string) => {
    const delimiterCandidates = [',', ';', '\t'];
    const scores = delimiterCandidates.map((delimiter) => ({
      delimiter,
      count: (headerLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
    }));
    scores.sort((a, b) => b.count - a.count);
    return scores[0]?.count ? scores[0].delimiter : ',';
  };

  const parseCsvRow = (line: string, delimiter: string) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    return cells;
  };

  const onCsvFile = async (file?: File | null) => {
    if (!file) return;

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\uFEFF/, ''))
      .filter(Boolean);

    if (!lines.length) {
      setCsvError('Le fichier CSV est vide.');
      setCsvHeaders([]);
      setCsvRows([]);
      setSerialColumn('');
      return;
    }

    const delimiter = detectCsvDelimiter(lines[0]);
    const parsed = lines.map((line) => parseCsvRow(line, delimiter));
    const [headers, ...rows] = parsed;
    if (!headers?.length) {
      setCsvError('Impossible de lire les entêtes du CSV.');
      return;
    }

    setCsvError('');
    setCsvHeaders(headers);
    setCsvRows(rows);
    const foundSerialColumn = headers.find((header) => /serial|série|serie/i.test(header));
    setSerialColumn(foundSerialColumn || headers[0] || '');
  };

  const submitCsvList = async () => {
    if (!serialColumn) {
      setCsvError('Veuillez sélectionner la colonne des numéros de série.');
      return;
    }

    const columnIndex = csvHeaders.findIndex((header) => header === serialColumn);
    if (columnIndex === -1) {
      setCsvError('La colonne sélectionnée est invalide.');
      return;
    }

    const serials = csvRows
      .map((row) => row[columnIndex] || '')
      .map((serial) => serial.trim())
      .filter(Boolean);

    if (!serials.length) {
      setCsvError('Aucun numéro de série valide trouvé dans la colonne sélectionnée.');
      return;
    }

    const result = await api('/org/confirm-serial-list', {
      method: 'POST',
      body: JSON.stringify({ serials })
    });

    setMessage(`Liste traitée: ${result.matched} trouvé(s) dans l'inventaire, ${result.created} ajouté(s) manuellement.`);
    setShowCsvModal(false);
    setCsvHeaders([]);
    setCsvRows([]);
    setSerialColumn('');
    setCsvError('');
    await load(page, pageSize);
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
          {fileStatus === 'CONFIRMED' && <p><strong>Statut:</strong> Confirmé auprès des administrateurs.</p>}
          {isLocked && <p><strong>Statut:</strong> Inventaire verrouillé par un administrateur.</p>}
        </div>

        <div className="button-row">
          <button className="button" onClick={submit} disabled={!canSubmit || isLocked}>Soumettre l&apos;inventaire</button>
          <button className="button secondary" onClick={resumeValidation} disabled={!canResume}>Remettre en cours de validation</button>
          <button className="button secondary" onClick={saveProgress} disabled={isLocked}>Sauvegarder la progression</button>
          <button className="button secondary" onClick={() => load(page, pageSize)}>Actualiser</button>
          <button className="button secondary ml-auto" type="button" onClick={() => setShowCsvModal(true)} disabled={isLocked}>Charger une liste</button>
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

        <InventoryTable items={data.items || []} visibleColumns={data.visibleColumns || []} onPatch={patch} canEdit={!isLocked} />
      </section>

      {message && (
        <section className="panel">
          <p>{message}</p>
        </section>
      )}

      {showCsvModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Charger une liste CSV">
            <h3>Charger une liste CSV</h3>
            <p>Importez un fichier CSV puis sélectionnez la colonne contenant les numéros de série.</p>
            <input className="input" type="file" accept=".csv,text/csv" onChange={(e) => onCsvFile(e.target.files?.[0])} />
            {!!csvHeaders.length && (
              <label className="stack">
                Colonne numéro de série
                <select className="input" value={serialColumn} onChange={(e) => setSerialColumn(e.target.value)}>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            )}
            {csvError && <p>{csvError}</p>}
            <div className="button-row">
              <button className="button" type="button" onClick={submitCsvList} disabled={!csvRows.length}>Soumettre la liste</button>
              <button className="button secondary" type="button" onClick={() => setShowCsvModal(false)}>Fermer</button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
