# Nodo · Paquete de implementación

Entrega 1 (cerrada 2026-09-01) + Listas de precios (2026-09-14).

## Contenido

- **`nodo-design-system.md`** — la fuente de verdad. Tokens con valores exactos, tipografía, espaciado, componentes, navegación, estados por pantalla, reglas de comportamiento (incluidas 19–24, listas de precios) y lo que NO está decidido (§8). Empezar por acá.
- **`Nodo.html`** — la referencia visual completa, autocontenida, se abre en cualquier navegador sin servidor. Trae las doce entradas de navegación y el selector de estado del encabezado: cada estado de cada pantalla se reproduce sin tocar código. El chip de nivel de cada línea del carrito es interactivo.
- **`*.png`** — capturas nombradas `pantalla-estado`.

## Capturas

### Las nueve pantallas en estado normal
```
mostrador-normal.png
pedidos-normal.png
compras-normal.png
gastos-normal.png
catalogo-normal.png
inventario-normal.png
clientes-normal.png
cartera-normal.png
utilidades-normal.png
```

### Listas de precios
```
mostrador-selector-de-nivel.png      chip de nivel abierto: cinco opciones con su precio, L0 sin precio
mostrador-cliente-sin-lista.png      cliente sin lista asignada, vende a L1 y lo dice
mostrador-nivel-sin-precio.png       nivel sin precio: fila en --attention, no suma al total
catalogo-cinco-listas.png            L0–L4 como columnas + formulario de cinco precios
clientes-lista-por-defecto.png       segmentado L0–L4 en la ficha, L0 deshabilitada
```

### Estados que definen el diseño y no se deducen de los tokens
```
mostrador-cupo-proyectado.png        Disponible ahora − esta venta → Queda tras esta venta
mostrador-excede-cupo.png            Crédito bloqueado, faltante en pesos, "Cobrar de contado"
mostrador-cargando-skeleton.png      skeleton, nunca spinner en blanco
cartera-mora-antiguedad.png          fila en mora con AgingBar y leyenda
compras-costo-antes-despues.png      efecto de la compra antes de aplicarla
utilidades-incompleta.png            aviso de utilidad incompleta por productos sin costo
gastos-vacio.png                     vacío con su botón
```

### Referencia rápida
```
referencia-tokens.png
referencia-componentes.png
```

## Notas para quien implementa

1. **Los valores del documento son literales, no aproximaciones.** Si un hex no está en `nodo-design-system.md` §1, no es del sistema.
2. **La capa de marca (`--brand`, `--brand-ink`) la define el tenant**, y solo aparece en cuatro superficies: tile de identidad, login, logo impreso, favicon. Nunca comunica estado.
3. **Verde es solo confirmación. Acción es fría.** Ninguna acción usa verde; acción y estado jamás comparten familia.
4. **Una sola familia proporcional (Inter).** La monoespaciada no existe en el producto: las cifras se alinean con `tabular-nums`.
5. **La lista de precios es de la línea, no del cliente** (§7.19–24). El cliente aporta el nivel de arranque; cada línea puede apartarse sin tocarlo. Los cinco niveles son una escala y no se pintan con la paleta de estados.
6. **Cambio = recibido − total, derivado.** No es un valor fijo: si lo recibido no alcanza, muestra `—`, nunca una cifra plausible (§7.5).
7. **Historial, Turnos, Configuración y Login existen y están ubicados**, pero su diseño no es parte de la entrega: consumen tokens y nada más.
8. `utilidades-normal.png` y `utilidades-incompleta.png` son la misma vista: el aviso está presente en el estado normal, porque hoy hay 12 productos vendidos sin costo registrado.
9. Las capturas están escaladas para entrar en una sola imagen. Las medidas de verdad son las de §3, no las del PNG.
10. Pendiente de volcar al documento: el cobro en modal y la deuda 75 (precio editable con confirmación al ±100%/−35%) se mencionaron en el pedido pero no están en `nodo-design-system.md`.
