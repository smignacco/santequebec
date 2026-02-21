import { getToken } from '../auth';

const API = '/api';

export const authHeader = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...authHeader(), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiForm(path: string, form: FormData, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, body: form, headers: { ...authHeader(), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
