import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';
import { InventoryTable } from './InventoryTable';
import { getToken } from '../auth';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];
const ALL_PAGE_SIZE = -1;

export function OrgDashboard() {
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState('Organisation');
  const [supportContactEmail, setSupportContactEmail] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
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
  const [isBusyAction, setIsBusyAction] = useState('');
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvReport, setCsvReport] = useState<{ matched: number; created: number; ignored: number } | null>(null);
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'NEEDS_CLARIFICATION' | 'TO_BE_REMOVED' | 'MANUAL_ONLY' | 'UNVALIDATED'>('ALL');

  const getResolvedWelcomeVideoUrl = () => {
    if (!welcomeVideoUrl) return null;
    try {
      return new URL(welcomeVideoUrl, window.location.origin);
    } catch {
      return null;
    }
  };

  const isDirectVideoFile = () => {
    const resolved = getResolvedWelcomeVideoUrl();
    if (!resolved) return false;
    return /\.mp4$/i.test(resolved.pathname)
      || resolved.pathname.startsWith('/uploads/welcome-video/')
      || resolved.pathname === '/api/org/welcome-video/file';
  };

  const isPotentialAppPage = () => {
    const resolved = getResolvedWelcomeVideoUrl();
    if (!resolved) return false;

    if (resolved.origin !== window.location.origin) {
      return false;
    }

    if (isDirectVideoFile()) {
      return false;
    }

    return resolved.pathname === '/' || resolved.pathname.startsWith('/org') || resolved.pathname.startsWith('/admin');
  };

  const load = (nextPage = page, nextPageSize = pageSize, nextFilters = columnFilters) => {
    const resolvedPageSize = nextPageSize === ALL_PAGE_SIZE
      ? Math.max(data.total || 0, 1)
      : nextPageSize;

    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(resolvedPageSize) });
    const serializedFilters = Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value));
    if (Object.keys(serializedFilters).length) {
      query.set('filters', JSON.stringify(serializedFilters));
    }

    return api(`/org/items?${query.toString()}`).then(setData);
  };

  const runBusyAction = async (key: string, callback: () => Promise<void>) => {
    if (isBusyAction) return;
    setIsBusyAction(key);
    setMessage('');
    try {
      await callback();
    } finally {
      setIsBusyAction('');
    }
  };

  useEffect(() => {
    load(page, pageSize, columnFilters);
  }, [page, pageSize, columnFilters]);

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
    await runBusyAction(`patch-${id}-${status}`, async () => {
      await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load(page, pageSize);
      setMessage('Statut mis à jour.');
    });
  };

  const bulkPatch = async (ids: string[], status: string) => {
    if (isLocked || !ids.length) return;
    await runBusyAction(`bulk-${status}`, async () => {
      await api('/org/items', { method: 'PATCH', body: JSON.stringify({ ids, status }) });
      await load(page, pageSize);
      setMessage('Mise à jour en lot appliquée.');
    });
  };

  const saveProgress = async () => {
    await runBusyAction('save-progress', async () => {
      await load(page, pageSize);
      setMessage('Statut: progression sauvegardée. Vous pouvez reprendre plus tard.');
    });
  };

  const addManualItem = async () => {
    if (isLocked || !manualSerialNumber.trim()) return;
    await runBusyAction('manual-add', async () => {
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
    });
  };

  const editManualItem = async (id: string, payload: { serialNumber: string; productId?: string; productDescription?: string }) => {
    if (isLocked) return;
    await runBusyAction(`manual-edit-${id}`, async () => {
      await api(`/org/items/${id}/manual-fields`, { method: 'PATCH', body: JSON.stringify(payload) });
      setMessage('Item manuel mis à jour.');
      await load(page, pageSize);
    });
  };

  const submit = async () => {
    await runBusyAction('submit', async () => {
      await api('/org/submit', { method: 'POST' });
      setMessage('Statut: la liste a été validée et soumise correctement.');
      await load(page, pageSize);
    });
  };

  const resumeValidation = async () => {
    await runBusyAction('resume-validation', async () => {
      await api('/org/resume-validation', { method: 'POST' });
      setMessage('Statut: la liste est remise en cours de validation. Vous pouvez faire des ajustements.');
      await load(page, pageSize);
    });
  };

  const total = data.total || 0;
  const filteredTotal = data.filteredTotal ?? total;
  const confirmed = data.confirmed || 0;
  const fileStatus = data.fileStatus || '';
  const isLocked = Boolean(data.isLocked);
  const allItemsValidated = total > 0 && confirmed === total;
  const canSubmit = (fileStatus === 'PUBLISHED' || fileStatus === 'SUBMITTED') && allItemsValidated;
  const canResume = fileStatus === 'CONFIRMED' && !isLocked;
  const completion = total ? Math.round((confirmed / total) * 100) : 0;
  const effectivePageSize = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / effectivePageSize));

  const goToPage = (nextPage: number) => {
    const boundedPage = Math.min(totalPages, Math.max(1, nextPage));
    setPage(boundedPage);
  };

  const teamsHelpLink = supportContactEmail
    ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(supportContactEmail)}`
    : '';


  const notifyHelpRequest = async () => {
    await runBusyAction('help-request', async () => {
      await api('/org/help-request', { method: 'POST' });
      setMessage("Demande d'aide envoyée aux administrateurs.");
      if (teamsHelpLink) {
        window.open(teamsHelpLink, '_blank', 'noreferrer');
      }
    });
  };

  const onPageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };


  const onColumnFilterChange = (column: string, value: string) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (!value) {
        delete next[column];
      } else {
        next[column] = value;
      }
      return next;
    });
    setPage(1);
  };

  const clearFilters = () => {
    setColumnFilters({});
    setPage(1);
  };

  const hasActiveFilters = Object.keys(columnFilters).length > 0;
  const isLoading = Boolean(isBusyAction);
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
    setCsvPreview(rows.slice(0, 5));
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

    await runBusyAction('csv-submit', async () => {
      const result = await api('/org/confirm-serial-list', {
        method: 'POST',
        body: JSON.stringify({ rows })
      });

      const ignored = rows.length - (result.matched + result.created);
      setCsvReport({ matched: result.matched, created: result.created, ignored: Math.max(0, ignored) });
      setMessage(`Liste traitée: ${result.matched} trouvé(s), ${result.created} ajouté(s), ${Math.max(0, ignored)} ignoré(s).`);
      setShowCsvModal(false);
      setCsvHeaders([]);
      setCsvRows([]);
      setCsvPreview([]);
      setSerialColumn('');
      setProductIdColumn('');
      setCsvError('');
      await load(page, pageSize);
    });
  };

  const openWelcomeVideo = () => {
    if (!welcomeVideoUrl) return;
    setDoNotShowAgain(false);
    setShowWelcomeModal(true);
  };

  const isAuthenticatedWelcomeVideo = welcomeVideoUrl === '/api/org/welcome-video/file';
  const token = getToken();
  const resolvedWelcomeVideoSrc = isAuthenticatedWelcomeVideo
    ? (token ? `/api/org/welcome-video/file?access_token=${encodeURIComponent(token)}` : '')
    : welcomeVideoUrl;

  const closeWelcomeModal = async () => {
    if (doNotShowAgain) {
      await api('/org/welcome-video/dismiss', {
        method: 'PATCH',
        body: JSON.stringify({ dismissed: true })
      });
    }
    setShowWelcomeModal(false);
  };

  const remainingToValidate = Math.max(total - confirmed, 0);
  const submitBlockerReason = isLocked
    ? 'L’inventaire est verrouillé par un administrateur.'
    : fileStatus !== 'PUBLISHED' && fileStatus !== 'SUBMITTED'
      ? 'L’inventaire doit être publié avant soumission.'
      : !allItemsValidated
        ? `Validez encore ${remainingToValidate} item(s) avant de soumettre.`
        : '';

  const displayedItems = (data.items || []).filter((item: any) => {
    if (quickFilter === 'ALL') return true;
    if (quickFilter === 'MANUAL_ONLY') return Boolean(item.manualEntry);
    if (quickFilter === 'UNVALIDATED') return item.status !== 'CONFIRMED';
    return item.status === quickFilter;
  });


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
              Vidéo explicative
            </button>
            <button
              className={`button secondary teams-help-button ${teamsHelpLink ? '' : 'is-disabled'}`}
              type="button"
              onClick={notifyHelpRequest}
              title={teamsHelpLink ? "Notifier l'aide et ouvrir le chat Microsoft Teams" : "Notifier l'aide aux administrateurs"}
              disabled={isLoading}
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
            </button>
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
          <ul>
            <li>{remainingToValidate === 0 ? '✅ Tous les items sont validés.' : `🔎 ${remainingToValidate} item(s) restent à traiter.`}</li>
            <li>{fileStatus === 'PUBLISHED' || fileStatus === 'SUBMITTED' ? '✅ Inventaire publiable/soumissible.' : '⏳ En attente de publication administrateur.'}</li>
            <li>{isLocked ? '⛔ Inventaire verrouillé.' : '✅ Modifications autorisées.'}</li>
          </ul>
          {fileStatus === 'CONFIRMED' && <p><strong>Statut:</strong> Confirmé auprès des administrateurs.</p>}
          {isLocked && <p><strong>Statut:</strong> Inventaire verrouillé par un administrateur.</p>}
          {!!submitBlockerReason && <p className="form-error"><strong>Soumission bloquée:</strong> {submitBlockerReason}</p>}
        </div>

        <div className="button-row">
          <button className="button" onClick={submit} disabled={!canSubmit || isLocked || isLoading}>{isBusyAction === 'submit' ? 'Soumission…' : "Soumettre l'inventaire"}</button>
          <button className="button secondary" onClick={resumeValidation} disabled={!canResume || isLoading}>{isBusyAction === 'resume-validation' ? 'Mise à jour…' : 'Remettre en cours de validation'}</button>
          <button className="button secondary" onClick={saveProgress} disabled={isLocked || isLoading}>{isBusyAction === 'save-progress' ? 'Sauvegarde…' : 'Sauvegarder la progression'}</button>
          <button
            className="button secondary"
            onClick={async () => {
              await runBusyAction('refresh', async () => {
                await load(page, pageSize);
                setMessage('Statut: inventaire actualisé.');
              });
            }}
            disabled={isLoading}
          >
            {isBusyAction === 'refresh' ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button className="button secondary" type="button" onClick={() => setShowManualModal(true)} disabled={isLocked || isLoading}>Ajouter un item manuellement</button>
          <button className="button secondary" type="button" onClick={() => setShowCsvModal(true)} disabled={isLocked || isLoading}>Charger un .csv</button>
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
            <button className="button secondary" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
              Effacer filtre(s)
            </button>
            <select value={quickFilter} onChange={(event) => setQuickFilter(event.target.value as typeof quickFilter)}>
              <option value="ALL">Tous</option>
              <option value="UNVALIDATED">À traiter</option>
              <option value="NEEDS_CLARIFICATION">À clarifier</option>
              <option value="TO_BE_REMOVED">À retirer</option>
              <option value="MANUAL_ONLY">Ajouts manuels</option>
            </select>
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

        <InventoryTable items={displayedItems} visibleColumns={data.visibleColumns || []} onPatch={patch} onBulkPatch={bulkPatch} onManualEdit={editManualItem} canEdit={!isLocked && !isLoading} columnFilters={columnFilters} onFilterChange={onColumnFilterChange} filterValuesByColumn={data.filterValuesByColumn || {}} isBusy={isLoading} />
      </section>

      {message && (
        <section className="panel toast-success" role="status" aria-live="polite">
          <p>{message}</p>
        </section>
      )}

      {csvReport && (
        <section className="panel stack" role="status" aria-live="polite">
          <strong>Rapport de traitement CSV</strong>
          <p>{csvReport.matched} numéro(s) déjà présent(s) · {csvReport.created} ajout(s) manuel(s) · {csvReport.ignored} ligne(s) ignorée(s).</p>
        </section>
      )}



      {showWelcomeModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Vidéo explicative de l'application">
            <h3>Bienvenue</h3>
            <p>Visionnez cette vidéo explicative pour découvrir les principales fonctionnalités de l'application.</p>
            <div className="stack">
              {isPotentialAppPage() ? (
                <p>
                  L&apos;URL configurée semble pointer vers une page de l&apos;application au lieu d&apos;une vidéo.
                  Veuillez contacter un administrateur pour configurer un fichier vidéo (.mp4).
                </p>
              ) : isDirectVideoFile() ? (
                resolvedWelcomeVideoSrc ? (
                  <video controls preload="metadata" style={{ width: '100%', minHeight: '320px' }}>
                    <source src={resolvedWelcomeVideoSrc} type="video/mp4" />
                    Votre navigateur ne supporte pas la lecture vidéo.
                  </video>
                ) : (
                  <p>Impossible de charger la vidéo explicative. Veuillez vous reconnecter.</p>
                )
              ) : (
                <iframe
                  title="Vidéo explicative"
                  src={welcomeVideoUrl}
                  style={{ width: '100%', minHeight: '320px', border: 0 }}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              )}
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
                {!!csvPreview.length && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {csvHeaders.map((header) => <th key={`preview-head-${header}`}>{header}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, rowIndex) => (
                          <tr key={`preview-row-${rowIndex}`}>
                            {csvHeaders.map((header, columnIndex) => <td key={`preview-row-${rowIndex}-${header}`}>{row[columnIndex] || '-'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {csvError && <p>{csvError}</p>}
            <div className="button-row">
              <button className="button" type="button" onClick={submitCsvList} disabled={!csvRows.length || isLoading}>{isBusyAction === 'csv-submit' ? 'Traitement…' : 'Soumettre la liste'}</button>
              <button className="button secondary" type="button" onClick={() => setShowCsvModal(false)}>Fermer</button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
