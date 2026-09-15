import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  upsertProduct,
  archiveProduct,
  upsertCategory,
  countActiveProductsByCategory,
  uploadProductImage,
  deleteProductImage,
} from '@/lib/supabase-helpers'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Tables, TablesInsert } from '@/types/database.types'
import type { SentryArea } from '@/lib/sentry'
import { mensajeDeError, campoDuplicado } from '@/lib/errores'

export function useProductMutations() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['products', profile?.sede_id] })

  const saveProduct = useMutation({
    meta: { area: 'productos' satisfies SentryArea },
    mutationFn: async (data: TablesInsert<'products'>) => {
      const { data: result, error } = await upsertProduct(data)
      if (error) throw error

      // ── L1, deuda 101 ──────────────────────────────────────────────────────
      // 🔴 EL CAMPO ÚNICO DEL FORMULARIO ES L1. `products.price` y el nivel 1
      //    son EL MISMO NÚMERO mientras el formulario de cinco campos no exista
      //    (§7.24, fuera de esta tanda por decisión). Sin esta escritura, un
      //    producto nuevo nace con `price` y SIN NINGUNA FILA de `product_prices`
      //    — o sea cae a la rama de ETAPA 1 de `precioDeNivel` y se comporta
      //    como un producto anterior a las listas. Funciona, y es mentira: el
      //    producto SÍ es de la era de las listas.
      //
      // ⚠️ NO ES UN `upsert`, y no es estilo: `product_prices` tiene
      //    `revoke update` de tabla y `grant update (precio)` — sólo esa columna
      //    (allowlist de la deuda 78 aplicada a esta tabla). Y **`ON CONFLICT DO
      //    UPDATE` verifica los privilegios EN TIEMPO DE PLAN**, sobre TODAS las
      //    columnas del `set`, aunque en ejecución sólo cambiara `precio`. Un
      //    `.upsert()` de supabase-js arma exactamente eso y sería rechazado.
      //    Por eso: UPDATE de `precio` y, si no tocó ninguna fila, INSERT.
      //
      // ⚠️ Y `nivel` va literal en 1, no `NIVEL_PRECIO_DEFAULT`: esa constante
      //    dice *a qué nivel se le vende a un cliente sin lista* (§8.19, sin
      //    decidir), que es otra pregunta. Atarlas haría que cambiar la primera
      //    moviera dónde se guarda el precio del formulario.
      const precio = data.price
      if (result?.id && typeof precio === 'number') {
        const { data: tocadas, error: eUpd } = await supabase
          .from('product_prices')
          .update({ precio })
          .eq('product_id', result.id)
          .eq('nivel', 1)
          .select('product_id')
        if (eUpd) throw eUpd
        if (!tocadas || tocadas.length === 0) {
          const { error: eIns } = await supabase
            .from('product_prices')
            .insert({ product_id: result.id, sede_id: result.sede_id, nivel: 1, precio })
          if (eIns) throw eIns
        }
      }
      return result!
    },
    onSuccess: () => { invalidate(); toast.success('Producto guardado') },
    // 🔴 Antes era `toast.error('Error al guardar producto')` PLANO — sin pasar
    // por `mensajeDeError`, a diferencia de `saveCategory`. Es la instancia que
    // la barrida de las 11 copias (2026-09-01) no alcanzó.
    // Va JUNTO con el índice único de la migración `nombre_unico_por_sede`, y
    // no después: un índice cuya violación produce un error genérico EMPEORA la
    // pantalla — antes el genérico tapaba algo que el usuario no podía
    // arreglar; después taparía algo que sí puede, si supiera qué.
    // ⚠️ «activo» no es de más: el índice es PARCIAL (`where is_active`), así
    // que un producto ARCHIVADO con ese nombre NO produce este error. Si el
    // índice se volviera total, esta palabra miente (R1: dos lados).
    // 🔴 El mensaje NOMBRA EL CAMPO. Con dos índices únicos en `products`, un
    //    «ya existe con ese nombre» sobre un código repetido manda a corregir
    //    el campo equivocado — y el nombre estaba bien.
    onError: (err) => {
      // 🔴 La rama de `codigo` se retiró el 2026-09-14: el índice único del
      //    código ya no existe (revisión de la decisión A de la deuda 41), así
      //    que ese mensaje era inalcanzable. **Dos productos con el mismo código
      //    ahora se guardan sin error**, que es lo que el cliente espera: sus
      //    cuatro galletas Mr Cream comparten `004-6` a propósito.
      const campo = campoDuplicado(err)
      toast.error(
        campo === 'nombre'
          ? 'Ya existe un producto activo con ese nombre en esta sede.'
          : campo === 'otro'
            ? 'Ya existe otro producto con ese dato en esta sede.'
            : mensajeDeError(err, 'Error al guardar producto'),
      )
    },
  })

  const deactivateProduct = useMutation({
    meta: { area: 'productos' satisfies SentryArea },
    mutationFn: async (productId: string) => {
      const { error } = await archiveProduct(productId)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Producto desactivado') },
    onError: () => toast.error('Error al desactivar producto'),
  })

  const uploadImage = async (productId: string, file: File): Promise<string | null> => {
    if (!profile) return null
    try {
      return await uploadProductImage(profile.sede_id, productId, file)
    } catch (err) {
      // Se conserva que el producto se guarda igual —esa parte estaba bien— y
      // se agrega POR QUE fallo: el mensaje anterior no distinguia un bucket
      // ausente de un archivo rechazado.
      toast.error(mensajeDeError(err, 'No se pudo subir la imagen') + ' — el producto se guardará sin ella')
      return null
    }
  }

  const removeImage = async (imageUrl: string): Promise<void> => {
    await deleteProductImage(imageUrl)
  }

  return { saveProduct, deactivateProduct, uploadImage, removeImage }
}

export function useCategoryMutations() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['categories', profile?.sede_id] })
    queryClient.invalidateQueries({ queryKey: ['products', profile?.sede_id] })
  }

  const saveCategory = useMutation({
    meta: { area: 'productos' satisfies SentryArea },
    mutationFn: async (data: TablesInsert<'categories'>) => {
      // Prevent deactivating a category that still has active products
      if (data.id && data.is_active === false) {
        const { count, error: countErr } = await countActiveProductsByCategory(data.id)
        if (countErr) throw countErr
        if (count && count > 0) {
          throw new Error(
            `Hay ${count} producto${count !== 1 ? 's' : ''} en esta categoría. Muévelos o desactívalos primero.`,
          )
        }
      }
      const { data: result, error } = await upsertCategory(data)
      if (error) throw error
      return result!
    },
    onSuccess: () => { invalidate(); toast.success('Categoría guardada') },
    // Mismo criterio que `saveProduct`: el índice único también cubre
    // categorías, y su violación tiene que nombrar qué pasó.
    onError: (err) =>
      toast.error(
        campoDuplicado(err) !== null
          ? 'Ya existe una categoría activa con ese nombre en esta sede.'
          : mensajeDeError(err, 'Error al guardar categoría'),
      ),
  })

  const toggleCategoryActive = useMutation({
    meta: { area: 'productos' satisfies SentryArea },
    mutationFn: async ({ category, active }: { category: Tables<'categories'>; active: boolean }) => {
      if (!active) {
        const { count, error: countErr } = await countActiveProductsByCategory(category.id)
        if (countErr) throw countErr
        if (count && count > 0) {
          throw new Error(
            `Hay ${count} producto${count !== 1 ? 's' : ''} en esta categoría. Muévelos o desactívalos primero.`,
          )
        }
      }
      const { data: result, error } = await upsertCategory({ ...category, is_active: active })
      if (error) throw error
      return result!
    },
    onSuccess: (_, { active }) => {
      invalidate()
      toast.success(active ? 'Categoría activada' : 'Categoría desactivada')
    },
    onError: (err) => toast.error(mensajeDeError(err, 'Error al cambiar estado')),
  })

  return { saveCategory, toggleCategoryActive }
}
