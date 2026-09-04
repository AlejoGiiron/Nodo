import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ATAJOS } from '@/lib/atajos'

/**
 * Cablea los atajos GLOBALES de §5. Se monta una sola vez, en `AppLayout`.
 *
 * 🔴 `preventDefault` NO ES OPCIONAL, y por eso está acá y no en cada caso: las
 * teclas que §5 eligió son justo las que el navegador ya usa —F1 ayuda, F3
 * buscar, F11 pantalla completa, F12 herramientas—. Sin cortarle el paso, el
 * atajo pelea con el navegador y pierde.
 *
 * ⚠️ **F5 no está en la lista, y es a propósito**: el producto NO la toma (ver
 * `TECLAS_RESERVADAS`). Recargar borra el carrito a medio armar, y confiar en
 * que un `preventDefault` la ataje siempre es confiar en que este manejador
 * esté montado en todas las pantallas y en todos los estados. No se toma.
 *
 * ⚠️ Y una honesta sobre F12: el `preventDefault` se aplica igual, pero **no se
 * puede verificar observando su CONSECUENCIA** — en Chromium bajo automatización
 * F12 no abre nada. Lo que el spec asevera es el HECHO: que el evento salga con
 * `defaultPrevented`, leído después del despacho. Eso vale para las doce.
 */
export function useAtajos(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 🔴 SIN EXCEPCIONES POR MODO. Antes esto salía temprano cuando había un
      //    cobro abierto, porque F9/F10 tenían doble significado. Ya no lo
      //    tienen: navegar es lo único que hacen, en cualquier pantalla y con
      //    cualquier cosa en la mano. El carrito vive en el store, así que
      //    navegar en medio de una venta no la pierde.
      const atajo = ATAJOS.find((a) => a.ambito === 'global' && a.tecla === e.key)
      if (!atajo?.ruta) return
      e.preventDefault()
      navigate(atajo.ruta)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])
}
