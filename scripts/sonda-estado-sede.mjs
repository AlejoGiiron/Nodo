// SONDA DE SOLO LECTURA. No escribe nada. Columnas pedidas por nombre (nunca
// `select('*')`: un volcado imprimiria `customer_name`, que es PII).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.VITE_NODO_SUPABASE_URL, env.VITE_NODO_SUPABASE_ANON_KEY)
await db.auth.signInWithPassword({ email: process.env.MPE, password: process.env.MPP })
const SEDE = 'd11e803c-298d-41fe-806f-ae71e84653f8'

const { data: j } = await db.from('jornadas')
  .select('id, opened_at, closed_at, closing_amount').eq('sede_id', SEDE).order('opened_at')
console.log('jornadas: %d  ·  abiertas: %d', j.length, j.filter((x) => !x.closed_at).length)
for (const x of j.slice(-3))
  console.log('   %s  ->  %s  arqueo=%s', x.opened_at, x.closed_at, x.closing_amount)

// CARTERA con la consulta DEL PRODUCTO, sin filtros propios
const { data: c } = await db.from('orders')
  .select('id, order_number, total, debt_payments(amount)')
  .eq('sede_id', SEDE).in('payment_status', ['pending', 'partial']).is('cancelled_at', null)
const saldo = c.reduce((a, x) => a + Number(x.total) -
  (x.debt_payments ?? []).reduce((b, d) => b + Number(d.amount), 0), 0)
console.log('\nCARTERA (consulta del producto): %d fila(s) · saldo %s', c.length, saldo.toLocaleString('es-CO'))
console.log('   numeros: ' + c.map((x) => x.order_number).sort((a, b) => a - b).join(', '))
