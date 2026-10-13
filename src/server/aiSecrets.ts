import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption for credentials the Admin panel stores (today: the AI provider API key).
 *
 * Standard authenticated encryption, nothing home-made: AES-256-GCM from node:crypto, a fresh random 96-bit IV per value, and the
 * auth tag kept with the ciphertext so a changed or swapped value fails to open instead of decoding to garbage. The master secret
 * lives only in the server's environment (AI_SECRET_ENCRYPTION_KEY: 32 random bytes, as 64 hex characters or base64); it is never
 * written to the database, never sent anywhere, and never read by anything but this file. Generate one with: openssl rand -base64 32
 *
 * `aad` binds a value to its purpose (for example the provider it belongs to), so a ciphertext cannot be lifted into another slot.
 */
export type Sealed = { v: 1; iv: string; tag: string; ct: string };

/** Raised for "cannot encrypt/decrypt right now", never carrying the secret or the master key. */
export class SecretsError extends Error {
  constructor(public code: 'ENCRYPTION_UNAVAILABLE' | 'DECRYPT_FAILED') {
    super(code === 'ENCRYPTION_UNAVAILABLE' ? 'The server encryption key is not configured.' : 'A stored credential could not be decrypted.');
    this.name = 'SecretsError';
  }
}

function masterKey(): Buffer | null {
  const raw = (process.env.AI_SECRET_ENCRYPTION_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) return Buffer.from(raw, 'base64');
  return null;
}

/** Whether this server can store a new secret. A boolean only: nothing about the key leaves this file. */
export const encryptionAvailable = () => masterKey() !== null;

export function seal(plain: string, aad: string): Sealed {
  const key = masterKey();
  if (!key) throw new SecretsError('ENCRYPTION_UNAVAILABLE');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

export function open(sealed: unknown, aad: string): string {
  const key = masterKey();
  if (!key) throw new SecretsError('ENCRYPTION_UNAVAILABLE');
  try {
    const s = sealed as Sealed;
    if (!s || s.v !== 1 || typeof s.iv !== 'string' || typeof s.tag !== 'string' || typeof s.ct !== 'string') throw new Error('shape');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(s.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(s.ct, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Deliberately uninformative: wrong master key, tampering and a malformed value look the same from outside.
    throw new SecretsError('DECRYPT_FAILED');
  }
}
