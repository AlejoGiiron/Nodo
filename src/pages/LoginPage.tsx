import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Users, BarChart3, User, Lock, Eye, EyeOff, Check, X, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

function Spinner() {
  return (
    <div
      className="rounded-full border-2 border-white/30 border-t-white animate-spin"
      style={{ width: 15, height: 15 }}
    />
  )
}

/**
 * 🔴 ESTE COPY SE VERIFICA CONTRA LO QUE EXISTE, NO SE HEREDA — A6 · tanda 2.
 *
 * La versión anterior prometía tres cosas y **dos eran falsas**:
 *   · *"cupo de crédito"* — el cupo **no existe en el esquema** (deuda 40).
 *   · *"Facturación rápida"* / *"comienza a facturar"* — el cliente **no factura
 *     electrónicamente**; es la fase F1, pospuesta, y por eso el ticket dice
 *     *"Comprobante de venta"* y no *"Factura"* (deuda 62a).
 * La tercera decía *"por turno"*, que es el vocabulario que la deuda 38 renombra.
 *
 * ⚠️ **Es la SEGUNDA vez que esta clase muerde en este repo.** La primera está
 * escrita en `CLAUDE.md`: el `LoginPage` de Vento prometía *"Gestión de mesas y
 * comandas en tiempo real"* con los dos módulos ya podados. Misma pantalla,
 * mismo repo, mismo mecanismo — **el copy de UI afirma cosas del producto y
 * ningún verificador lo mira**: `tsc` ve un string y ESLint ve un string.
 *
 * Lo accionable, y es de escritura: **una frase que promete una funcionalidad se
 * comprueba contra la funcionalidad, no contra la frase anterior.**
 */
const FEATURES = [
  { Icon: ShoppingCart, text: 'Mostrador rápido con inventario sincronizado' },
  { Icon: Users,        text: 'Clientes, crédito y cartera al día' },
  { Icon: BarChart3,    text: 'Cierre de caja y reportes del período' },
]

export function LoginPage() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPwd, setShowPwd]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState(false)

  useEffect(() => {
    if (!isLoading && user) navigate('/ventas', { replace: true })
  }, [user, isLoading, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(false)
    setSubmitting(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(true)
      setSubmitting(false)
      return
    }

    if (!remember) {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-')) localStorage.removeItem(key)
      }
    }
    // Éxito: onAuthStateChange actualiza el user → useEffect redirige a /ventas
  }

  if (isLoading) return null

  return (
    <div
      className="flex overflow-hidden"
      style={{ width: '100vw', height: '100vh', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)' }}
    >
      {/* PANEL IZQUIERDO — 40% slate-900 */}
      <div
        className="flex flex-col"
        style={{
          flex: '0 0 40%',
          background: 'var(--ink)',
          color: 'var(--border-2)',
          padding: '40px 44px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Halos del fondo. 🔴 Eran `rgba(16,185,129,…)` — el emerald de VENTO,
            literal y dos veces. Pasan a la familia de acción, que es la fría del
            sistema (§1.2) y la única que no comunica estado. */}
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 460, height: 460, background: 'radial-gradient(circle, rgba(2,132,199,.18) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: 380, height: 380, background: 'radial-gradient(circle, rgba(2,132,199,.10) 0%, transparent 60%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            // 🔴 Era `linear-gradient(--action → --success-700)`: VERDE, y §1.2
            //    dice que **verde es sólo confirmación y ninguna acción lo usa**.
            //    Peor: ese verde es el acento de VENTO (#10b981), o sea la marca
            //    de otro producto en la primera pantalla de éste.
            //    Login es una de las CUATRO superficies donde `--brand` está
            //    permitida (§1.1), así que el tile usa `--brand`, que es lo que
            //    corresponde.
            background: 'var(--brand)',
            display: 'grid', placeItems: 'center',
            color: 'var(--brand-ink)', fontWeight: 800, fontSize: 20,
            boxShadow: '0 0 0 1px rgba(255,255,255,.10) inset',
          }}>N</div>
          <div>
            {/* Decía "G" — residuo de `G-Nexo`/`gvento`. La convención de
                CLAUDE.md retiró el prefijo: los productos son la raíz sola,
                «sin guion y sin "g"». El producto es Nodo. */}
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--surface-2)', letterSpacing: -0.3 }}>Nodo</div>
            {/* Decía "POS · Sedes": "POS" es vocabulario de Vento — acá la
                pantalla se llama Mostrador. Y hacia afuera se dice
                "Nodo, de Giiron" (convención de marca). */}
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>de Giiron</div>
          </div>
        </div>

        {/* Contenido central */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, color: 'var(--surface-2)', margin: 0, letterSpacing: -1.2, lineHeight: 1.05 }}>
            Bienvenido<br />
            <span style={{ color: 'var(--action)' }}>de vuelta.</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-4)', marginTop: 14, marginBottom: 0, lineHeight: 1.55, maxWidth: 340 }}>
            Abrí la caja y empezá a vender. Todo lo que tu negocio necesita, en un solo lugar.
          </p>

          {/* Features */}
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FEATURES.map(({ Icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  // Eran dos emerald de Vento más. El ícono ya usaba --action;
                  // el fondo y el borde ahora también, en la misma familia fría.
                  background: 'rgba(2,132,199,.12)',
                  color: 'var(--action)',
                  display: 'grid', placeItems: 'center',
                  border: '1px solid rgba(2,132,199,.22)',
                  flexShrink: 0,
                }}>
                  <Icon size={15} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>{text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--ink-3)', position: 'relative', zIndex: 1 }}>
          <div>© 2026 Nodo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--action)', display: 'inline-block' }} />
            {/* 🔴 Decía "Sistema operativo · v2.4.1": un número de versión
                INVENTADO que no corresponde a ningún artefacto del repo. Un
                número sin fuente es una opinión con dígitos, y acá encima lo lee
                un cliente. Se quita en vez de inventar otro. */}
            Nodo, de Giiron
          </div>
        </div>
      </div>

      {/* PANEL DERECHO — 60% blanco */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '40px 48px', background: 'var(--surface)' }}>
        {/* Ayuda */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12.5, color: 'var(--ink-3)' }}>
          ¿Necesitas ayuda?
          <span style={{ color: 'var(--action)', fontWeight: 600, marginLeft: 6 }}>Contactar soporte</span>
        </div>

        {/* Formulario centrado */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <form onSubmit={handleSubmit}>
            {/* Encabezado */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
                Iniciar sesión
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', margin: 0, letterSpacing: -0.8, lineHeight: 1.15 }}>
                Ingresa a tu cuenta
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
                Usa el correo y contraseña que te asignó el administrador.
              </p>
            </div>

            {/* Banner de error */}
            {error && (
              <div style={{
                marginTop: 22, padding: '11px 13px',
                background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)',
                borderRadius: 9, display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{ color: 'var(--danger)', marginTop: 1, flexShrink: 0 }}>
                  <X size={15} strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger-on-soft)' }}>Credenciales incorrectas</div>
                  <div style={{ fontSize: 11.5, color: 'var(--danger-on-soft)', marginTop: 2 }}>Verifica tu correo y contraseña e intenta de nuevo.</div>
                </div>
              </div>
            )}

            {/* Correo */}
            <div style={{ marginTop: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                Correo electrónico
              </label>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '11px 13px', background: 'var(--surface)', transition: 'border .12s',
                }}
                onFocus={e => { if (!error) e.currentTarget.style.borderColor = 'var(--action)' }}
                onBlur={e => { if (!error) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <User size={16} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(false) }}
                  placeholder="tu@sede.com"
                  autoFocus
                  autoComplete="email"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)' }}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                Contraseña
              </label>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '11px 13px', background: 'var(--surface)',
                }}
              >
                <Lock size={16} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(false) }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 0, display: 'grid', placeItems: 'center' }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Recordarme */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18, cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
              <div
                onClick={() => setRemember(r => !r)}
                style={{
                  width: 18, height: 18, borderRadius: 5,
                  border: `1.5px solid ${remember ? 'var(--action)' : 'var(--ink-4)'}`,
                  background: remember ? 'var(--action)' : 'var(--surface)',
                  display: 'grid', placeItems: 'center',
                  color: 'var(--surface)', transition: 'all .12s', flexShrink: 0, cursor: 'pointer',
                }}
              >
                {remember && <Check size={12} strokeWidth={3} />}
              </div>
              Recordarme en este dispositivo
            </label>

            {/* Botón enviar */}
            <button
              type="submit"
              disabled={submitting || !email || !password}
              style={{
                marginTop: 24, width: '100%', padding: '13px 14px',
                background: (submitting || !email || !password) ? 'var(--ink-4)' : 'var(--action)',
                border: 'none', borderRadius: 10,
                cursor: (submitting || !email || !password) ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 700, color: 'var(--surface)',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                // Sombra del botón primario: era emerald bajo un fondo --action.
                boxShadow: (submitting || !email || !password) ? 'none' : '0 6px 16px rgba(2,132,199,.35)',
                transition: 'all .15s',
              }}
            >
              {submitting ? (
                <><Spinner /> Autenticando...</>
              ) : (
                <>Ingresar <ChevronRight size={16} strokeWidth={2.5} /></>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center' }}>
          ¿No tienes acceso? El administrador de tu sede crea las cuentas.
        </div>
      </div>
    </div>
  )
}
