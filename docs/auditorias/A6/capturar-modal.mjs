// A6 · Captura de MODALES ABIERTOS, para el re-skin (deuda 88).
//
//   node docs/auditorias/A6/capturar-modal.mjs <baseURL> <etiqueta> [modal ...]
//   p. ej.: node docs/auditorias/A6/capturar-modal.mjs http://localhost:5180 antes
//
// Deja: docs/auditorias/A6/modales/<modal>-<etiqueta>.png
//
// 🔴 POR QUÉ EXISTE, y es el hallazgo de A6 leído al revés: `capturar.mjs`
//    captura el estado NORMAL de cada pantalla, así que **no vio ni un modal**.
//    Por eso el censo de hexes cerró once pantallas mientras 51 ocurrencias del
//    emerald de Vento seguían vivas — casi todas adentro de modales. Una
//    auditoría visual sólo ve los estados que abre.
//
// ⚠️ EL PAR ACÁ NO ES app↔maqueta: es ANTES↔DESPUÉS. La maqueta (`Nodo.html`)
//    no dibuja estos modales, así que no hay contra qué parear del otro lado.
//    La referencia es §4 de la skill `nodo-design-system`, que sí los
//    especifica. Se dice para que nadie lea estas capturas como si fueran el
//    par de A6.
//
// ⚠️ Y el orden importa: las de `antes` se sacan ANTES de editar `src/`. Con
//    HMR, editar mientras el navegador está abierto cambia la app debajo de la
//    captura — el mismo criterio por el que una corrida en segundo plano y una
//    edición son excluyentes.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [baseURL, etiqueta, ...pedidos] = process.argv.slice(2);
if (!baseURL || !etiqueta) {
  console.error('uso: capturar-modal.mjs <baseURL> <antes|despues> [modal ...]');
  process.exit(2);
}

function loadEnv(p) {
  try {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sin archivo */ }
}
loadEnv('.env'); loadEnv('.env.test');

const VIEWPORT = { width: 1440, height: 900 };   // el mismo que A6, para poder comparar
const OUT = 'docs/auditorias/A6/modales';
mkdirSync(OUT, { recursive: true });

// Cada entrada dice cómo LLEGAR y cómo ABRIR. `control` es un texto que TIENE
// que estar en el modal abierto: sin él, una captura de la pantalla de atrás se
// ve como una captura válida — que es exactamente el defecto que A6 pagó dos
// veces.
const MODALES = {
  'producto-nuevo': {
    ruta: '/productos',
    abrir: async (page) => page.getByRole('button', { name: /Nuevo producto/i }).first().click(),
    control: 'Nombre',
  },
  'producto-editar': {
    ruta: '/productos',
    // El lápiz vive DENTRO de la fila del catálogo; se acota por contenedor, no
    // por posición global (un `title="Editar"` suelto matchea en varias filas).
    abrir: async (page) =>
      page.getByTestId('catalogo-row').first().locator('button[title="Editar"]').click(),
    control: 'Nombre',
  },
  // ⚠️ No es un modal: es la pantalla. Entra igual porque su defecto es el
  //    mismo -- botones con el resplandor emerald de Vento -- y porque el par
  //    de A6 la capturo ANTES de que existieran esos botones.
  'configuracion': {
    ruta: '/configuracion',
    // El nav de secciones es lateral (220px). Se acota por el <nav>, no por el
    // texto suelto: "Sedes" tambien aparece en el cuerpo de la seccion.
    abrir: async (page) => page.locator('nav').getByText('Sedes', { exact: true }).first().click(),
    control: 'Crear sede',
    pantalla: true,   // no hay dialogo que buscar: el control mira la pagina
  },
  // 🔴 EL ESTADO, no solo la pantalla (criterio del 2026-09-04). Antes de
  //    agregarlos me pregunte en que estado su primario esta PRESENTE: los dos
  //    solo se apagan mientras la mutacion esta en vuelo, asi que nacen
  //    encendidos y no hay que llenar nada. La pregunta se hace igual — la
  //    respuesta "ya esta" es una respuesta, no una excusa para no preguntar.
  'turno-abrir': {
    ruta: '/ventas',
    abrir: async (page) => page.getByRole('button', { name: /Abrir turno/i }).first().click(),
    control: 'Abrir turno de caja',
  },
  'cliente-nuevo': {
    ruta: '/fiado',
    abrir: async (page) => {
      await page.getByTestId('fiado-tab-customers').click();
      await page.waitForTimeout(500);
      await page.getByTestId('new-customer-btn').click();
    },
    control: 'Crear cliente',
  },
  'categoria-nueva': {
    ruta: '/productos',
    abrir: async (page) => page.getByRole('button', { name: /Nueva categor/i }).first().click(),
    control: 'Nombre',
  },
};

const LISTA = pedidos.length ? pedidos : Object.keys(MODALES);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'es-CO' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

await page.goto(baseURL + '/login');
await page.locator('input[autocomplete="email"]').fill(process.env.E2E_OWNER_EMAIL);
await page.locator('input[autocomplete="current-password"]').fill(process.env.E2E_OWNER_PASSWORD);
await page.getByRole('button', { name: 'Ingresar' }).click();
await page.waitForURL(/\/ventas/, { timeout: 20_000 });

let fallos = 0;
for (const nombre of LISTA) {
  const def = MODALES[nombre];
  if (!def) { console.log('?? modal desconocido:', nombre); fallos++; continue; }
  await page.goto(baseURL + def.ruta);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
  try { await def.abrir(page); } catch (e) { console.log(`?? ${nombre}: no se pudo abrir — ${String(e).slice(0, 120)}`); fallos++; continue; }
  await page.waitForTimeout(700);

  // 🔴 EL CONTROL DECIDE, NO CONFIRMA: si el modal no está, NO se captura. Un
  //    control que sólo imprime una advertencia deja el archivo escrito igual, y
  //    después alguien cierra una tanda con la captura de la pantalla de atrás.
  //    Para una PANTALLA no hay dialogo que acotar, asi que el control mira la
  //    pagina — pero sigue siendo un control que DECIDE, no un aviso.
  const dialogo = def.pantalla
    ? page.getByText(def.control, { exact: false })
    : page.locator('[role="dialog"], [data-modal], form').filter({ hasText: def.control });
  if (await dialogo.count() === 0) {
    console.log(`?? ${nombre}: el modal NO contiene «${def.control}» — NO se captura`);
    fallos++;
    continue;
  }
  const f = path.join(OUT, `${nombre}-${etiqueta}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log('modal →', f);
}

await ctx.close();
await browser.close();
console.log(`\nmodales pedidos ${LISTA.length} · no capturados ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
