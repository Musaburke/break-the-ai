// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Pages are prerendered by default; API routes opt out with `export const prerender = false`.
export default defineConfig({
  adapter: cloudflare(),
});
