import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';
import { InventoryTable } from './InventoryTable';

export function OrgDashboard() {
  const [data, setData] = useState<any>({ items: [] });
  const [message, setMessage] = useState('');

  const load = () => api('/org/items?page=1&pageSize=200').then(setData);

  useEffect(() => {
    load();
  }, []);

  const patch = async (id: string, status: string) => {
    await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  };

  const saveProgress = async () => {
    await load();
    setMessage('Progression sauvegardée. Vous pouvez reprendre plus tard.');
  };

  const submit = async () => {
    await api('/org/submit', { method: 'POST' });
    setMessage('Inventaire soumis avec succès.');
    await load();
  };

  const total = data.items?.length || 0;
  const confirmed = useMemo(() => (data.items || []).filter((item: any) => item.status === 'CONFIRMED').length, [data.items]);
  const completion = total ? Math.round((confirmed / total) * 100) : 0;

  return (
    <AppShell>
      <section className="hero">
        <h1>Dashboard organisation</h1>
        <p>Inventaire à valider item par item.</p>
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
          <button className="button secondary" onClick={load}>Actualiser</button>
          <span className="badge">{total} actifs</span>
        </div>

        <InventoryTable items={data.items || []} onPatch={patch} />
      </section>

      {message && (
        <section className="panel">
          <p>{message}</p>
        </section>
      )}
    </AppShell>
  );
}
