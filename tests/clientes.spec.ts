import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { desactivarPorNombre } from './helpers/fixture'

// ============================================================================
// CREAR Y DESACTIVAR UN CLIENTE POR LA PANTALLA — Y ACÁ ESO ES EL SUJETO
//
// 🔴 POR QUÉ EXISTE ESTE ARCHIVO, y no es prolijidad: al migrar el andamio de
//    clientes a API (deuda 131) se midió quién cubría ese camino, y la respuesta
//    fue NADIE.
//
//      customer-save        -> 2 sitios, los DOS andamio (fiado · historial-filtro)
//      customer-deactivate  -> 1 sitio,  la LIMPIEZA de fiado
//
//    Con categorías y productos la misma medición dio lo contrario:
//    `productos.spec` los cubre **como sujeto**, así que moverlos no borraba
//    nada. Acá la cobertura era **incidental** —un efecto de que el andamio
//    pasara por ahí— y migrarla sin reponerla la habría borrado **en verde**,
//    que es exactamente el riesgo que la deuda 131 dice medir antes de mover.
//
// ⚠️ Y `plazo-de-credito` y `listas-de-precios` NO alcanzan como reemplazo,
//    aunque los dos ABRAN este formulario por la pantalla: aseveran sobre sus
//    controles —el plazo es un `select`, ninguna lista nace marcada— y **nunca
//    guardan**. Abrir el modal y guardarlo son dos caminos distintos, y el
//    segundo es el que escribe.
//
// 🔴 Y LA LIMPIEZA VA EN `afterAll`, NO COMO ÚLTIMO CASO (deuda 129): un caso es
//    lo primero que se saltea cuando otro falla; `afterAll` corre igual. Acá
//    importa el doble, porque el caso ② ES la desactivación: si fallara, su
//    propia limpieza es lo único que saca al cliente del picker de los specs que
//    no hablan de él (deuda 67).
// ============================================================================

const CLIENTE = `E2E Cliente UI ${Date.now().toString().slice(-6)}`

test.afterAll(async () => {
  await desactivarPorNombre('customers', [CLIENTE])
})

test.describe.serial('Clientes · el formulario', () => {
  test('crear un cliente por el formulario lo deja en la lista', async ({ page }) => {
    await loginAsOwner(page)
    // El formulario vive en la pestaña CLIENTES; /fiado abre en Cartera.
    await page.goto('/fiado')
    await page.getByTestId('fiado-tab-customers').click()
    await page.getByTestId('new-customer-btn').click()
    await expect(page.getByTestId('customer-form-modal')).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('customer-name').fill(CLIENTE)
    await page.getByTestId('customer-save').click()

    // El modal se cierra Y la fila aparece. Las dos: que el modal cierre no dice
    // que haya escrito nada, y que la fila esté no dice que el modal se cerró.
    await expect(page.getByTestId('customer-form-modal')).toHaveCount(0)
    await expect(page.getByTestId('customer-row').filter({ hasText: CLIENTE })).toBeVisible()
  })

  test('desactivarlo lo saca de la lista, y pide confirmación antes', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/fiado')
    await page.getByTestId('fiado-tab-customers').click()

    const fila = page.getByTestId('customer-row').filter({ hasText: CLIENTE })
    await expect(fila, 'el caso anterior tiene que haberlo dejado creado').toBeVisible()

    // 🔴 LA CONFIRMACIÓN SE ASEVERA, NO SE ACEPTA A CIEGAS. `handleDeactivate`
    //    abre un `window.confirm` nativo; un `page.on('dialog', d => d.accept())`
    //    suelto pasaría igual si el confirm desapareciera — y entonces un clic
    //    accidental desactivaría a un cliente real sin preguntar.
    let preguntado = ''
    page.once('dialog', (d) => { preguntado = d.message(); d.accept() })

    await fila.getByTestId('customer-deactivate').click()
    await expect(fila).toHaveCount(0)

    expect(
      preguntado,
      'desactivar tiene que PREGUNTAR: sin el confirm, un clic en la papelera es irreversible ' +
      'desde la pantalla (no hay «reactivar» en la UI)',
    ).toContain(CLIENTE)
  })
})
