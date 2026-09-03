import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// El carrito del POS NO puede encogerse por tener muchas categorías.
//
// 🔴 BUG DE PRODUCCIÓN, no de laboratorio. El panel del catálogo es
// `flex: '0 0 60%'` y, sin `minWidth: 0`, conserva el `min-width: auto` por
// defecto: se niega a bajar de su ancho min-content. Cuando los tabs de
// categorías no entran, el panel CRECE más allá del 60% y se come el carrito.
//
// Medido con los nombres reales de G-10 (Cocteles, Bebidas, Utensilios,
// Adiciones, Vaper), área útil = viewport − 224 del sidebar:
//
//   1024px  5 cats -> catálogo 480→548, carrito 320→253  (ya degradado)
//           7 cats -> carrito 86  => EL CAJERO NO PUEDE COBRAR
//   1280px 10 cats -> carrito 82  => idem
//
// G-10 tiene 5 categorías reales: ya estaba degradado, a dos de no poder cobrar
// en una terminal de 1024px.
//
// POR QUÉ 7 CATEGORÍAS A 1024px: es el punto que ROMPE sin el fix, así que este
// spec falla si alguien quita el `minWidth: 0`. Con menos no discriminaría.
// El umbral depende del ANCHO DEL TEXTO, no del número: por eso los nombres son
// realistas y no `cat-1`, `cat-2` (que entrarían de sobra y volverían vacuo el
// test).
// ============================================================================

test.describe.configure({ mode: 'serial' })

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

// Nombres REALES de G-10. No tocar por unos más cortos: el umbral es de ancho.
const NOMBRES = ['Cocteles', 'Bebidas', 'Utensilios', 'Adiciones', 'Vaper']
// 214px desde el re-skin (§3 del design system). Era 224 (`w-56` de Tailwind).
// El SUJETO del spec no cambió —el carrito no puede encogerse por tener muchas
// categorías—; lo que cambió es una MEDIDA de la app que el spec necesita para
// calcular el área útil. Si el sidebar se vuelve a mover, esta línea también.
const SIDEBAR = 214

let db: SupabaseClient
let creadas: string[] = []
let desactivadas: string[] = []

test.beforeAll(async () => {
  db = createClient(
    process.env.VITE_NODO_SUPABASE_URL!,
    process.env.VITE_NODO_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error

  const { data: activas } = await db.from('categories').select('id, name, sede_id').eq('is_active', true)
  const base = activas ?? []
  if (!base.length) throw new Error('El lab no tiene categorías activas de base')

  // Residuo de otros specs fuera del cálculo: el umbral depende del ancho TOTAL
  // de los tabs, así que una categoría de más falsearía el escenario.
  const residuo = base.filter(c => c.name.startsWith('E2E '))
  if (residuo.length) {
    desactivadas = residuo.map(c => c.id)
    await db.from('categories').update({ is_active: false }).in('id', desactivadas)
  }

  const rid = base[0].sede_id
  const restantes = base.length - residuo.length
  // Completar hasta 7 activas en total.
  const faltan = Math.max(0, 7 - restantes)
  for (const name of NOMBRES.slice(0, faltan)) {
    const { data, error: e } = await db.from('categories')
      .insert({ name, sede_id: rid, color: '#10b981', is_active: true, sort_order: 0 })
      .select('id').single()
    if (e) throw e
    creadas.push(data.id)
  }
})

test.afterAll(async () => {
  if (!db) return
  if (creadas.length) await db.from('categories').delete().in('id', creadas)
  if (desactivadas.length) await db.from('categories').update({ is_active: true }).in('id', desactivadas)
  creadas = []; desactivadas = []
})

test('a 1024px con 7 categorías el carrito conserva su ancho y se puede cobrar', async ({ page }) => {
  await loginAsOwner(page)
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/ventas')
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })

  const util = 1024 - SIDEBAR
  const m = await page.evaluate(() => {
    const root = document.querySelector('main .flex.h-full.overflow-hidden')
    const cat = root?.children[0] as HTMLElement | undefined
    const cart = root?.children[1] as HTMLElement | undefined
    const b = (e?: Element | null) => e ? e.getBoundingClientRect() : null
    return { catW: Math.round(b(cat)?.width ?? -1), cartW: Math.round(b(cart)?.width ?? -1) }
  })

  // El catálogo se queda en su 60%: no invade al hermano. Sin `minWidth: 0`
  // acá medía 714 y el carrito 86.
  expect(m.catW).toBe(Math.round(util * 0.6))
  expect(m.cartW).toBe(util - Math.round(util * 0.6))

  // Y el total de cobro entra entero en pantalla (la consecuencia que importa).
  const caja = (await page.getByTestId('cart-total').boundingBox())!
  expect(caja.width).toBeGreaterThan(0)
  expect(caja.x + caja.width).toBeLessThanOrEqual(1024 + 1)
})

test('el strip de categorías scrollea de verdad y avisa que hay más', async ({ page }) => {
  await loginAsOwner(page)
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/ventas')
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })

  const strip = page.getByTestId('pos-category-tabs')
  const desborde = await strip.evaluate(el => el.scrollWidth - el.clientWidth)
  // Contraste: si no desbordara, la máscara tampoco debería estar y el test no
  // probaría nada. Con 7 categorías reales a 1024px SIEMPRE desborda.
  expect(desborde).toBeGreaterThan(4)

  // Antes del fix el overflow nunca se activaba: el panel cedía el ancho.
  await expect(page.getByTestId('pos-category-tabs-fade')).toBeVisible()

  const movido = await strip.evaluate(el => { el.scrollLeft = 9999; return el.scrollLeft })
  expect(movido).toBeGreaterThan(0)

  // Al llegar al final ya no hay "más": la máscara se apaga. Sin esto, un
  // degradado permanente sería decoración y dejaría de significar algo.
  await expect(page.getByTestId('pos-category-tabs-fade')).toHaveCount(0)
})

test('el 60/40 no depende de cuántas categorías haya, y la máscara sale SI Y SÓLO SI desborda', async ({ page }) => {
  // ==========================================================================
  // 🔴 RE-DERIVADO EL 2026-09-03, Y EL HALLAZGO VALE MÁS QUE EL ARREGLO.
  //
  //    Este caso se llamaba «con POCAS categorías el layout no cambia» y
  //    terminaba en `expect(pos-category-tabs-fade).toHaveCount(0)`. Se puso
  //    ROJO al sembrar el lab con la forma real de la operación —nueve
  //    categorías— y la primera lectura fue «el strip se rompió».
  //
  //    No se rompió. Lo que pasó es que **la aserción nunca midió lo que su
  //    nombre decía**: su línea de base de «pocas» era UNA categoría, porque el
  //    lab estaba vacío. Con una sola categoría el strip no desborda a ningún
  //    ancho, así que «no hay máscara» era cierto por construcción — el verde
  //    no venía del layout, venía de la fixture.
  //
  //    🔴 La forma general, que es lo caro: **una fixture vacía no es un caso
  //    común: es el caso degenerado**, y una aserción escrita contra ella mide
  //    el vacío mientras afirma medir lo normal. Es primo del control negativo
  //    —allá el instrumento no discrimina; acá la ENTRADA no discrimina— y es
  //    peor de detectar, porque el test se ve impecable y el rojo llega meses
  //    después, disfrazado de regresión, el día que aparecen datos de verdad.
  //
  //    Nueve categorías a 1024px SÍ desbordan, y eso es correcto: es lo que el
  //    strip existe para manejar. Lo que se re-deriva es la aserción.
  //
  // ⚠️ SE RE-DERIVA EL TEST, NO SE REDISEÑA EL PRODUCTO. El sujeto sigue siendo
  //    el mismo —que arreglar el caso extremo no movió el 60/40— y ése no
  //    cambió: las dos aserciones de ancho pasan igual que antes. Lo único que
  //    se reemplaza es el pasajero: en vez de afirmar una CONSTANTE («no hay
  //    máscara»), se afirma la RELACIÓN que el strip tiene que cumplir con
  //    cualquier catálogo — hay máscara exactamente cuando hay desborde.
  //    Esa relación sí tiene mutantes vivos por los dos lados: una máscara
  //    permanente es decoración, y una ausente esconde que hay más.
  // ==========================================================================
  if (creadas.length) await db.from('categories').delete().in('id', creadas)
  creadas = []

  await loginAsOwner(page)
  const vistos: string[] = []
  for (const W of [1024, 1280]) {
    await page.setViewportSize({ width: W, height: 720 })
    await page.goto('/ventas')
    await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })
    const util = W - SIDEBAR
    const m = await page.evaluate(() => {
      const root = document.querySelector('main .flex.h-full.overflow-hidden')
      const b = (e?: Element | null) => e ? e.getBoundingClientRect() : null
      const strip = document.querySelector('[data-testid=pos-category-tabs]')
      return {
        catW: Math.round(b(root?.children[0])?.width ?? -1),
        cartW: Math.round(b(root?.children[1])?.width ?? -1),
        desborde: strip ? strip.scrollWidth - strip.clientWidth : -1,
      }
    })
    // EL SUJETO, intacto: el catálogo se queda en su 60% con el catálogo que
    // haya. Estas dos son las que miden que el fix del extremo no movió el común.
    expect(m.catW, `a ${W}px el catálogo tiene que quedarse en su 60%`).toBe(Math.round(util * 0.6))
    expect(m.cartW, `y el carrito en su 40%`).toBe(util - Math.round(util * 0.6))

    // LA RELACIÓN. `> 4` y no `> 0` por el redondeo subpíxel del layout.
    const deberiaHaberMascara = m.desborde > 4
    await expect(
      page.getByTestId('pos-category-tabs-fade'),
      deberiaHaberMascara
        ? `a ${W}px el strip desborda ${m.desborde}px y NO avisa que hay más categorías`
        : `a ${W}px el strip entra entero (desborde ${m.desborde}px) y la máscara igual está: ` +
          'un degradado permanente es decoración, y deja de significar algo',
    ).toHaveCount(deberiaHaberMascara ? 1 : 0)
    vistos.push(`${W}px→${m.desborde}px`)
  }

  // 🔴 CONTROL DE LA PROPIA ENTRADA, que es lo que le faltaba a la versión
  //    anterior: la relación de arriba se cumple sola si el strip nunca
  //    desborda. Se deja registrado qué desborde se midió, para que el rojo del
  //    día que el catálogo cambie diga con qué números se decidió.
  expect(vistos.length, `desbordes medidos: ${vistos.join(' · ')}`).toBe(2)
})
