#!/usr/bin/env node
// Screenshot a page at desktop (1440) and mobile (390) widths.
// Usage:
//   node tools/screenshot.mjs <path-or-url> [label] [--full] [--hd] [--png] [--out <dir>]
//   node tools/screenshot.mjs /about            -> http://localhost:4321/about
//   node tools/screenshot.mjs https://site.com  -> any URL
// Output: .tmp/shots/<label>-desktop.jpg and <label>-mobile.jpg (overwritten each run).
// Default is 1x JPEG, which is cheap to read back. --hd = 2x, --png = PNG (use both for project captures).
// Needs Google Chrome installed (uses playwright-core with channel "chrome", no browser download).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const full = args.includes('--full');
const hd = args.includes('--hd');
const png = args.includes('--png');
const outIdx = args.indexOf('--out');
const outDir = outIdx > -1 ? args[outIdx + 1] : '.tmp/shots';
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const target = positional[0] ?? '/';
const base = process.env.BASE_URL ?? 'http://localhost:4321';
const url = /^(https?|file):\/\//.test(target) ? target : base + (target.startsWith('/') ? target : '/' + target);
const label = positional[1] ?? (target.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home');

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: hd ? 2 : 1 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (full) {
      // Scroll through the page so lazy images load and scroll reveals fire, then return to top.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      // Wait for every shown image (dev server transforms images on first request).
      // Lazy images inside display:none (e.g. the stack's back cards on phones) never load, so skip them,
      // and give up after 15 s rather than hang.
      await page.evaluate(() => Promise.race([
        Promise.all([...document.images].filter((img) => img.getClientRects().length)
          .map((img) => img.complete ? 0 : new Promise((r) => { img.onload = img.onerror = r; }))),
        new Promise((r) => setTimeout(r, 15000)),
      ]));
      await page.waitForTimeout(900);
    }
    const file = join(outDir, `${label}-${vp.name}.${png ? 'png' : 'jpg'}`);
    await page.screenshot({ path: file, fullPage: full, ...(png ? {} : { quality: 70 }) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${file}${overflow ? '  WARN: horizontal overflow' : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}
