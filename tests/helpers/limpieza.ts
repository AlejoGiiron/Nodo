import { expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// LIMPIEZA DE ORGANIZACIONES DESECHABLES — con la aserción puesta
//
// 🔴 POR QUÉ EXISTE, Y POR QUÉ ES UNA FUNCIÓN Y NO DOS COPIAS:
//    `onboarding-organizacion` y `alta-usuario-entre-sedes` limpiaban así:
//
//        await comoServicio.from('sedes').delete().in('organization_id', creadas)
//
//    `supabase-js` **no lanza**: devuelve `{ data, error }`. Ese error no lo
//    leía nadie, así que la limpieza podía dejar de funcionar por completo
//    —RLS que cambia, una FK que pasa a restringir— y el spec seguía VERDE,
//    acumulando residuo por corrida. Es la misma forma que dejó dos sedes
//    huérfanas por `rbac-escalada`, y la tercera aparición en tres días.
//
//    Las dos limpiezas eran el mismo texto escrito dos veces. Dos copias
//    correctas hoy son dos copias que mañana no lo son, y la que se congela es
//    la del spec que nadie mira (R1). Así que la decisión vive acá y las dos
//    la LLAMAN.
//
// ⚠️ ASEVERA EL ESTADO, NO LA OPERACIÓN. «No quedan sedes de estas orgs» cierra
//    aunque alguna ya se hubiera ido por otro camino; «el delete borró N» exige
//    saber cuántas había y se rompe con cualquier variación legítima.
//
// 📋 ORDEN, y no es arbitrario: primero las cuentas de Auth, porque
//    `profiles.id -> auth.users` y `user_stores.user_id -> profiles` siguen en
//    `on delete cascade` (la tanda A de la deuda 114 NO las toca). Borrar la
//    cuenta arrastra perfil y accesos, y recién entonces la sede queda sin
//    nadie apuntándole. Invertido, la sede no se puede borrar.
// ============================================================================

/**
 * Borra las cuentas de Auth y después las organizaciones desechables, y
 * **falla si no pudo**, nombrando qué quedó vivo.
 */
export async function limpiarOrganizaciones(
  admin: SupabaseClient | null,
  usuarios: string[],
  orgs: string[],
): Promise<void> {
  if (!admin) return

  // 1 · las cuentas primero: arrastran perfil y accesos por cascade
  for (const id of usuarios) {
    const { error } = await admin.auth.admin.deleteUser(id)
    expect(
      error?.message ?? 'sin error',
      `NO SE PUDO BORRAR LA CUENTA DE AUTH ${id}. Su perfil y sus accesos siguen ` +
      'vivos, así que la sede que los contiene tampoco se va a poder borrar.',
    ).toBe('sin error')
  }

  if (!orgs.length) return

  // 2 · el árbol, de la hoja a la raíz
  const pasos = [
    { tabla: 'sedes', col: 'organization_id' },
    { tabla: 'roles', col: 'organization_id' },
    { tabla: 'organizations', col: 'id' },
  ] as const

  for (const { tabla, col } of pasos) {
    const r = await admin.from(tabla).delete({ count: 'exact' }).in(col, orgs)
    expect(
      r.error?.message ?? 'sin error',
      `NO SE PUDO LIMPIAR \`${tabla}\` de las organizaciones ${orgs.join(', ')}. ` +
      'Si el código es 23503, algo quedó apuntándole: revisá que TODAS las cuentas ' +
      'de Auth creadas por el spec estén en la lista de usuarios a borrar — un ' +
      '`if (r.body.user_id)` que no se cumple deja el perfil vivo y la sede trabada.',
    ).toBe('sin error')
  }

  // 3 · EL ESTADO, que es lo que de verdad se quería
  const sedes = await admin.from('sedes')
    .select('id', { count: 'exact', head: true }).in('organization_id', orgs)
  expect(
    sedes.count,
    `QUEDARON SEDES HUÉRFANAS EN EL LAB, de las organizaciones ${orgs.join(', ')}. ` +
    'Una sede huérfana por corrida es exactamente el residuo que esta aserción ' +
    'existe para hacer visible.',
  ).toBe(0)

  const restantes = await admin.from('organizations')
    .select('id', { count: 'exact', head: true }).in('id', orgs)
  expect(
    restantes.count,
    `QUEDARON ORGANIZACIONES HUÉRFANAS EN EL LAB: ${orgs.join(', ')}`,
  ).toBe(0)
}
