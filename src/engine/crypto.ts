// HMAC helpers on Web Crypto, so the same code runs in the Worker and in vitest (Node 22).

const enc = new TextEncoder();

async function hmac(key: string, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compares two strings in time that depends only on their length. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomId(bytes = 16): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// The player cookie is `<id>.<signature>`. A forged or edited id fails verification.
export async function signPlayer(key: string, id: string): Promise<string> {
  return `${id}.${base64url(await hmac(key, `player:${id}`))}`;
}

export async function verifyPlayer(key: string, cookie: string | undefined): Promise<string | null> {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 1) return null;
  const id = cookie.slice(0, dot);
  return safeEqual(await signPlayer(key, id), cookie) ? id : null;
}

// No 0/O/1/I/L, so a secret read aloud or retyped by the player can't be misread.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Each player's secret for a level. Derived, never stored, so it can't leak from the database
 * and one player's answer is useless to another.
 */
export async function levelSecret(key: string, playerId: string, level: number, prefix: string): Promise<string> {
  const bytes = await hmac(key, `secret:${playerId}:${level}`);
  let body = '';
  for (let i = 0; i < 6; i++) body += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${body}`;
}
