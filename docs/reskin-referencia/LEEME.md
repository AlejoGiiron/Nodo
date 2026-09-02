# Nodo · Paquete de implementación — Entrega 1

Cerrada 2026-09-01.

## Contenido

- **`nodo-design-system.md`** — la fuente de verdad. Tokens con valores exactos, tipografía, espaciado, componentes, navegación, estados por pantalla, reglas de comportamiento y lo que NO está decidido (§8). Empezar por acá.
- **`Nodo.html`** — la referencia visual completa, autocontenida, se abre en cualquier navegador sin servidor. Trae la navegación de las doce entradas y el selector de estado del encabezado: cada estado de cada pantalla se puede reproducir sin tocar código.
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
5. **Historial, Turnos, Configuración y Login existen y están ubicados**, pero su diseño no es parte de esta entrega: consumen tokens y nada más. En `Nodo.html` muestran una nota que lo dice.
6. `utilidades-normal.png` y `utilidades-incompleta.png` son la misma vista: el aviso de utilidad incompleta está presente en el estado normal, porque hoy hay 12 productos vendidos sin costo registrado.
7. Las capturas están escaladas para entrar en una sola imagen. Las medidas de verdad son las de §3, no las del PNG.
