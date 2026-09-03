// A6 · Captura de pares app ↔ maqueta, al MISMO viewport y con el MISMO nombre.
//
//   node docs/auditorias/A6/capturar.mjs <baseURL> [pantalla ...]
//   p. ej.: node docs/auditorias/A6/capturar.mjs http://localhost:4173 mostrador
//
// Deja:
//   docs/auditorias/A6/app/<pantalla>-normal.png       ← la app en <baseURL>
//   docs/auditorias/A6/maqueta/<pantalla>-normal.png   ← Nodo.html, misma pantalla
//
// ⚠️ Por qué se captura la MAQUETA y no se comparan los .png de reskin-referencia/:
//    esos archivos son JPEG (aunque digan .png), de ~30 KB, "escaladas para entrar en
//    una sola imagen" (LEEME.md nota 7). Son un proxy con pérdida. Nodo.html es la
//    maqueta misma, y renderizada al mismo viewport que la app da un par honesto.
//
// Viewport 1440×900: la maqueta declara min-width 1240 / min-height 680; 1440×900
// es un escritorio corriente que deja aire a los dos lados y cabe el panel de
// cobro (≥360) con el sidebar (214).
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [baseURL, ...pantallas] = process.argv.slice(2);
if (!baseURL) { console.error('uso: capturar.mjs <baseURL> [pantalla ...]'); process.exit(2); }
const LISTA = pantallas.length ? pantallas : ['mostrador'];

function loadEnv(p) {
  try {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sin archivo */ }
}
loadEnv('.env'); loadEnv('.env.test');

const VIEWPORT = { width: 1440, height: 900 };
const OUT_APP = 'docs/auditorias/A6/app';
const OUT_MOCK = 'docs/auditorias/A6/maqueta';
mkdirSync(OUT_APP, { recursive: true });
mkdirSync(OUT_MOCK, { recursive: true });

// Ruta de la app y rótulo del sidebar de la maqueta, por pantalla.
const MAPA = {
  mostrador:  { ruta: '/ventas',            mock: 'Mostrador' },
  pedidos:    { ruta: null,                 mock: 'Pedidos' },       // no existe en la app
  compras:    { ruta: '/compras',           mock: 'Compras' },
  gastos:     { ruta: '/historial-gastos',  mock: 'Gastos' },
  catalogo:   { ruta: '/productos',         mock: 'Catálogo' },
  inventario: { ruta: '/inventario',        mock: 'Inventario' },
  clientes:   { ruta: '/fiado?tab=customers', mock: 'Clientes' },
  cartera:    { ruta: '/fiado',             mock: 'Cartera' },
  utilidades: { ruta: '/reportes',          mock: 'Utilidades' },
  historial:  { ruta: '/historial',         mock: 'Historial' },
  turnos:     { ruta: '/historial-turnos',  mock: 'Turnos' },
  configuracion: { ruta: '/configuracion',  mock: 'Configuración' },
};

const browser = await chromium.launch();

// ── LA APP ─────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CO' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[app pageerror]', String(e).slice(0, 200)));

  await page.goto(baseURL + '/login');
  await page.locator('input[autocomplete="email"]').fill(process.env.E2E_OWNER_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.E2E_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/ventas/, { timeout: 20_000 });

  for (const nombre of LISTA) {
    const def = MAPA[nombre];
    if (!def) { console.log('?? pantalla desconocida:', nombre); continue; }
    if (!def.ruta) { console.log('--', nombre, ': sin ruta en la app (NO EXISTE) — se captura solo la maqueta'); continue; }
    await page.goto(baseURL + def.ruta);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    if (nombre === 'mostrador') {
      // "normal" en la maqueta es una venta EN CURSO: se agrega un producto para
      // que el par compare lo mismo. Se busca por el nombre del producto del lab.
      const card = page.getByTestId('product-card').filter({ hasText: 'Lab Cerveza' }).first();
      if (await card.count()) { await card.click(); await page.waitForTimeout(400); }
    }
    await page.waitForTimeout(800);
    const f = path.join(OUT_APP, `${nombre}-normal.png`);
    await page.screenshot({ path: f, fullPage: false });
    console.log('app     →', f);
  }
  await ctx.close();
}

// ── LA MAQUETA ─────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.resolve('docs/reskin-referencia/Nodo.html')).href);
  await page.waitForTimeout(3000);
  for (const nombre of LISTA) {
    const def = MAPA[nombre];
    if (!def) continue;
    // El sidebar de la maqueta navega por texto; "Cartera" aparece dos veces
    // (título de grupo y entrada), así que se toma el último.
    const item = page.getByText(def.mock, { exact: true }).last();
    if (await item.count()) { await item.click(); await page.waitForTimeout(600); }
    else console.log('?? la maqueta no tiene la entrada', def.mock);
    const f = path.join(OUT_MOCK, `${nombre}-normal.png`);
    await page.screenshot({ path: f, fullPage: false });
    console.log('maqueta →', f);
  }
  await ctx.close();
}

await browser.close();
