import { defineMiddleware } from 'astro:middleware';

// public/_headers only covers static assets. Responses from the Worker (the /api routes and the
// on-demand pages such as /debrief) get their headers here. Keep the page CSP in step with _headers.
const common: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // Per-player data must never be cached.
  'Cache-Control': 'no-store',
};
const apiCsp = "default-src 'none'; frame-ancestors 'none'";
const pageCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();

  const { request, url } = context;
  const isApi = url.pathname.startsWith('/api/');

  // Cross-site requests can't spend a player's messages: every state-changing call must come from this site.
  if (isApi && request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return Response.json({ error: 'bad-origin' }, { status: 403 });
  }

  const response = await next();
  for (const [name, value] of Object.entries(common)) response.headers.set(name, value);
  response.headers.set('Content-Security-Policy', isApi ? apiCsp : pageCsp);
  return response;
});
