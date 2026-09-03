import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { closeShiftIfOpen, openShiftIfClosed } from './helpers/shift'
import { waitPosReady, addPosProduct, abrirCobroCompleto } from './helpers/pos'

// "$ 12.000" → 12000
function parseCOP(text: string): number {
  return Number(text.replace(/[^\d]/g, ''))
}

test.describe('POS — venta y carrito', () => {
  test('agregar un producto al carrito calcula el total', async ({ page }) => {
    await loginAsOwner(page)
    await waitPosReady(page)
    await expect(page.getByText('Carrito vacío')).toBeVisible()

    await addPosProduct(page)

    await expect(page.getByText('Carrito vacío')).toHaveCount(0)
    const total = parseCOP(await page.getByTestId('cart-total').innerText())
    expect(total).toBeGreaterThan(0)
  })

  test('aplicar descuento porcentual cambia el total', async ({ page }) => {
    await loginAsOwner(page)
    await addPosProduct(page)

    const before = parseCOP(await page.getByTestId('cart-total').innerText())
    await page.getByRole('button', { name: '10%' }).click()

    // La fila de totales "Descuento (10%)" confirma que el descuento se aplicó.
    await expect(page.getByText('Descuento (10%)')).toBeVisible()
    const after = parseCOP(await page.getByTestId('cart-total').innerText())
    expect(after).toBeLessThan(before)
  })

  test('Cobrar exige turno abierto si no hay turno', async ({ page }) => {
    await loginAsOwner(page)

    // Carrito con ítems primero; luego garantizar estado "sin turno" justo antes
    // de cobrar (minimiza la ventana frente al estado compartido del backend).
    await addPosProduct(page)
    await closeShiftIfOpen(page)
    await expect(page.getByText('Sin turno')).toBeVisible()

    // 🔴 Acá el sujeto ES el botón de cobrar, así que se aprieta ÉSE y no el
    //    camino al cobro completo: con el cobro en línea (§8.15) «Cobrar» cobra
    //    en el acto, y lo que este caso mide es que sin turno NO llegue a
    //    cobrar — abre primero la apertura de caja. Usar el helper acá habría
    //    medido otra cosa: el helper espera el cobro completo, que con turno
    //    cerrado tampoco abre.
    await page.getByTestId('cobro-confirmar').click()
    await expect(
      page.getByRole('heading', { name: 'Abrir turno de caja' }),
      'sin turno el cobro no procede: pide abrir caja primero',
    ).toBeVisible()
  })

  test('checkout: 4 métodos de pago y cálculo de vuelto en efectivo', async ({ page }) => {
    await loginAsOwner(page)
    // Agregar el producto ANTES de tocar el turno (el banner que aparece/desaparece
    // al abrir turno reacomoda el layout y desestabiliza el click a la card).
    await addPosProduct(page)
    await openShiftIfClosed(page, 0) // cobrar requiere turno abierto

    await abrirCobroCompleto(page)

    // Paso método: los 4 métodos visibles.
    // Se aserta el testid `checkout-total` y no el texto 'Total a cobrar': desde
    // el re-skin ese rótulo aparece DOS veces — en el panel de cobro (que sigue
    // en el DOM detrás del modal) y en el modal —, y getByText en modo estricto
    // falla con dos coincidencias. El testid ya existía; la aserción no se
    // debilita, se vuelve específica: dice QUÉ total tiene que estar visible.
    await expect(page.getByTestId('checkout-total')).toBeVisible()
    // 🔴 POR TESTID Y NO POR TEXTO, por la MISMA razón que el `checkout-total` de
    //    arriba — y ésta es la parte incómoda: la nota de acá arriba explicaba
    //    exactamente esta clase, se aplicó al total y NO a estas tres líneas de
    //    abajo. Se arregló la instancia y no se barrió la clase (R3).
    //    Con el cobro en línea hay DOS grillas de medios montadas —la columna
    //    (`cobro-medio-*`) y el modal (`pay-method-*`)— así que el texto resuelve
    //    a dos elementos. El testid dice CUÁL de las dos se está aseverando.
    for (const id of ['efectivo', 'tarjeta', 'transferencia', 'nequi']) {
      await expect(page.getByTestId(`pay-method-${id}`)).toBeVisible()
    }

    // Efectivo → continuar → ingresar recibido > total → vuelto.
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByRole('button', { name: /Continuar/ }).click()
    await page.getByTestId('checkout-received').fill('100000')
    await expect(page.getByText('Vuelto')).toBeVisible()

    // No se confirma el cobro (no crea orden). Se cierra el turno abierto para el setup.
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })

  test('cobro en efectivo con chip "Exacto" → vuelto 0', async ({ page }) => {
    await loginAsOwner(page)
    await addPosProduct(page)
    await openShiftIfClosed(page, 0)

    await abrirCobroCompleto(page)
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByRole('button', { name: /Continuar/ }).click()

    // Pago justo: el chip "Exacto" rellena el monto = total → vuelto 0.
    await page.getByTestId('quick-amount-exact').click()
    await expect(page.getByText('Vuelto', { exact: true })).toBeVisible()
    expect(parseCOP(await page.getByTestId('checkout-change').innerText())).toBe(0)

    await page.getByRole('button', { name: /Confirmar cobro/ }).click()
    await expect(page.getByText(/registrada|Cobro exitoso/)).toBeVisible()

    // Limpieza: cerrar el turno abierto para el setup.
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })

  test('el ticket impreso NO afirma IVA y dice qué es (comprobante de venta)', async ({ page }) => {
    // 🔴 Deuda 62(a) / auditoría A3 §3.1. El ticket declaraba "IVA 19% incl."
    //    con un número sacado de una constante (`total − total/1,19`) sobre un
    //    dato que no existe en ninguna tabla. Y el primer cliente no está
    //    constituido ni factura: el papel afirmaba cobrar un impuesto que el
    //    negocio no puede declarar.
    //
    //    El ticket vive en el DOM oculto (`.ticket-print`, visible solo al
    //    imprimir), así que se lee su texto sin exigir visibilidad — es lo que
    //    sale en papel, no lo que se ve en pantalla.
    await loginAsOwner(page)
    await addPosProduct(page)
    await openShiftIfClosed(page, 0)

    await abrirCobroCompleto(page)
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByRole('button', { name: /Continuar/ }).click()
    await page.getByTestId('quick-amount-exact').click()
    await page.getByRole('button', { name: /Confirmar cobro/ }).click()
    await expect(page.getByText(/registrada|Cobro exitoso/)).toBeVisible()

    const ticket = page.locator('.ticket-print')
    await expect(ticket).toHaveCount(1)
    // `textContent` y no `innerText`: el ticket está oculto (`display:none`
    // fuera de impresión) y `innerText` devuelve '' para un nodo no renderizado
    // — con '' el test pasaría sin mirar nada, que es el verde por la razón
    // equivocada. Se lee el contenido del DOM, que es lo que va al papel.
    const texto = (await ticket.textContent()) ?? ''
    expect(texto.length, 'el ticket no puede venir vacío: sin texto no se está midiendo nada').toBeGreaterThan(40)

    expect(texto, 'el ticket no puede afirmar un impuesto que el esquema no tiene').not.toMatch(/IVA/i)
    expect(texto, 'el papel tiene que decir qué es').toMatch(/comprobante de venta/i)
    expect(texto, 'y no puede llamarse factura: Nodo no factura (deuda 72)').not.toMatch(/factura/i)
    expect(texto, 'lo que sí es cierto sigue: el total').toMatch(/TOTAL/)

    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })

  test('cobro en efectivo con chip de round-up → vuelto correcto', async ({ page }) => {
    await loginAsOwner(page)
    await addPosProduct(page)
    await openShiftIfClosed(page, 0)

    const total = parseCOP(await page.getByTestId('cart-total').innerText())

    await abrirCobroCompleto(page)
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByRole('button', { name: /Continuar/ }).click()

    // Primer chip de round-up: monto redondo por encima del total → vuelto = monto − total.
    const chip = page.getByTestId('quick-amount-chip').first()
    const chipAmount = parseCOP(await chip.innerText())
    expect(chipAmount).toBeGreaterThan(total)
    await chip.click()

    expect(parseCOP(await page.getByTestId('checkout-change').innerText())).toBe(chipAmount - total)

    await page.getByRole('button', { name: /Confirmar cobro/ }).click()
    await expect(page.getByText(/registrada|Cobro exitoso/)).toBeVisible()

    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })
})
