// SONDA DE SOLO LECTURA. No escribe nada.
// Que es la orden que ya esta en la sede v3, y que consecuencias tiene cargar encima.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.VITE_NODO_SUPABASE_URL, env.VITE_NODO_SUPABASE_ANON_KEY)
await db.auth.signInWithPassword({ email: process.env.MPE, password: process.env.MPP })

const SEDE = 'd11e803c-298d-41fe-806f-ae71e84653f8'
const ORD  = '4b984fb3-8278-4370-94f4-ba98e8693298'

const { data: it, error: eI } = await db.from('order_items').select('*').eq('order_id', ORD)
console.log('lineas de la orden: ' + (eI ? 'error ' + eI.message : it.length))

const { data: pa, error: eP } = await db.from('payments').select('*').eq('order_id', ORD)
console.log('pagos de la orden:  ' + (eP ? 'error ' + eP.message : pa.length))

// ¿es fiado? -> aparece en cartera
const { data: o } = await db.from('orders')
  .select('is_fiado, plazo_dias, paid, payment_status, order_number').eq('id', ORD).single()
console.log('la fila, columnas de cartera: ' + JSON.stringify(o))

// ¿que numero seguiria?
const { data: mx } = await db.from('orders').select('order_number')
  .eq('sede_id', SEDE).order('order_number', { ascending: false }).limit(1)
console.log('mayor order_number en la sede: ' + JSON.stringify(mx))

// el cliente existe? (NO se imprime el nombre: es PII de la clienta)
const { count: cc } = await db.from('customers').select('*', { count: 'exact', head: true })
  .eq('id', '2837acfd-7fb6-4f40-b7b0-82e739781782')
console.log('el customer_id existe en customers: ' + cc)

// ¿hay stock_movements o debt_payments colgando?
for (const t of ['stock_movements', 'debt_payments']) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('sede_id', SEDE)
  console.log(t.padEnd(18) + ' en la sede: ' + (error ? 'error ' + error.message : count))
}
