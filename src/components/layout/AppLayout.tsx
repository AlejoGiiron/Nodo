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
  UserRound,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useSedeConfig } from '@/hooks/useSedeConfig'
import { useCashShift } from '@/hooks/useCashShift'
import { useCollapsedGroups } from '@/hooks/useCollapsedGroups'
import { ShiftBanner } from '@/components/shift/ShiftBanner'
import { useOrganization } from '@/hooks/useOrganization'
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

/**
 * 🔴 MOSTRADOR VA SUELTO, FUERA DE TODO GRUPO — §5: «es la pantalla del día y
 *    no pertenece a una categoría». No es un grupo de un solo ítem.
 */
const NAV_MOSTRADOR: NavItem = { to: '/ventas', label: 'Mostrador', icon: ShoppingCart }

/**
 * Estructura de §5, literal. Reescrita el 2026-09-03 (A6 · tanda 1): la anterior
 * agrupaba por `Operación · Catálogo e inventario · Clientes y cobros · Análisis
 * y admin`, que no es de ninguna versión de la skill, y llamaba a las pantallas
 * con los rótulos de VENTO (`Ventas · Productos · Fiado`).
 *
 * ⚠️ §5 pide además `Pedidos` en Movimientos y `Utilidades` en Resultados. **No
 * se agregan**: no existen (deudas 85 y 86) y la misma §5 dice que *"no se
 * agregan huecos de navegación para pantallas que no existen; lo que no está en
 * la lista no aparece deshabilitado ni «próximamente»"*. Entran el día que la
 * pantalla entre.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'movimientos',
    label: 'Movimientos',
    items: [
      { to: '/compras', label: 'Compras', icon: ShoppingBag, permission: 'compras.gestionar' },
      { to: '/historial-gastos', label: 'Gastos', icon: Banknote, permission: 'caja.movimientos' },
      { to: '/historial', label: 'Historial', icon: Receipt, permission: 'ventas.historial' },
    ],
  },
  {
    id: 'existencias',
    label: 'Existencias',
    items: [
      { to: '/productos', label: 'Catálogo', icon: Package, permission: 'productos.editar' },
      { to: '/inventario', label: 'Inventario', icon: Boxes, permission: 'inventario.ver' },
    ],
  },
  {
    id: 'cartera',
    label: 'Cartera',
    items: [
      // 🔴 Clientes gana ENTRADA Y DIRECCIÓN PROPIAS. Antes era una pestaña
      //    dentro de /fiado y `?tab=` se ignoraba: no se podía enlazar ni
      //    volver a ella con el botón atrás. A6 lo midió capturando.
      { to: '/clientes', label: 'Clientes', icon: UserRound, permission: 'fiado.gestionar' },
      { to: '/fiado', label: 'Cartera', icon: HandCoins, permission: 'fiado.gestionar' },
    ],
  },
  {
    id: 'resultados',
    label: 'Resultados',
    items: [
      { to: '/historial-turnos', label: 'Turnos', icon: ClipboardList, permission: 'caja.cerrar' },
      { to: '/reportes', label: 'Reportes', icon: BarChart3, permission: 'reportes.financiero' },
    ],
  },
]

/** §5: Configuración va al PIE, junto al bloque de usuario — no es un momento
 *  del día, es el sistema. Por eso sale de los grupos. */
const NAV_CONFIG: NavItem = {
  to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'config.acceder',
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  cashier: 'Cajero',
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { can } = usePermissions()
  const { sede } = useSedeConfig()
  const { isOpen, isLoadingShift } = useCashShift()

  // 🔴 §5 (decisión 2026-09-03): ORGANIZACIÓN arriba, SEDE debajo, y el nombre
  //    del PRODUCTO fuera del sidebar — ese bloque es del tenant, y meter
  //    nuestro nombre adentro mezcla dos identidades. "Nodo, de Giiron" vive en
  //    Login y en Configuración.
  const { organizationName } = useOrganization()
  const sedeName = sede?.name ?? null
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
          {/* Tile de identidad — §1.1: una de las CUATRO superficies donde
              `--brand` está permitida. El logo de la sede lo reemplaza si existe. */}
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={organizationName ?? sedeName ?? ''}
              data-testid="sidebar-brand-logo"
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div
              data-testid="sidebar-brand-tile"
              className="w-9 h-9 rounded-lg flex-shrink-0 grid place-items-center text-sm font-bold select-none"
              style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
            >
              {(organizationName ?? sedeName ?? '?').trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            {/* ORGANIZACIÓN: el tenant. Mientras no cargue no se inventa un
                relleno — se muestra la sede sola, que es un dato cierto. */}
            <span
              data-testid="sidebar-org-name"
              className="block font-semibold text-base tracking-tight truncate"
              style={{ color: 'var(--ink)' }}
            >
              {organizationName ?? sedeName ?? ''}
            </span>
            {/* SEDE: dónde estás parado. No se pierde porque el producto es
                multi-sede y de eso depende todo lo que se escribe. */}
            {organizationName && sedeName && (
              <span
                data-testid="sidebar-sede-name"
                className="block text-xs mt-0.5 truncate"
                style={{ color: 'var(--ink-3)' }}
              >
                {sedeName}
              </span>
            )}
          </div>
        </div>

        <nav className="sidebar-scroll flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {/* §5: Mostrador suelto arriba, sin título de grupo. */}
          <NavLink
            to={NAV_MOSTRADOR.to}
            data-testid="nav-mostrador-suelto"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'nodo-nav nodo-nav--activo' : 'nodo-nav'
              }`
            }
          >
            <NAV_MOSTRADOR.icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{NAV_MOSTRADOR.label}</span>
          </NavLink>

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
                  // 🔴 SIN `uppercase` y SIN `letter-spacing` — §5 Reglas: «la
                  //    mayúscula sostenida se reserva a etiquetas de columna y
                  //    de KPI». El `text-transform` era lo que hacía que el DOM
                  //    dijera "Movimientos" y la pantalla mostrara "MOVIMIENTOS":
                  //    un grep del código no lo veía.
                  className="flex items-center gap-2 w-full px-3 py-1.5 transition-colors"
                  style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)' }}
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

        {/* 🔴 EL PIE — §5: «bloque de sistema y usuario abajo», y la ADICIÓN
            2026-09-01: «Configuración → el pie, junto al bloque de usuario: no
            es un momento del día, es el sistema». */}
        <div className="p-2" style={{ borderTop: '1px solid var(--border-2)' }}>
          {(!NAV_CONFIG.permission || can(NAV_CONFIG.permission)) && (
            <NavLink
              to={NAV_CONFIG.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'nodo-nav nodo-nav--activo' : 'nodo-nav'
                }`
              }
            >
              <NAV_CONFIG.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{NAV_CONFIG.label}</span>
            </NavLink>
          )}

          {/* Usuario y rol: §5 los pone acá, no en el encabezado. */}
          <div
            data-testid="sidebar-usuario"
            className="flex items-center gap-2.5 px-3 py-2.5 mt-1"
            style={{ borderTop: '1px solid var(--border-2)' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold select-none flex-shrink-0"
              style={{ background: 'var(--border)', color: 'var(--ink-2)' }}
            >
              {initials ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-tight truncate" style={{ color: 'var(--ink)' }}>
                {profile?.full_name ?? '—'}
              </p>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--ink-3)' }}>
                {profile ? ROLE_LABELS[profile.role] : ''}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="nodo-nav p-1.5 rounded-lg flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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

          {/* 🔴 El bloque de usuario se fue AL PIE del sidebar (§5). Acá queda
              sólo el selector de sede, que es del encabezado porque cambia el
              contexto de la pantalla que se está mirando. */}
          <div className="flex items-center gap-3">
            <StoreSelector />
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
