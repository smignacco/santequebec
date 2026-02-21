export type UserRole = 'ADMIN' | 'ORG_USER';

type JwtPayload = {
  role?: UserRole;
  exp?: number;
};

const TOKEN_KEY = 'token';

const parseJwt = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getCurrentRole = (): UserRole | null => {
  const token = getToken();
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload?.role) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return payload.role;
};

export const saveToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
