import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ATAJOS } from '@/lib/atajos'

/**
 * Cablea los atajos GLOBALES de §5. Se monta una sola vez, en `AppLayout`.
 *
 * 🔴 `preventDefault` NO ES OPCIONAL, y por eso está acá y no en cada caso: las
 * teclas que §5 eligió son justo las que el navegador ya usa —F1 ayuda, F3
 * buscar, F5 recargar, F11 pantalla completa, F12 herramientas—. Sin cortarle el
 * paso, el atajo pelea con el navegador y pierde: F5 recargaría la aplicación en
 * vez de abrir el Catálogo.
 *
 * ⚠️ Y una honesta sobre F12: el `preventDefault` se aplica igual, pero **no se
 * puede verificar desde la suite** — en Chromium headless F12 no abre nada, así
 * que el caso pasaría con y sin él. La tecla que sí discrimina es F5, cuya
 * acción de navegador (recargar) es observable, y ésa es la que lleva el caso.
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
