const API = '/api';

export const authHeader = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...authHeader(), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
