import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export type LoginLinkPayload = {
  orgCode?: string;
  pin?: string;
  name?: string;
  email?: string;
};

const TOKEN_SEPARATOR = '.';

function getLoginLinkSecret() {
  return process.env.LOGIN_LINK_SECRET?.trim() || process.env.JWT_SECRET?.trim() || 'dev-login-link-secret';
}

function getKeyMaterial(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encodeLoginLinkPayload(payload: LoginLinkPayload) {
  const jsonPayload = JSON.stringify(payload);
  const iv = randomBytes(12);
  const key = getKeyMaterial(getLoginLinkSecret());

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonPayload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}${TOKEN_SEPARATOR}${encrypted.toString('base64url')}${TOKEN_SEPARATOR}${authTag.toString('base64url')}`;
}

export function decodeLoginLinkPayload(token: string): LoginLinkPayload | null {
  const segments = token.split(TOKEN_SEPARATOR);
  if (segments.length !== 3) return null;

  const [ivRaw, encryptedRaw, authTagRaw] = segments;

  try {
    const iv = Buffer.from(ivRaw, 'base64url');
    const encrypted = Buffer.from(encryptedRaw, 'base64url');
    const authTag = Buffer.from(authTagRaw, 'base64url');

    if (iv.length !== 12 || authTag.length !== 16 || !encrypted.length) return null;

    const key = getKeyMaterial(getLoginLinkSecret());
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted) as LoginLinkPayload;

    return {
      orgCode: typeof parsed.orgCode === 'string' ? parsed.orgCode : '',
      pin: typeof parsed.pin === 'string' ? parsed.pin : '',
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : ''
    };
  } catch {
    return null;
  }
}

