import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// DEVOLVER UNA COMPRA, Y CORREGIR UN COSTO — deuda 49
//
// 🔴 QUÉ PRUEBA ESTE ARCHIVO, Y POR QUÉ VA CONTRA LAS RPC Y NO CONTRA LA
//    PANTALLA. Una devolución mueve TRES cosas a la vez —stock, caja y la
//    factura— y las tres tienen que cerrar con un número exacto. Una pantalla
//    que "acepta" no prueba nada: el modo de fallo de este módulo es un número
//    plausible y equivocado, que es justo el que nadie revisa (R7).
//
// ── LA DECISIÓN QUE EL ESQUEMA ENCARNA ────────────────────────────────────
// El promedio ponderado móvil NO es reversible: el costo que dejó la compra YA
// SE PROPAGÓ a las ventas que ocurrieron en el medio, congelado en cada línea
// (R1 punto 8). Deshacer la compra no puede deshacer eso — y no debería: esas
// ventas se cobraron con ese costo y su utilidad es un hecho ocurrido.
//
// Por eso la devolución **no toca `cost_price`**, y este archivo lo asevera con
// el número. Corregir el costo es un acto aparte, explícito y con motivo
// obligatorio: `adjust_cost`. La historia no se reescribe, se le agrega.
//
// ── LO QUE NO CUBRE, DICHO ────────────────────────────────────────────────
// · No hay UI para crear una devolución (deuda aparte). Acá se llama la RPC.
// · No se prueba el guard de jornada cerrada: cerrar la jornada del lab
//   rompería las demás specs, que corren en serie contra el mismo backend.
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

const SUFFIX = Date.now().toString().slice(-6)

// Los números están elegidos para que el factor NO se pueda confundir con su
// ausencia: 12 bultos de 50 son 600 unidades, y 600 no se parece a 12.
const BULTOS = 12
const FACTOR = 50
const COSTO_BULTO = 50_000
const COSTO_UNIDAD = COSTO_BULTO / FACTOR        // 1.000
const UNIDADES = BULTOS * FACTOR                 // 600
const DEVUELTOS = 2
const UNIDADES_DEVUELTAS = DEVUELTOS * FACTOR    // 100
const TOTAL_DEVOLUCION = DEVUELTOS * COSTO_BULTO // 100.000
const COSTO_AJUSTADO = 1_300

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let CAT = ''
let PROVEEDOR = ''
let PRODUCTO = ''        // el de la devolución
let PROD_AJUSTE = ''     // el de adjust_cost
let FACTURA = ''         // la compra original

async function leerProducto(id: string) {
  const { data, error } = await db
    .from('products').select('stock_qty, cost_price').eq('id', id).single()
  if (error) throw error
  return { stock: data.stock_qty, costo: data.cost_price === null ? null : Number(data.cost_price) }
}

async function jornadaAbierta(): Promise<string> {
  const abierta = await db.from('jornadas').select('id')
    .eq('sede_id', SEDE).is('closed_at', null).maybeSingle()
  if (abierta.data) return abierta.data.id as string
  const nueva = await db.from('jornadas')
    .insert({ sede_id: SEDE, opened_by: OWNER, opening_amount: 0 })
    .select('id').single()
  if (nueva.error) throw nueva.error
  return nueva.data.id as string
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string
  await jornadaAbierta()

  CAT = (await db.from('categories')
    .insert({ sede_id: SEDE, name: 'E2E Devol ' + SUFFIX }).select('id').single()).data!.id
  PROVEEDOR = (await db.from('suppliers')
    .insert({ sede_id: SEDE, name: 'E2E Proveedor Devol ' + SUFFIX }).select('id').single()).data!.id
  PRODUCTO = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: 'E2E Devuelto ' + SUFFIX,
    price: 2000, kind: 'simple', stock_tracking: true, stock_qty: 0,
  }).select('id').single()).data!.id
  PROD_AJUSTE = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: 'E2E Ajuste ' + SUFFIX,
    price: 2000, kind: 'simple', stock_tracking: true, stock_qty: 0,
  }).select('id').single()).data!.id

  // La compra original: 12 bultos de 50 a 50.000 el bulto.
  const compra = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: 'E2E-DEV-' + SUFFIX, notes: null },
    p_items: [{
      product_id: PRODUCTO, qty: BULTOS, unit_cost: COSTO_BULTO,
      purchase_unit: 'bulto', units_per_purchase_unit: FACTOR,
    }],
  })
  if (compra.error) throw new Error('fixture compra: ' + compra.error.message)
  FACTURA = (compra.data as { invoice_id: string }).invoice_id
})

test.afterAll(async () => {
  if (!db) return
  await db.from('products').update({ is_active: false }).in('id', [PRODUCTO, PROD_AJUSTE])
  await db.from('categories').update({ is_active: false }).eq('id', CAT)
  await db.from('suppliers').update({ is_active: false }).eq('id', PROVEEDOR)
  // Facturas y movimientos NO se borran: son asientos. Ver la nota de
  // tests/gastos-categoria.spec.ts — cash_movements no tiene policy de DELETE,
  // y no es un olvido.
})

test('la compra dejó el estado que la devolución tiene que revertir', async () => {
  // Precondición explícita: sin esto, un stock equivocado más adelante podría
  // venir de la compra y no de la devolución, y el rojo dirigiría al lugar
  // equivocado.
  const p = await leerProducto(PRODUCTO)
  expect(p.stock, BULTOS + ' bultos x ' + FACTOR + ' = ' + UNIDADES + ' unidades').toBe(UNIDADES)
  expect(p.costo, 'primera compra: el costo por unidad es el del bulto sobre el factor').toBe(COSTO_UNIDAD)
})

test('🔴 devolver 2 bultos: baja el stock en unidades, entra plata a caja, y el COSTO NO SE MUEVE', async () => {
  const antes = await leerProducto(PRODUCTO)

  const r = await db.rpc('register_purchase_return', {
    p_invoice_id: FACTURA,
    p_items: [{ product_id: PRODUCTO, qty: DEVUELTOS }],
    p_notes: 'E2E devolucion ' + SUFFIX,
  })
  expect(
    r.error,
    'DEVOLVER UNA COMPRA NO EXISTE: ni columna, ni RPC, ni UI (deuda 49). El §4 ' +
    'del design system reserva su color más fuerte a una acción que el producto ' +
    'no tiene',
  ).toBeNull()
  const out = r.data as { return_invoice_id: string; total: number; cash_movement_id: string | null }

  // ── 1 · STOCK, en unidades de venta ──────────────────────────────────────
  const despues = await leerProducto(PRODUCTO)
  expect(
    despues.stock,
    DEVUELTOS + ' bultos son ' + UNIDADES_DEVUELTAS + ' unidades: ' + antes.stock +
    ' menos ' + UNIDADES_DEVUELTAS + ' = ' + (UNIDADES - UNIDADES_DEVUELTAS) +
    '. Restar los BULTOS daría 598, que es plausible y está mal',
  ).toBe(UNIDADES - UNIDADES_DEVUELTAS)

  // ── 2 · EL COSTO NO SE MUEVE, y es la aserción que sostiene Utilidades ───
  expect(
    despues.costo,
    'la devolución NO recalcula el promedio ponderado: ese costo ya se propagó a ' +
    'las ventas del medio, congelado en cada línea (R1 punto 8). Revertirlo ' +
    'reescribiría utilidades ya cobradas',
  ).toBe(COSTO_UNIDAD)

  // ── 3 · LA FACTURA DE DEVOLUCIÓN, apuntando a la suya ────────────────────
  const dev = await db.from('purchase_invoices')
    .select('kind, returns_invoice_id, total, supplier_id')
    .eq('id', out.return_invoice_id).single()
  expect(dev.error).toBeNull()
  expect(dev.data!.kind, 'la devolución es una factura de kind=return, no una compra').toBe('return')
  expect(dev.data!.returns_invoice_id, 'y apunta a la compra que revierte').toBe(FACTURA)
  expect(Number(dev.data!.total), DEVUELTOS + ' x ' + COSTO_BULTO).toBe(TOTAL_DEVOLUCION)
  expect(dev.data!.supplier_id, 'el proveedor sale de la factura original, no del payload').toBe(PROVEEDOR)

  // La línea guarda el costo ORIGINAL, leído de la factura y no recibido.
  const linea = await db.from('purchase_invoice_items')
    .select('qty, unit_cost, subtotal, purchase_unit, units_per_purchase_unit')
    .eq('invoice_id', out.return_invoice_id).single()
  expect(linea.data!.qty, 'qty son unidades de COMPRA: 2 bultos').toBe(DEVUELTOS)
  expect(Number(linea.data!.unit_cost), 'el costo lo pone la factura original, no quien llama').toBe(COSTO_BULTO)
  expect(linea.data!.units_per_purchase_unit, 'y el factor viaja igual').toBe(FACTOR)

  // ── 4 · CAJA: la plata VUELVE ────────────────────────────────────────────
  expect(out.cash_movement_id, 'la devolución tiene que dejar su movimiento de caja').not.toBeNull()
  const mov = await db.from('cash_movements')
    .select('type, categoria, amount').eq('id', out.cash_movement_id!).single()
  expect(mov.data!.type, 'una devolución mete plata al cajón, no la saca').toBe('in')
  expect(
    mov.data!.categoria,
    'categoría propia: no es un abono de cliente ni una base. Meterla en "otro" ' +
    'la escondería del reporte',
  ).toBe('devolucion_compra')
  expect(Number(mov.data!.amount)).toBe(TOTAL_DEVOLUCION)

  // ── 5 · EL RASTRO DE STOCK, con su signo ─────────────────────────────────
  const sm = await db.from('stock_movements')
    .select('type, qty').eq('reference_id', out.return_invoice_id).single()
  expect(
    sm.data!.type,
    'type propio: "return" ya significa el reverso de una VENTA (stock que ' +
    'entra) y la pantalla de Inventario lo rotula así. El mismo valor no puede ' +
    'significar las dos direcciones',
  ).toBe('purchase_return')
  expect(sm.data!.qty, 'sale stock: el signo es negativo').toBe(-UNIDADES_DEVUELTAS)
})

test('🔴 no se puede devolver más de lo que dice la factura — y el mensaje da los números', async () => {
  // Ya se devolvieron 2 de 12: quedan 10. Pedir 11 tiene que rechazar.
  const antes = await leerProducto(PRODUCTO)
  const r = await db.rpc('register_purchase_return', {
    p_invoice_id: FACTURA,
    p_items: [{ product_id: PRODUCTO, qty: BULTOS - DEVUELTOS + 1 }],
    p_notes: 'E2E exceso ' + SUFFIX,
  })
  expect(r.error, 'devolver más de lo comprado tiene que rechazar').not.toBeNull()
  expect(r.error!.code, 'rechaza como violación de invariante').toBe('23514')
  expect(
    r.error!.message,
    'el rojo tiene que decir cuánto hay y cuánto se devolvió, no solo que falló',
  ).toMatch(/10/)

  // Y el rechazo es ATÓMICO: ni stock, ni caja, ni cabecera.
  const despues = await leerProducto(PRODUCTO)
  expect(despues.stock, 'el stock no se movió').toBe(antes.stock)
  const { count } = await db.from('purchase_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('returns_invoice_id', FACTURA)
  expect(count, 'sigue habiendo UNA sola devolución: la del caso anterior').toBe(1)
})

test('CONTRASTE — devolver exactamente los 10 que quedan SÍ entra', async () => {
  // 🔴 Sin esto, el rechazo de arriba pasaría con una RPC que rechaza SIEMPRE.
  //    Es el control negativo del guard.
  const r = await db.rpc('register_purchase_return', {
    p_invoice_id: FACTURA,
    p_items: [{ product_id: PRODUCTO, qty: BULTOS - DEVUELTOS }],
    p_notes: 'E2E resto ' + SUFFIX,
  })
  expect(r.error, 'el saldo exacto de la factura tiene que entrar').toBeNull()

  const p = await leerProducto(PRODUCTO)
  expect(p.stock, 'devuelta la compra entera, el stock vuelve a 0').toBe(0)
  expect(p.costo, 'y el costo sigue sin moverse, con el stock en cero').toBe(COSTO_UNIDAD)

  // Un tercer intento, aunque sea de 1, ya no tiene saldo.
  const otra = await db.rpc('register_purchase_return', {
    p_invoice_id: FACTURA,
    p_items: [{ product_id: PRODUCTO, qty: 1 }],
    p_notes: 'E2E sin saldo ' + SUFFIX,
  })
  expect(otra.error, 'la factura ya está devuelta entera: no queda nada').not.toBeNull()
})

test('🔴 adjust_cost: exige motivo, deja rastro, y NO reescribe lo ya vendido', async () => {
  // Compra suelta para que el producto tenga costo conocido: 3 unidades a 1.000.
  const compra = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: 'E2E-AJU-' + SUFFIX, notes: null },
    p_items: [{ product_id: PROD_AJUSTE, qty: 3, unit_cost: COSTO_UNIDAD }],
  })
  expect(compra.error).toBeNull()
  expect((await leerProducto(PROD_AJUSTE)).costo, 'precondición del ajuste').toBe(COSTO_UNIDAD)

  // Se vende UNA unidad con el costo viejo. Esta línea es el hecho ocurrido.
  const ord = await db.from('orders')
    .insert({ sede_id: SEDE, created_by: OWNER, canal: 'mostrador', total: 2000 })
    .select('id').single()
  expect(ord.error).toBeNull()
  const venta = ord.data!.id as string
  const alta = await db.rpc('add_order_items_with_extras', {
    p_order_id: venta,
    p_items: [{ product_id: PROD_AJUSTE, qty: 1, unit_price: 2000 }],
  })
  expect(alta.error).toBeNull()

  // ── 1 · SIN MOTIVO, RECHAZA (fail-closed) ────────────────────────────────
  for (const motivo of [null, '   ']) {
    const r = await db.rpc('adjust_cost', {
      p_product_id: PROD_AJUSTE, p_new_cost: COSTO_AJUSTADO, p_reason: motivo,
    })
    expect(
      r.error,
      'un costo que cambia sin motivo es un cambio de dinero sin rastro (motivo: ' +
      JSON.stringify(motivo) + ')',
    ).not.toBeNull()
  }
  expect((await leerProducto(PROD_AJUSTE)).costo, 'y el rechazo no movió nada').toBe(COSTO_UNIDAD)

  // ── 2 · CON MOTIVO, APLICA Y DEJA RASTRO ─────────────────────────────────
  const ok = await db.rpc('adjust_cost', {
    p_product_id: PROD_AJUSTE, p_new_cost: COSTO_AJUSTADO,
    p_reason: 'E2E conteo fisico ' + SUFFIX,
  })
  expect(ok.error).toBeNull()
  expect((await leerProducto(PROD_AJUSTE)).costo, 'el costo vigente es el nuevo').toBe(COSTO_AJUSTADO)

  const rastro = await db.from('product_cost_adjustments')
    .select('old_cost, new_cost, reason')
    .eq('product_id', PROD_AJUSTE).order('created_at', { ascending: false }).limit(1).single()
  expect(rastro.error, 'el ajuste tiene que quedar registrado: es plata').toBeNull()
  expect(Number(rastro.data!.old_cost), 'con el costo que había').toBe(COSTO_UNIDAD)
  expect(Number(rastro.data!.new_cost)).toBe(COSTO_AJUSTADO)
  expect(rastro.data!.reason).toContain(SUFFIX)

  // ── 3 · LA VENTA YA HECHA NO CAMBIA — la aserción que sostiene Utilidades ─
  const linea = await db.from('order_items').select('unit_cost').eq('order_id', venta).single()
  expect(
    Number(linea.data!.unit_cost),
    'Expected ' + COSTO_UNIDAD + ': la venta se cobró con el costo de ese momento ' +
    'y su utilidad es un hecho ocurrido. Si adjust_cost la reescribiera, el ' +
    'reporte de meses pasados daría distinto cada vez que se abre',
  ).toBe(COSTO_UNIDAD)
})
