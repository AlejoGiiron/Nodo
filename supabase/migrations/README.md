# `supabase/migrations/` — el esquema base de G-Nexo

15 migraciones consolidadas de G-Vento `d848852`. Es **el** esquema de G-Nexo: lo que está en
`supabase/_heredado/` no se aplica.

---

## 🔴 LOS TIMESTAMPS SON SINTÉTICOS

**No son fechas. No dicen cuándo se escribió cada archivo.**

Los quince se escribieron el **2026-08-31**, en una sola sesión, y ninguno se aplicó a ninguna base.
Los timestamps `20260831120000` … `20260831121400` están puestos para **preservar el orden de
dependencia**, que antes codificaba el prefijo `01-` … `12-`. El minuto que sube de a uno es un
número de secuencia disfrazado de hora.

⚠️ **Por qué hay que decirlo:** el número dejó de ser identidad y el timestamp **no la reemplaza**.
Dentro de seis meses estos nombres se van a leer como cronología —"esto se hizo a las 12:07"— y no
lo son. Las migraciones que vengan **después** sí van a tener fecha real, y van a convivir con
éstas sin ninguna marca que las distinga salvo esta nota.

**El orden es lo único que los timestamps significan acá.** Si alguna vez hay que insertar algo
entre dos, el criterio es la dependencia, no la hora.

---

## 🔴 EL ORDEN NO ES EL DE LOS NÚMEROS VIEJOS — Y ESO FUE UN DEFECTO ENCONTRADO

Los prefijos `01-`…`12-` codificaban **intención**, no orden ejecutable. Al convertirlos en
migraciones apareció que **`09-clientes-y-cartera` tenía una FK a `cash_movements`, creada en
`10-caja`**: ejecutar 01→12 en orden **fallaba en el 09**.

El orden aplicado corrige eso — **caja va antes de los dos módulos que le escriben**:

| # | Migración | Por qué acá |
|---|---|---|
| 1 | `extensiones_y_tipos` | tipos antes que todo |
| 2 | `organizaciones_y_sedes` | tenant raíz + `handle_updated_at` |
| 3 | `suscripcion` | columnas sobre `organizations` |
| 4 | `perfiles_y_auth` | `profiles` + cierra la FK de `user_stores` |
| 5 | `funciones_auxiliares` | `has_permission` y los `get_my_*` |
| 6 | `catalogo` | `categories`, `products` |
| 7 | `ventas` | `orders`, `order_items`, `payments` |
| 8 | `rpc_de_venta` | cobro y anulación |
| 9 | `inventario` | `stock_movements`, `product_components` |
| 10 | `extras_y_alta_de_items` | necesita `order_items` **y** `stock_movements` |
| 11 | **`caja`** | 🔴 **movida acá**: `jornadas` y `cash_movements` |
| 12 | `compras` | escribe en caja |
| 13 | `clientes_y_cartera` | **FK a `cash_movements`** — por eso va después de `caja` |
| 14 | `rls` | necesita todas las tablas |
| 15 | `vistas` | necesita todas las tablas |

**Verificado, no supuesto:** cero referencias `references public.X` hacia adelante y cero triggers
apuntando a funciones aún no creadas.

```bash
# Reproducir la verificación (recorre las migraciones en orden y busca referencias futuras):
ls supabase/migrations/*.sql | sort
```

⚠️ **Lo que esa verificación NO cubre:** las referencias dentro de **cuerpos de funciones plpgsql**.
Postgres no valida esos nombres al crear la función, así que una RPC puede nombrar una tabla que
todavía no existe y crearse igual — el error aparecería recién al ejecutarla. Acá no ocurre porque
todas las tablas existen al terminar la migración 15, pero **el chequeo automático no lo garantiza**
y conviene no leerlo como si lo hiciera.

---

## Cómo se aplica

```bash
supabase init                  # crea config.toml (no existe todavía)
supabase link --project-ref <ref>
supabase db push
supabase gen types typescript --linked > src/types/database.types.ts
```

⛔ **Antes del primer `push`, verificar que la base destino esté VACÍA.** Aplicar quince `create
table` sobre datos ajenos es el modo de fallo que R0 llama "borra datos ajenos".

```bash
supabase db dump --schema public   # debe volver vacío
```

🔴 **Desde el primer `push`, R5 manda:** estos archivos pasan de editables a **inmutables**. Lo que
falte se arregla con una migración **nueva**, nunca editando una de éstas.

## Lo que NO está acá

`supabase/seed-system-roles.sql` es **generado** desde `src/lib/permissions.ts` con `pnpm gen:rbac`
y no es una migración: se ejecuta aparte y se regenera. No se edita a mano.
