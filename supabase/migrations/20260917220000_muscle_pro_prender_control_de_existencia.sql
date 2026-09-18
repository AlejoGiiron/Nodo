-- ============================================================================
-- MUSCLE PRO · prender el control de existencia de 12 productos que nacieron
-- sin él, y dejarles la existencia que dicen sus propias compras y ventas.
-- Aprobado por Alejandro el 2026-09-17.
-- ============================================================================
--
-- QUÉ PASÓ. El formulario de producto hacía nacer el interruptor «controlar
-- existencia» APAGADO. La clienta creó 12 productos entre el 15 y el 17 de
-- septiembre sin prenderlo. `register_purchase` sólo mueve existencia de
-- productos con control, así que sus compras guardaron el costo y NO subieron
-- stock, y Inventario —que filtra por el control— no los muestra. Lo reportó
-- mirando la compra PED46038. El formulario ya nace con el control prendido
-- (mismo día, `ProductModal`).
--
-- R0
-- 1 · CLASE — POR-ID y VALIDAR, no forzar. La existencia se RECALCULA acá
--     adentro (Σ compras − Σ devoluciones − Σ ventas no anuladas) y se compara
--     contra la aprobada. Si difiere —hubo una venta o una compra entre la
--     medición y el push—, la migración entera se revierte.
-- 2 · PRECEDENTE — `20260917200000_muscle_pro_atribuir_122_y_123`: por UUID,
--     `sede_id` literal en cada `where`, idempotente.
-- 3 · MODO DE FALLO — escribir un stock que no corresponde falla CALLADO: la
--     clienta ve un número plausible. ⇒ verificación embebida con `raise`.
--     Idempotente: un producto que YA tiene control se salta con notice y sin
--     excepción, así que un `db push` repetido es un no-op.
-- 4 · OBJETIVO — 12 UUID + sede. Ningún nombre, código ni `like`.
--
-- 📋 MEDIDO ANTES DE ESCRIBIR (2026-09-17, lectura sobre la base):
--   12 productos simples y activos con stock_tracking = false, stock_qty NULL,
--   cero stock_movements, cero devoluciones, cero ventas anuladas.
--   METHANOM y STANOM: 1 comprado y 1 vendido cada uno → 0.
--   EAAS FRUIT PUNCH y VITADAPT: sin ninguna transacción → 0.
--
-- ⚠️ LA HISTORIA NO SE REESCRIBE. No se toca ninguna compra ni venta. Lo que se
--    agrega es UN movimiento de ajuste por producto con existencia distinta de
--    cero, con su motivo, fechado hoy. Los que quedan en 0 no llevan movimiento
--    (`stock_movements.qty` es `<> 0` por CHECK, y no hay nada que mover).
--    ⚠️ Las VENTAS de METHANOM y STANOM tampoco descontaron stock en su
--    momento: su 0 ya cuenta la compra y la venta, no hay otra cosa que asentar.
-- ============================================================================

begin;

do $$
declare
  c_sede constant uuid := 'd11e803c-298d-41fe-806f-ae71e84653f8';  -- Muscle Pro
  r record;
  v_calc integer;
  v_trk  boolean;
  v_hechos integer := 0;
begin
  for r in
    select * from (values
      ('f7348ab6-eb7f-4d04-8623-65c97ca61397'::uuid, 0),  -- 001-10 METHANOM 100 TABS
      ('c68db80a-8926-4e55-8fe1-6170e1a12d96'::uuid, 0),  -- 001-11 STANOM 100 TABS
      ('baae39d7-5b25-488f-9779-31868300f97d'::uuid, 1),  -- 002-4  C4 30 SERV
      ('7e0fe79e-7ffd-48af-b1f6-b389efbbdbee'::uuid, 1),  -- 002-5  PASE 30 SERV
      ('d1992ef6-4def-44c3-acec-2736fc3259aa'::uuid, 1),  -- 005-15 CARNIVOR MAX 2 LB
      ('f155aa30-288c-46fe-80a9-d47c90fe4fbb'::uuid, 2),  -- 009-10 MAGNESIO 60 CAPS
      ('c0789503-ed1c-4b89-9d74-7f1b606c9547'::uuid, 2),  -- 009-5  ASHVAGANDHA 60-TAB
      ('51f2822a-7932-4b83-b097-182a6c198354'::uuid, 2),  -- 009-6  OMEGA 3 PLUS 120 CAPS
      ('9a57915e-6554-4b30-9b34-232eea545f60'::uuid, 2),  -- 009-7  VITAMINA D3 + K2
      ('ba5be784-d7a5-4a30-b8a4-c8f33b36098e'::uuid, 2),  -- 011-5  AMINOACIDOS AMINOX
      ('02ca20e8-378d-45c5-a05d-71d8e0277b1d'::uuid, 0),  -- 011-6  AMINOACIDOS EAAS FRUIT PUNCH
      ('047cb232-6e4e-4957-afab-913347f7508d'::uuid, 0)   -- 013-3  MULTIVITAMINICO VITADAPT
    ) as t(id, esperado)
  loop
    select stock_tracking into v_trk
      from public.products
     where id = r.id and sede_id = c_sede and kind = 'simple';
    if not found then
      raise exception 'El producto % no existe en Muscle Pro o no es simple', r.id;
    end if;
    if v_trk then
      raise notice 'Ya controla existencia, se salta: %', r.id;
      continue;
    end if;

    -- Recalculado adentro: compras − devoluciones − ventas no anuladas.
    select
        coalesce((select sum(i.qty * i.units_per_purchase_unit)
                    from public.purchase_invoice_items i
                    join public.purchase_invoices pi on pi.id = i.invoice_id
                   where i.product_id = r.id and pi.sede_id = c_sede and pi.kind = 'purchase'), 0)
      - coalesce((select sum(i.qty * i.units_per_purchase_unit)
                    from public.purchase_invoice_items i
                    join public.purchase_invoices pi on pi.id = i.invoice_id
                   where i.product_id = r.id and pi.sede_id = c_sede and pi.kind = 'return'), 0)
      - coalesce((select sum(oi.qty)
                    from public.order_items oi
                    join public.orders o on o.id = oi.order_id
                   where oi.product_id = r.id and o.sede_id = c_sede and o.cancelled_at is null), 0)
      into v_calc;

    if v_calc <> r.esperado then
      raise exception 'Producto %: la existencia calculada hoy es % y la aprobada era %. Algo se movió desde la medición; no se escribe nada.',
        r.id, v_calc, r.esperado;
    end if;

    update public.products
       set stock_tracking = true,
           stock_qty      = r.esperado
     where id = r.id and sede_id = c_sede;

    if r.esperado <> 0 then
      insert into public.stock_movements (sede_id, product_id, type, qty, notes)
      values (c_sede, r.id, 'adjustment', r.esperado,
        'Control de existencia prendido el 2026-09-17: el producto se creó sin él y '
        || 'sus compras no subieron stock. Existencia = compras − ventas.');
    end if;

    v_hechos := v_hechos + 1;
  end loop;

  raise notice 'Productos con control prendido: %', v_hechos;
end $$;

commit;
