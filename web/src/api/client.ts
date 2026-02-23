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


export function apiFormWithProgress(path: string, form: FormData, onProgress?: (percent: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}${path}`);

    const token = getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || 'Upload failed'));
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({});
      }
    };

    xhr.onerror = () => reject(new Error('Erreur réseau durant le téléversement.'));
    xhr.send(form);
  });
}

export async function apiBlob(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...authHeader(), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}
