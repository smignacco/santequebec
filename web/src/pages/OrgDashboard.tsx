import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppShell } from '../components/AppShell';
import { InventoryTable } from './InventoryTable';

export function OrgDashboard() {
  const [data, setData] = useState<any>({ items: [] });

  const load = () => api('/org/items?page=1&pageSize=50').then(setData);

  useEffect(() => {
    load();
  }, []);

  const patch = async (id: string, status: string) => {
    await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  };

  return (
    <AppShell>
      <section className="hero">
        <h1>Dashboard organisation</h1>
        <p>Suivi des actifs avec une navigation claire, orientée efficacité opérationnelle.</p>
      </section>

      <section className="panel stack">
        <div className="button-row">
          <button className="button" onClick={() => api('/org/submit', { method: 'POST' })}>Soumettre l&apos;inventaire</button>
          <button className="button secondary" onClick={load}>Actualiser</button>
          <span className="badge">{data.items?.length || 0} actifs</span>
        </div>
        <InventoryTable items={data.items || []} onPatch={patch} />
      </section>
    </AppShell>
  );
}
