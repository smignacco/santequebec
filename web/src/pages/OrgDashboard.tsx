import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';
import { InventoryTable } from './InventoryTable';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];
const ALL_PAGE_SIZE = -1;

export function OrgDashboard() {
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState('Organisation');
  const [supportContactEmail, setSupportContactEmail] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [serialColumn, setSerialColumn] = useState('');
  const [productIdColumn, setProductIdColumn] = useState('');
  const [csvError, setCsvError] = useState('');
  const [manualSerialNumber, setManualSerialNumber] = useState('');
  const [manualProductId, setManualProductId] = useState('');
  const [manualProductDescription, setManualProductDescription] = useState('');
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState('');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  const load = (nextPage = page, nextPageSize = pageSize) => {
    const resolvedPageSize = nextPageSize === ALL_PAGE_SIZE
      ? Math.max(data.total || 0, 1)
      : nextPageSize;

    return api(`/org/items?page=${nextPage}&pageSize=${resolvedPageSize}`).then(setData);
  };

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

  useEffect(() => {
    api('/org/welcome-video')
      .then((data) => {
        const url = data?.welcomeVideoUrl || '';
        setWelcomeVideoUrl(url);
        setShowWelcomeModal(Boolean(url && !data?.dismissed));
      })
      .catch(() => {
        setWelcomeVideoUrl('');
        setShowWelcomeModal(false);
      });
  }, []);

  const patch = async (id: string, status: string) => {
    if (isLocked) return;
    await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load(page, pageSize);
  };

  const bulkPatch = async (ids: string[], status: string) => {
    if (isLocked || !ids.length) return;
    await api('/org/items', { method: 'PATCH', body: JSON.stringify({ ids, status }) });
    await load(page, pageSize);
  };

  const saveProgress = async () => {
    await load(page, pageSize);
    setMessage('Statut: progression sauvegardée. Vous pouvez reprendre plus tard.');
  };

  const addManualItem = async () => {
    if (isLocked || !manualSerialNumber.trim()) return;
    await api('/org/items/manual', {
      method: 'POST',
      body: JSON.stringify({
        serialNumber: manualSerialNumber,
        productId: manualProductId,
        productDescription: manualProductDescription
      })
    });
    setManualSerialNumber('');
    setManualProductId('');
    setManualProductDescription('');
    setShowManualModal(false);
    setMessage('Item ajouté manuellement avec statut CONFIRMED.');
    await load(page, pageSize);
  };

  const editManualItem = async (id: string, payload: { serialNumber: string; productId?: string; productDescription?: string }) => {
    if (isLocked) return;
    await api(`/org/items/${id}/manual-fields`, { method: 'PATCH', body: JSON.stringify(payload) });
    setMessage('Item manuel mis à jour.');
    await load(page, pageSize);
  };

  const submit = async () => {
    await api('/org/submit', { method: 'POST' });
    setMessage('Statut: la liste a été validée et soumise correctement.');
    await load(page, pageSize);
  };

  const resumeValidation = async () => {
    await api('/org/resume-validation', { method: 'POST' });
    setMessage('Statut: la liste est remise en cours de validation. Vous pouvez faire des ajustements.');
    await load(page, pageSize);
  };

  const total = data.total || 0;
  const confirmed = data.confirmed || 0;
  const fileStatus = data.fileStatus || '';
  const isLocked = Boolean(data.isLocked);
  const allItemsValidated = total > 0 && confirmed === total;
  const canSubmit = (fileStatus === 'PUBLISHED' || fileStatus === 'SUBMITTED') && allItemsValidated;
  const canResume = fileStatus === 'CONFIRMED' && !isLocked;
  const completion = total ? Math.round((confirmed / total) * 100) : 0;
  const effectivePageSize = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

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
      setProductIdColumn('');
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
    const foundProductIdColumn = headers.find((header) => /product.?id|produit.?id|sku/i.test(header));
    setSerialColumn(foundSerialColumn || headers[0] || '');
    setProductIdColumn(foundProductIdColumn || '');
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

    const productIdColumnIndex = productIdColumn
      ? csvHeaders.findIndex((header) => header === productIdColumn)
      : -1;

    const rows = csvRows
      .map((row) => ({
        serialNumber: (row[columnIndex] || '').trim(),
        productId: productIdColumnIndex >= 0 ? (row[productIdColumnIndex] || '').trim() : undefined
      }))
      .filter((row) => Boolean(row.serialNumber));

    if (!rows.length) {
      setCsvError('Aucun numéro de série valide trouvé dans la colonne sélectionnée.');
      return;
    }

    const result = await api('/org/confirm-serial-list', {
      method: 'POST',
      body: JSON.stringify({ rows })
    });

    setMessage(`Liste traitée: ${result.matched} trouvé(s) dans l'inventaire, ${result.created} ajouté(s) manuellement.`);
    setShowCsvModal(false);
    setCsvHeaders([]);
    setCsvRows([]);
    setSerialColumn('');
    setProductIdColumn('');
    setCsvError('');
    await load(page, pageSize);
  };

  const openWelcomeVideo = () => {
    if (!welcomeVideoUrl) return;
    setDoNotShowAgain(false);
    setShowWelcomeModal(true);
  };

  const closeWelcomeModal = async () => {
    if (doNotShowAgain) {
      await api('/org/welcome-video/dismiss', {
        method: 'PATCH',
        body: JSON.stringify({ dismissed: true })
      });
    }
    setShowWelcomeModal(false);
  };


  return (
    <AppShell contentClassName="main-content-wide">
      <section className="hero">
        <div className="hero-header">
          <div>
            <h1>Tableau de bord - {orgName}</h1>
            <p>Inventaire à valider item par item.</p>
          </div>
          <div className="hero-actions">
            <button className="button secondary" type="button" onClick={openWelcomeVideo} disabled={!welcomeVideoUrl}>
              Video Explicative
            </button>
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
          <button
            className="button secondary"
            onClick={async () => {
              await load(page, pageSize);
              setMessage('Statut: inventaire actualisé.');
            }}
          >
            Actualiser
          </button>
          <button className="button secondary" type="button" onClick={() => setShowManualModal(true)} disabled={isLocked}>Ajouter un item manuellement</button>
          <button className="button secondary" type="button" onClick={() => setShowCsvModal(true)} disabled={isLocked}>Chager .csv</button>
          <div className="status-badges ml-auto">
            <span className={`badge badge-centered ${fileStatus === 'CONFIRMED' ? 'badge-success' : 'badge-danger'}`}>
              {fileStatus === 'CONFIRMED' ? 'Soumis' : 'Non Soumis'}
            </span>
            <span className="badge badge-centered">{total} actifs</span>
          </div>
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
              <option value={ALL_PAGE_SIZE}>Tous</option>
            </select>
            résultats par page
          </label>
        </div>

        <InventoryTable items={data.items || []} visibleColumns={data.visibleColumns || []} onPatch={patch} onBulkPatch={bulkPatch} onManualEdit={editManualItem} canEdit={!isLocked} />
      </section>

      {message && (
        <section className="panel">
          <p>{message}</p>
        </section>
      )}



      {showWelcomeModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Vidéo explicative de l'application">
            <h3>Bienvenue</h3>
            <p>Visionnez cette vidéo explicative pour découvrir les principales fonctionnalités de l'application.</p>
            <div className="stack">
              <iframe
                title="Vidéo explicative"
                src={welcomeVideoUrl}
                style={{ width: '100%', minHeight: '320px', border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <label className="link-button" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input type="checkbox" checked={doNotShowAgain} onChange={(e) => setDoNotShowAgain(e.target.checked)} />
              Ne plus afficher
            </label>
            <div className="button-row">
              <button className="button" type="button" onClick={closeWelcomeModal}>Fermer</button>
            </div>
          </section>
        </div>
      )}

      {showManualModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Ajouter un item manuellement">
            <h3>Ajout manuel d&apos;item</h3>
            <p>Le numéro de série est obligatoire. Product ID et Product Description sont optionnels.</p>
            <label className="stack">
              Numéro de série *
              <input className="input" value={manualSerialNumber} onChange={(e) => setManualSerialNumber(e.target.value)} />
            </label>
            <label className="stack">
              Product ID (optionnel)
              <input className="input" value={manualProductId} onChange={(e) => setManualProductId(e.target.value)} />
            </label>
            <label className="stack">
              Product Description (optionnel)
              <input className="input" value={manualProductDescription} onChange={(e) => setManualProductDescription(e.target.value)} />
            </label>
            <div className="button-row">
              <button className="button" type="button" onClick={addManualItem} disabled={!manualSerialNumber.trim() || isLocked}>Ajouter</button>
              <button className="button secondary" type="button" onClick={() => setShowManualModal(false)}>Fermer</button>
            </div>
          </section>
        </div>
      )}

      {showCsvModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Charger une liste CSV">
            <h3>Charger une liste CSV</h3>
            <p>Importez un fichier CSV puis associez les colonnes importées aux champs requis.</p>
            <input className="input" type="file" accept=".csv,text/csv" onChange={(e) => onCsvFile(e.target.files?.[0])} />
            {!!csvHeaders.length && (
              <>
                <label className="stack">
                  Colonne Serial Number (obligatoire)
                  <select className="input" value={serialColumn} onChange={(e) => setSerialColumn(e.target.value)}>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </label>
                <label className="stack">
                  Colonne Product ID (facultatif)
                  <select className="input" value={productIdColumn} onChange={(e) => setProductIdColumn(e.target.value)}>
                    <option value="">Aucune colonne</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </label>
              </>
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
