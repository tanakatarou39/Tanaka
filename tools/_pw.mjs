// shared helpers for the headless tools
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire('/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[key] = v;
    }
  }
  return a;
}

export function parseTimes(s) {
  // "0,5,10" or "10:20:2" (start:end:step)
  const out = [];
  for (const part of String(s).split(',')) {
    if (part.includes(':')) {
      const [a, b, st] = part.split(':').map(Number);
      for (let t = a; t <= b + 1e-9; t += st) out.push(Math.round(t * 1000) / 1000);
    } else out.push(parseFloat(part));
  }
  return out;
}

export async function open({ size = '1280x720', dpr = 1, url, extra = '' } = {}) {
  const [w, h] = size.split('x').map(Number);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // fonts are optional in tests (system CJK fonts used)
  const logs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|willReadFrequently/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  const base = url || 'file://' + ROOT + '/index.html';
  await page.goto(base + (base.includes('?') ? '&' : '?') + 'q=1&dpr=1&t=0' + extra);
  await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
  return { browser, page, logs, w, h };
}
