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
import { useAuth } from '@/hooks/useAuth'
import type { Tables, TablesInsert } from '@/types/database.types'
import type { SentryArea } from '@/lib/sentry'
import { mensajeDeError, esNombreDuplicado } from '@/lib/errores'

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
    onError: (err) =>
      toast.error(
        esNombreDuplicado(err)
          ? 'Ya existe un producto activo con ese nombre en esta sede.'
          : mensajeDeError(err, 'Error al guardar producto'),
      ),
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
    const url = await uploadProductImage(profile.sede_id, productId, file)
    if (!url) toast.error('No se pudo subir la imagen — el producto se guardará sin ella')
    return url
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
        esNombreDuplicado(err)
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
