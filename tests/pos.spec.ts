import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { closeShiftIfOpen, openShiftIfClosed } from './helpers/shift'
import { waitPosReady, addPosProduct, abrirCobro } from './helpers/pos'

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

    // 🔴 Acá el sujeto ES el botón de cobrar, así que se aprieta ÉSE crudo y no
    //    el helper: `abrirCobro` espera a que el modal aparezca, y lo que este
    //    caso mide es justamente que NO aparezca — sin turno, «Cobrar» abre
    //    primero la apertura de caja. Con el helper el caso se caería en su
    //    propia espera y el rojo diría «no abrió el modal» en vez de nombrar el
    //    turno.
    //    De los 33 sitios de `cobro-confirmar`, éste es el ÚNICO que no era un
    //    confirmador: era la puerta. Un renombre en masa lo habría mandado a un
    //    botón que en este escenario ni siquiera existe.
    await page.getByTestId('cobro-abrir').click()
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

  
    await expect(page.getByTestId('cart-total')).toBeVisible()
    await abrirCobro(page)
    // 🔴 POR TESTID Y NO POR TEXTO. «Total a cobrar» aparece dos veces —en el
    //    panel de tinta, que sigue en el DOM detrás del velo, y en el modal—, y
    //    `getByText` en modo estricto falla con dos coincidencias. El testid
    //    dice CUÁL de los dos se asevera.
    //
    // 🔴 Y LOS CINCO MEDIOS, NO CUATRO. Acá vivía la aserción de que los cuatro
    //    primeros estuvieran visibles, y en la columna hacía falta además un
    //    `cobro-mas-opciones` para llegar al quinto: la grilla estrecha no los
    //    mostraba todos. Ese control MURIÓ con la columna y su expectativa NO:
    //    el modal tiene 540px y ofrece los cinco de una. Se re-deriva en vez de
    //    borrarse — es la misma pregunta («¿están todos los medios al
    //    alcance?») contestada contra la pantalla nueva. Fiado entra porque el
    //    owner tiene `fiado.gestionar`; el gating vive en `fiado.spec`.
    for (const id of ['efectivo', 'tarjeta', 'transferencia', 'nequi', 'fiado']) {
      await expect(
        page.getByTestId(`pay-method-${id}`),
        `el modal ofrece los cinco medios sin desplegar nada: falta ${id}`,
      ).toBeVisible()
    }

    // Efectivo → continuar → ingresar recibido > total → vuelto.
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByTestId('checkout-continue').click()
    await page.getByTestId('checkout-received').fill('100000')
    // 🔴 POR TESTID Y NO POR LA PALABRA, y la razón de ayer ya no aplica.
    //    Acá decía que el producto usaba DOS PALABRAS para lo mismo —«Cambio»
    //    en la columna, «Vuelto» en el diálogo y en el ticket—, anotado como
    //    divergencia de vocabulario. **La palabra «Cambio» la había introducido
    //    la columna del cobro en línea y murió con ella**: hoy los tres sitios
    //    dicen «Vuelto». La duda tenía un sujeto y el sujeto dejó de existir.
    // ⚠️ El testid se queda igual, por la razón que sobrevive: mide el NÚMERO,
    //    que es lo que este caso quiere, y no se rompe si mañana el copy cambia.
    await expect(page.getByTestId('checkout-change')).toBeVisible()

    // No se confirma el cobro (no crea orden). Se cierra el turno abierto para el setup.
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })

  test('cobro en efectivo con chip "Exacto" → vuelto 0', async ({ page }) => {
    await loginAsOwner(page)
    await addPosProduct(page)
    await openShiftIfClosed(page, 0)

    // Los chips viven en el PASO DEL MONTO, no al lado del medio: con el modal
    // hay que llegar hasta ahí. El sujeto —que «Exacto» deje el vuelto en 0— no
    // cambia.
    await abrirCobro(page)
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByTestId('checkout-continue').click()

    // Pago justo: el chip "Exacto" rellena el monto = total → vuelto 0.
    await page.getByTestId('quick-amount-exact').click()
    await expect(page.getByTestId('checkout-change')).toBeVisible()
    expect(parseCOP(await page.getByTestId('checkout-change').innerText())).toBe(0)

    await page.getByTestId('checkout-confirm-efectivo').click()
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

    await abrirCobro(page)
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByTestId('checkout-continue').click()
    await page.getByTestId('quick-amount-exact').click()
    await page.getByTestId('checkout-confirm-efectivo').click()
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

    await abrirCobro(page)
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByTestId('checkout-continue').click()

    // Primer chip de round-up: monto redondo por encima del total → vuelto = monto − total.
    const chip = page.getByTestId('quick-amount-chip').first()
    const chipAmount = parseCOP(await chip.innerText())
    expect(chipAmount).toBeGreaterThan(total)
    await chip.click()

    expect(parseCOP(await page.getByTestId('checkout-change').innerText())).toBe(chipAmount - total)

    await page.getByTestId('checkout-confirm-efectivo').click()
    await expect(page.getByText(/registrada|Cobro exitoso/)).toBeVisible()

    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })
})
