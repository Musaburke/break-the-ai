import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runsLeft } from '../../engine/budget';

export const prerender = false;

// Public and cheap: one D1 read, never a model call.
export const GET: APIRoute = async () => Response.json({ runsLeft: Math.max(0, await runsLeft(env.DB)) });
