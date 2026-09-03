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
// Viewport 1440×900: la maqueta declara min-width 1240 / min-height 680 — pero
// ese 680 era la declaración de un DIBUJO, no una medición: el alto mínimo real
// del producto es 720, medido el 2026-09-03 contra la URL desplegada (ver §8.4
// de la skill). 1440×900
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
  // ⚠️ La pestaña Clientes NO es direccionable por URL (`?tab=` se ignora): hay
  //    que hacer clic. Eso mismo es evidencia del hallazgo S5 — Clientes no
  //    tiene entrada propia ni dirección propia.
  clientes:   { ruta: '/fiado', tab: 'fiado-tab-customers', mock: 'Clientes' },
  cartera:    { ruta: '/fiado',             mock: 'Cartera' },
  // 🔴 Reportes y Utilidades NO son la misma pantalla (decidido 2026-09-03).
  //    Utilidades es la cascada (ventas − costo = bruta − gastos = neta) y NO
  //    existe en la app: se captura solo la maqueta. Reportes existe y la
  //    maqueta no lo dibuja: se captura solo la app.
  utilidades: { ruta: null,                 mock: 'Utilidades' },
  reportes:   { ruta: '/reportes',          mock: null },
  historial:  { ruta: '/historial',         mock: 'Historial' },
  login:      { ruta: '__login__',          mock: null },
  turnos:     { ruta: '/historial-turnos',  mock: 'Turnos' },
  configuracion: { ruta: '/configuracion',  mock: 'Configuración' },
};

const browser = await chromium.launch();

// ── LA APP ─────────────────────────────────────────────────────────────────
// SOLO_MAQUETA=1 salta esta mitad: recapturar la maqueta no necesita tocar el lab.
if (!process.env.SOLO_MAQUETA) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CO' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[app pageerror]', String(e).slice(0, 200)));

  if (LISTA.includes('login')) {
    await page.goto(baseURL + '/login');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT_APP, 'login-normal.png') });
    console.log('app     → docs/auditorias/A6/app/login-normal.png');
  }
  await page.goto(baseURL + '/login');
  await page.locator('input[autocomplete="email"]').fill(process.env.E2E_OWNER_EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.E2E_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/ventas/, { timeout: 20_000 });

  for (const nombre of LISTA) {
    const def = MAPA[nombre];
    if (!def) { console.log('?? pantalla desconocida:', nombre); continue; }
    if (def.ruta === '__login__') continue;   // ya capturada antes de autenticar
    if (!def.ruta) { console.log('--', nombre, ': sin ruta en la app (NO EXISTE) — se captura solo la maqueta'); continue; }
    await page.goto(baseURL + def.ruta);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    if (nombre === 'mostrador') {
      // "normal" en la maqueta es una venta EN CURSO: se agrega un producto para
      // que el par compare lo mismo. Se busca por el nombre del producto del lab.
      const card = page.getByTestId('product-card').filter({ hasText: 'Lab Cerveza' }).first();
      if (await card.count()) { await card.click(); await page.waitForTimeout(400); }
    }
    if (def.tab) { await page.getByTestId(def.tab).click(); await page.waitForTimeout(600); }
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
    if (!def.mock) { console.log('--', nombre, ': la maqueta no lo dibuja (NO DIBUJADO) — solo app'); continue; }
    // 🔴 EL SELECTOR SE ACOTA AL SIDEBAR POR POSICIÓN, y no es cosmético: con
    //    `getByText(...).last()` la captura de "Historial" tomó el encabezado
    //    "Historial · últimos 6 movimientos" del panel de Clientes y NUNCA
    //    navegó — la pantalla capturada era otra. El sidebar mide 214px, así que
    //    el ítem correcto es el que cae dentro de esa franja.
    // 🔴 Y NO ALCANZA CON ACOTAR AL SIDEBAR: el TITULO DE GRUPO "Cartera" y el
    //    ITEM "Cartera" se llaman igual y los dos caen en la franja. El primero
    //    en orden de DOM es el titulo de grupo, que no navega — asi que la
    //    captura de `cartera` salio siendo el MOSTRADOR. Los rotulos de grupo
    //    arrancan pegados al borde (x~20) y los items van despues del icono
    //    (x~52): el item es el que NO empieza en el margen.
    //    ⚠️ Y la geometria tampoco alcanza: probe con «el rotulo que no empieza
    //    en el margen» (x>40, el item lleva icono y el grupo no) y eso dejo
    //    afuera a "Configuracion", que vive en el PIE y tampoco tiene icono. La
    //    unica propiedad que separa un item de un rotulo no es donde esta: es
    //    que NAVEGA. Asi que se prueban todos los candidatos del sidebar y se
    //    queda el que hace cambiar el titulo — el control elige, no confirma.
    const cands = page.getByText(def.mock, { exact: true });
    const n = await cands.count();
    const titulo = async () => page.evaluate(() => {
      const el = document.elementFromPoint(275, 28);
      return el ? (el.textContent || '').trim().slice(0, 60) : '';
    });
    let ok = false;
    for (let i = 0; i < n && !ok; i++) {
      const c = cands.nth(i);
      const box = await c.boundingBox().catch(() => null);
      if (!box || box.x >= 214) continue;          // fuera del sidebar (214px)
      await c.click().catch(() => {});
      await page.waitForTimeout(600);
      ok = (await titulo()).includes(def.mock);
    }
    if (!ok) {
      console.log(`?? NO SE NAVEGO a "${def.mock}": el titulo dice "${await titulo()}" — NO se captura`);
      continue;
    }
    console.log('   control: titulo =', JSON.stringify(await titulo()));
    const f = path.join(OUT_MOCK, `${nombre}-normal.png`);
    await page.screenshot({ path: f, fullPage: false });
    console.log('maqueta →', f);
  }
  await ctx.close();
}

await browser.close();
