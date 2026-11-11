import type { AstroCookies } from 'astro';
import { signPlayer, verifyPlayer } from './crypto';

export const PLAYER_COOKIE = 'bta_player';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type Mode = 'normal' | 'easy';
export type Player = { id: string; run_date: string; messages_left: number; mode: Mode };

// `secure` follows the request: always on in production (https), off on http://localhost,
// where Safari refuses Secure cookies and every request after the first would look like a stranger.
export async function setPlayerCookie(cookies: AstroCookies, key: string, id: string, secure: boolean) {
  cookies.set(PLAYER_COOKIE, await signPlayer(key, id), {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: THIRTY_DAYS,
  });
}

/** The player behind a request, or null when the cookie is missing, forged or points at no row. */
export async function currentPlayer(cookies: AstroCookies, key: string, db: D1Database): Promise<Player | null> {
  const id = await verifyPlayer(key, cookies.get(PLAYER_COOKIE)?.value);
  if (!id) return null;
  return db.prepare('SELECT id, run_date, messages_left, mode FROM players WHERE id = ?').bind(id).first<Player>();
}
