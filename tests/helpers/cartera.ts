import { createClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'

// ============================================================================
// SACAR DE CARTERA LO QUE UN SPEC DEJÓ A CRÉDITO
//
// 🔴 POR QUÉ EXISTE, con la cuenta que lo motivó (deuda 130): desactivar al
//    cliente de fixture **no saca su deuda**. Cartera filtra ÓRDENES, no
//    clientes — así que la limpieza se veía correcta y dejaba la venta contando
//    en «Créditos abiertos» y en «Total por cobrar», que es plata.
//    Medido: **+13 ventas vivas por corrida**, confirmado en tres corridas
//    seguidas (13 → 26 → 39), repartidas entre CINCO specs. Y a las 63 que había
//    acumuladas hubo que anularlas con un `update` directo, porque ningún camino
//    del producto las alcanzaba.
//
// 🔴 PAGA, NO ANULA — y no es una preferencia: **anular no está disponible acá.**
//    `register_sale_void` tiene tres guards que una limpieza choca:
//      · exige jornada ABIERTA;
//      · la venta tiene que ser de la jornada CORRIENTE
//        (`v_created_at < v_jornada_opened` ⇒ «pertenece a una jornada cerrada»);
//      · y rechaza si la venta a crédito YA TIENE ABONOS
//        («anulala mediante una devolucion»).
//    Medido en las 63: **20 tenían abonos**, así que ni con el turno abierto se
//    podían anular. `register_debt_payment`, en cambio, **funciona con la jornada
//    cerrada** —tiene la rama `requiere_conciliacion` justamente para eso—.
//
// > **Pagar está disponible donde anular no lo está.** Esa asimetría no la
// > decidió nadie y está anotada como deuda propia: son dos operaciones con el
// > mismo perfil —las dos mueven plata contra una jornada cerrada— y guards
// > distintos. Es la misma pared que la clienta encontró al querer anular una
// > venta vieja.
//
// ⚠️ UN MECANISMO Y NO DOS. Se podría anular las que no tienen abonos y pagar las
//    que sí, pero eso deja una regla que hay que recordar —«anulá ANTES de cerrar
//    el turno»— y este archivo tiene medido qué pasa con las reglas que dependen
//    de que alguien se acuerde en el momento correcto. Pagar sirve en los cuatro
//    escenarios: con abonos y sin, con la jornada abierta y cerrada.
//
// ⚠️ Y LO QUE ESCRIBE, dicho porque toda limpieza en este sistema es una
//    ESCRITURA: una fila en `debt_payments` por venta, y con la jornada cerrada
//    además `requiere_conciliacion = true`. Es más filas que un `update`, y es el
//    camino del producto: la venta ocurrió y se cobró. **La historia no se
//    reescribe.**
// ============================================================================

/** Los prefijos con que el arnés nombra su fixture. Salen del código, no de la memoria. */
export const PREFIJOS_DE_FIXTURE = ['E2E %', 'AV %', 'RLS Neg %']

/** Un cliente anon con la sesión del owner. Cada limpieza abre el suyo: no comparte estado. */
async function clienteDelOwner() {
  const db = createClient(
    process.env.VITE_NODO_SUPABASE_URL!,
    process.env.VITE_NODO_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await db.auth.signInWithPassword({
    email: process.env.E2E_OWNER_EMAIL!,
    password: process.env.E2E_OWNER_PASSWORD!,
  })
  // 🔴 El error se CAPTURA y se asevera. Una limpieza que no puede entrar y sigue
  //    adelante es una escritura sin verificador — y de ésas hay 44 medidas en
  //    `tests/` (deuda 115).
  expect(error, `limpieza: no se pudo entrar como owner — ${error?.message}`).toBeNull()
  return db
}

/**
 * Desactiva los clientes de fixture cuyo nombre empieza con alguno de `nombres`,
 * y ASEVERA que no quedó ninguno activo.
 *
 * ⚠️ Está acá, al lado de `sacarDeCartera`, porque son **las dos mitades de lo
 *    mismo**: un spec que vende a crédito deja una venta Y un cliente, y limpiar
 *    sólo el cliente es exactamente el defecto de la deuda 130 —Cartera filtra
 *    órdenes—. Separarlas en dos archivos invita a llamar una y olvidar la otra.
 */
export async function desactivarClientes(nombres: string[]): Promise<void> {
  const db = await clienteDelOwner()
  for (const n of nombres) {
    const { error } = await db.from('customers').update({ is_active: false }).like('name', `${n}%`).select('id')
    expect(error, `limpieza: fallo desactivando "${n}" — ${error?.message}`).toBeNull()
  }
  const { data, error } = await db.from('customers').select('name').eq('is_active', true)
    .or(nombres.map((n) => `name.like.${n}%`).join(','))
  expect(error, `limpieza: fallo verificando — ${error?.message}`).toBeNull()
  expect(
    (data ?? []).map((c) => c.name).join(' · ') || 'ninguno',
    'QUEDARON CLIENTES DE FIXTURE ACTIVOS: un cliente de fixture activo aparece ' +
    'en el picker del Mostrador de specs que no hablan de él.',
  ).toBe('ninguno')
}

/**
 * Deja en cero la cartera de las ventas a crédito cuyo `customer_name` empieza
 * con alguno de los `nombres` dados, y ASEVERA que no quedó ninguna.
 *
 * 🔴 ASEVERA EL ESTADO, NO LA OPERACIÓN — *«esta venta ya no está en Cartera»* y
 *    no *«el pago devolvió ok»*. El estado describe lo que se quería; la
 *    operación puede haber sido innecesaria (otra corrida ya la pagó) y eso no
 *    es un fallo. Es la misma forma que las limpiezas de sede.
 *
 * @param nombres el PREFIJO del spec SIN su sufijo aleatorio — `'E2E Total'`, no
 *                `'E2E Total ' + SUFFIX`. Se le agrega `%` a cada uno.
 *
 * 🔴 EL PREFIJO Y NO EL NOMBRE DE ESTA CORRIDA, y es lo que hace que el
 *    mecanismo CONVERJA: con el sufijo, una corrida que muere a mitad deja su
 *    venta viva **para siempre** —la corrida siguiente tiene otro sufijo y no la
 *    matchea—, y la sonda queda en rojo permanente por algo que nadie va a
 *    limpiar. Medido al estrenar este helper: un mutante dejó una huérfana y el
 *    `afterAll` de la corrida siguiente no la veía.
 * ⚠️ Y limpiar la familia entera es seguro acá porque `workers: 1`: no hay otra
 *    corrida con una venta en vuelo. Con paralelismo esto habría que revisarlo,
 *    y está anotado en el criterio de paralelizar la suite.
 */
export async function sacarDeCartera(nombres: string[]): Promise<number> {
  const db = createClient(
    process.env.VITE_NODO_SUPABASE_URL!,
    process.env.VITE_NODO_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { error: eLogin } = await db.auth.signInWithPassword({
    email: process.env.E2E_OWNER_EMAIL!,
    password: process.env.E2E_OWNER_PASSWORD!,
  })
  // 🔴 El error se CAPTURA y se asevera. Una limpieza que no puede entrar y
  //    sigue adelante es una escritura sin verificador.
  expect(eLogin, `sacarDeCartera: no se pudo entrar como owner — ${eLogin?.message}`).toBeNull()

  const or = nombres.map((n) => `customer_name.like.${n}%`).join(',')

  const vivas = async () => {
    const { data, error } = await db.from('orders')
      .select('id, order_number, customer_name, total')
      .is('cancelled_at', null).in('payment_status', ['pending', 'partial']).or(or)
    expect(error, `sacarDeCartera: fallo leyendo Cartera — ${error?.message}`).toBeNull()
    return data ?? []
  }

  const antes = await vivas()
  for (const o of antes) {
    // El saldo se pide a la base y no se calcula acá: `p_amount > saldo` es un
    // guard de la RPC, así que un saldo mal derivado la haría rechazar.
    const { data: ab, error: eAb } = await db.from('debt_payments').select('amount').eq('order_id', o.id)
    expect(eAb, `sacarDeCartera: fallo leyendo abonos — ${eAb?.message}`).toBeNull()
    const abonado = (ab ?? []).reduce((s, r) => s + Number(r.amount), 0)
    const saldo = Number(o.total) - abonado
    if (saldo <= 0) continue
    const { error } = await db.rpc('register_debt_payment', {
      p_order_id: o.id,
      p_amount: saldo,
      p_payment_method: 'transfer',
    })
    // No se asevera acá: si una falla, lo dice el estado de abajo con su lista.
    if (error) console.warn(`  sacarDeCartera: #${o.order_number ?? '—'} no se pudo pagar — ${error.message}`)
  }

  const despues = await vivas()
  expect(
    despues.map((o) => `#${o.order_number ?? '—'} ${o.customer_name}`).join(' · ') || 'ninguna',
    'QUEDARON VENTAS DE FIXTURE VIVAS EN CARTERA: cada corrida suma y ninguna se ' +
    'paga nunca, así que empujan el conteo contra el tope de 1000 de `getDebts` ' +
    '(deuda 128). Desactivar al cliente NO alcanza: Cartera filtra órdenes.',
  ).toBe('ninguna')

  return antes.length
}
