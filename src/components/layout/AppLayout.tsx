import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  ShoppingCart,
  Package,
  Boxes,
  BarChart3,
  Receipt,
  Settings,
  LogOut,
  Wallet,
  ShoppingBag,
  HandCoins,
  ClipboardList,
  Banknote,
  ChevronDown,
  X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useSedeConfig } from '@/hooks/useSedeConfig'
import { useCashShift } from '@/hooks/useCashShift'
import { useCollapsedGroups } from '@/hooks/useCollapsedGroups'
import { ShiftBanner } from '@/components/shift/ShiftBanner'
import { OpenShiftModal } from '@/components/shift/OpenShiftModal'
import { StoreSelector } from '@/components/layout/StoreSelector'
import { SubscriptionBanner } from '@/components/layout/SubscriptionBanner'
import type { Enums } from '@/types/database.types'

type UserRole = Enums<'user_role'>

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Permiso RBAC requerido para mostrar el item. Sin él, siempre visible. */
  permission?: string
}

interface NavGroup {
  /** ID estable (kebab-case): clave de persistencia de colapso y de data-testid. */
  id: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      { to: '/ventas', label: 'Ventas', icon: ShoppingCart },
    ],
  },
  {
    id: 'catalogo',
    label: 'Catálogo e inventario',
    items: [
      { to: '/productos', label: 'Productos', icon: Package, permission: 'productos.editar' },
      { to: '/inventario', label: 'Inventario', icon: Boxes, permission: 'inventario.ver' },
      { to: '/compras', label: 'Compras', icon: ShoppingBag, permission: 'compras.gestionar' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes y cobros',
    items: [
      { to: '/fiado', label: 'Fiado', icon: HandCoins, permission: 'fiado.gestionar' },
      { to: '/historial', label: 'Historial', icon: Receipt, permission: 'ventas.historial' },
      { to: '/historial-turnos', label: 'Turnos', icon: ClipboardList, permission: 'caja.cerrar' },
      { to: '/historial-gastos', label: 'Gastos', icon: Banknote, permission: 'caja.movimientos' },
    ],
  },
  {
    id: 'admin',
    label: 'Análisis y admin',
    items: [
      { to: '/reportes', label: 'Reportes', icon: BarChart3, permission: 'reportes.financiero' },
      { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'config.acceder' },
    ],
  },
]

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  cashier: 'Cajero',
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { can } = usePermissions()
  const { sede } = useSedeConfig()
  const { isOpen, isLoadingShift } = useCashShift()

  // Branding de la SEDE activa (sedes): nombre + logo capturados en Config.
  const brandName = sede?.name ?? 'Nodo'
  const brandLogo = sede?.logo_url ?? null
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { collapsed, toggle } = useCollapsedGroups()

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showOpenShift, setShowOpenShift] = useState(false)

  const showShiftBanner = !isLoadingShift && !isOpen && !bannerDismissed

  const handleSignOut = async () => {
    await signOut()
    toast.success('Sesión cerrada')
    navigate('/login', { replace: true })
  }

  // Gating por item: permiso RBAC. El gate extra por `uses_kitchen` se fue con
  // cocina — era la única condición que no salía del catálogo de permisos.
  const isItemVisible = (item: NavItem) => !item.permission || can(item.permission)

  // Grupos con sus items visibles; un grupo sin items visibles no se renderiza.
  const visibleGroups = NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(isItemVisible) }))
    .filter(group => group.items.length > 0)

  // Ruta activa: match exacto o subruta (evita falsos positivos /venta vs /ventas).
  const isRouteActive = (to: string) =>
    pathname === to || pathname.startsWith(to + '/')

  const initials = profile?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      {/* §5: 214px sobre --surface, con borde derecho --border. La barra deja de
          ser un bloque oscuro: en Nodo el lienzo es claro y la navegación no
          compite con el panel de cobro, que es lo único sobre tinta. */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{ width: 214, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        <div
          className="px-4 py-4 flex items-center gap-2.5"
          style={{ borderBottom: '1px solid var(--border-2)' }}
        >
          {brandLogo && (
            <img
              src={brandLogo}
              alt={brandName}
              data-testid="sidebar-brand-logo"
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <span
              data-testid="sidebar-brand-name"
              className="block font-semibold text-base tracking-tight truncate"
              style={{ color: 'var(--ink)' }}
            >
              {brandName}
            </span>
            {/* El tenant arriba y el PRODUCTO abajo, sin fusionarse (anexo de la
                skill). Decía "Sistema POS": describía la categoría, no el
                producto — y en un repo forkeado de un POS de restaurantes eso
                es justo lo que hay que dejar de decir. */}
            <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Nodo</span>
          </div>
        </div>

        <nav className="sidebar-scroll flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {visibleGroups.map(group => {
            // El grupo con la ruta activa se fuerza expandido (auto-expand),
            // aunque el usuario lo hubiera colapsado — nunca se pierde el contexto.
            const hasActive = group.items.some(item => isRouteActive(item.to))
            const expanded = hasActive || !collapsed.has(group.id)
            return (
              <div key={group.id} data-testid={`group-${group.id}`}>
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={expanded}
                  data-testid={`group-header-${group.id}`}
                  className="flex items-center gap-2 w-full px-3 py-1.5 uppercase transition-colors"
                  style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-3)' }}
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
                  />
                  <span className="flex-1 text-left">{group.label}</span>
                </button>

                {expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'nodo-nav nodo-nav--activo'
                              : 'nodo-nav'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1">{label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="p-2" style={{ borderTop: '1px solid var(--border-2)' }}>
          <button
            onClick={handleSignOut}
            className="nodo-nav flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-6"
          style={{ height: 56, borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {/* Left: shift banner */}
          <ShiftBanner />

          {/* Right: store selector + user info */}
          <div className="flex items-center gap-3">
            <StoreSelector />
            <div className="text-right">
              <p className="text-sm font-medium leading-tight" style={{ color: 'var(--ink)' }}>
                {profile?.full_name ?? '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {profile ? ROLE_LABELS[profile.role] : ''}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold select-none"
              style={{ background: 'var(--border)', color: 'var(--ink-2)' }}
            >
              {initials ?? '?'}
            </div>
          </div>
        </header>

        {/*
          Aviso de suscripción — va ARRIBA del banner de turno. Si ambos se
          muestran se apilan (dos filas): aceptado, es infrecuente y el de turno
          se resuelve en segundos. Se renderiza a sí mismo o nada.
        */}
        <SubscriptionBanner />

        {/* Dismissible banner — no hay turno abierto (no bloquea la navegación) */}
        {showShiftBanner && (
          <div
            className="flex-shrink-0 flex items-center gap-3 px-6 py-2.5 border-b"
            style={{ background: 'var(--warning-soft)', borderColor: 'var(--warning-border)' }}
          >
            <Wallet size={16} color="var(--warning-700)" />
            {/*
              minWidth/overflowWrap: hoy el texto es una constante nuestra y
              siempre entra, pero la carencia es la misma que la del banner de
              suscripción (un flex item recorta en silencio bajo un ancestro
              overflow-hidden). Se corrige acá también para que no reaparezca
              el día que este texto se vuelva dinámico.
            */}
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--warning-on-soft)', minWidth: 0, overflowWrap: 'anywhere' }}
            >
              No hay turno de caja abierto.
            </span>
            <button
              onClick={() => setShowOpenShift(true)}
              className="text-sm font-semibold px-3 py-1"
              // 🔴 Era #10b981. Es una ACCIÓN dentro de un aviso: abrir la
              //    jornada. Ninguna acción es verde (§1.2) — y menos ésta, que
              //    dentro de un banner ámbar leía como "todo bien" cuando lo
              //    que dice el banner es que falta algo.
              style={{ background: 'var(--action)', color: '#fff', borderRadius: 'var(--r-2)' }}
            >
              Abrir turno
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="ml-auto"
              style={{ color: 'var(--warning-700)', display: 'grid', placeItems: 'center' }}
              title="Descartar"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-hidden" style={{ background: 'var(--surface)' }}>
          <Outlet />
        </main>
      </div>

      {/* Open-shift modal — no bloqueante, se abre desde el banner */}
      {showOpenShift && (
        <OpenShiftModal
          onClose={() => setShowOpenShift(false)}
          onOpened={() => setShowOpenShift(false)}
        />
      )}
    </div>
  )
}
