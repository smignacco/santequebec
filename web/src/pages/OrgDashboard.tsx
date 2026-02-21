import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { InventoryTable } from './InventoryTable';

export function OrgDashboard() {
  const [data, setData] = useState<any>({ items: [] });
  const load = () => api('/org/items?page=1&pageSize=50').then(setData);
  useEffect(() => { load(); }, []);
  const patch = async (id: string, status: string) => { await api(`/org/items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); };
  return <div><h1>Dashboard organisation</h1><button onClick={() => api('/org/submit', { method: 'POST' })}>Soumettre</button><InventoryTable items={data.items || []} onPatch={patch} /></div>;
}
