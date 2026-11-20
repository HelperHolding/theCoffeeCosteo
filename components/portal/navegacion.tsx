'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Table2,
  Calculator,
  Coffee,
  Layers,
  Package,
  Truck,
  SlidersHorizontal,
  Tags,
  LayoutGrid,
  MapPinned,
  Store,
  UsersRound,
  Contact,
  CalendarCheck,
  Activity,
  Columns3,
  ListTodo,
  CalendarClock,
  ScrollText,
  Settings2,
  BarChart3,
  ShoppingCart,
  Banknote,
  Boxes,
  Bot,
  ClipboardList,
  Scale,
  CalendarX2,
  Wallet,
  type LucideIcon,
  ArrowLeftRight,
  Link2,
  Send,
  Gauge,
  Ship,
  CalendarRange,
  Waypoints,
  ClipboardCheck,
  Sun,
  ReceiptText,
  BellRing,
} from 'lucide-react';
import type { IdModulo } from '@/lib/portal/modulos';

type Enlace = { href: string; nombre: string; icono: LucideIcon; exacto?: boolean };
type Grupo = { titulo: string; enlaces: Enlace[] };
export type Seccion = 'inicio' | IdModulo;
/** Sucursal abierta en Franquiciatarios. gestor = gerente, franquiciatario o admin del módulo. */
export type Franquicia = { companyId: number; nombre: string; gestor: boolean; varias: boolean };

const entradaModulo: Record<IdModulo, Enlace> = {
  costeo: { href: '/costeo', nombre: 'Costeo', icono: Calculator },
  crm: { href: '/crm', nombre: 'CRM Franquicias', icono: Store },
  sucursales: { href: '/sucursales', nombre: 'Sucursales', icono: Activity },
  bi: { href: '/bi', nombre: 'BI', icono: BarChart3 },
  comercializadora: { href: '/comercializadora', nombre: 'Comercializadora', icono: ShoppingCart },
  franquiciatarios: { href: '/franquiciatarios', nombre: 'Franquiciatarios', icono: ClipboardCheck },
};

/** Navegación de una sucursal en Franquiciatarios: la operación del día y, para gestores, avisos y equipo. */
export function gruposFranquicia(f: Franquicia): Grupo[] {
  const b = `/franquiciatarios/${f.companyId}`;
  const g: Grupo[] = [
    {
      titulo: f.nombre,
      enlaces: [
        { href: b, nombre: 'Hoy', icono: Sun, exacto: true },
        { href: `${b}/checklist`, nombre: 'Checklists', icono: ClipboardCheck },
        { href: `${b}/ventas`, nombre: 'Ventas y pedidos', icono: Activity },
        { href: `${b}/tira`, nombre: 'Tira de venta', icono: ReceiptText },
        { href: `${b}/conteo`, nombre: 'Conteo de insumos', icono: ClipboardList },
        { href: `${b}/caja`, nombre: 'Caja', icono: Banknote },
      ],
    },
  ];
  if (f.gestor)
    g.push({
      titulo: 'Gerencia',
      enlaces: [
        { href: `${b}/pedidos`, nombre: 'Pedidos', icono: Truck },
        { href: `${b}/inventario`, nombre: 'Inventario', icono: Boxes },
        { href: `${b}/pyl`, nombre: 'P&L y metas', icono: BarChart3 },
        { href: `${b}/avisos`, nombre: 'Avisos e historial', icono: BellRing },
        { href: `${b}/equipo`, nombre: 'Baristas', icono: UsersRound },
      ],
    });
  if (f.varias)
    g.push({
      titulo: 'Sucursales',
      enlaces: [{ href: '/franquiciatarios', nombre: 'Mis sucursales', icono: LayoutGrid, exacto: true }],
    });
  return g;
}

export const grupos: Grupo[] = [
  {
    titulo: 'Costeo',
    enlaces: [{ href: '/costeo', nombre: 'Tablero', icono: LayoutDashboard, exacto: true }],
  },
  {
    titulo: 'Análisis',
    enlaces: [
      { href: '/resumen', nombre: 'Resumen de costeo', icono: Table2 },
      { href: '/productos/calculadora', nombre: 'Calculadora de promociones', icono: Calculator },
    ],
  },
  {
    titulo: 'Menú',
    enlaces: [
      { href: '/productos', nombre: 'Productos', icono: Coffee },
      { href: '/subrecetas', nombre: 'Sub-recetas', icono: Layers },
    ],
  },
  {
    titulo: 'Compras',
    enlaces: [
      { href: '/insumos', nombre: 'Insumos', icono: Package },
      { href: '/configuracion?tab=proveedores', nombre: 'Proveedores', icono: Truck },
    ],
  },
  {
    titulo: 'Ajustes',
    enlaces: [
      { href: '/configuracion', nombre: 'Parámetros y canales', icono: SlidersHorizontal },
      { href: '/configuracion?tab=catalogos', nombre: 'Catálogos', icono: Tags },
    ],
  },
];

const gruposCrm: Grupo[] = [
  {
    titulo: 'CRM Franquicias',
    enlaces: [
      { href: '/crm', nombre: 'Panel', icono: LayoutDashboard, exacto: true },
      { href: '/crm/proceso', nombre: 'Proceso', icono: Waypoints },
      { href: '/crm/pipeline', nombre: 'Pipeline', icono: Columns3 },
      { href: '/crm/franquiciatarios', nombre: 'Franquiciatarios', icono: UsersRound },
      { href: '/crm/pendientes', nombre: 'Mis pendientes', icono: ListTodo },
      { href: '/crm/vencimientos', nombre: 'Vencimientos', icono: CalendarClock },
      { href: '/crm/carril-legal', nombre: 'COF y contrato', icono: Scale },
      { href: '/crm/bitacora', nombre: 'Bitácora', icono: ScrollText },
      { href: '/crm/contactos', nombre: 'Contactos', icono: Contact },
      { href: '/crm/actividades', nombre: 'Actividades', icono: CalendarCheck },
      { href: '/crm/admin', nombre: 'Administración', icono: Settings2 },
    ],
  },
];

const gruposSucursales: Grupo[] = [
  {
    titulo: 'Sucursales',
    enlaces: [
      { href: '/sucursales', nombre: 'Directorio', icono: LayoutGrid, exacto: true },
      { href: '/sucursales/mexico', nombre: 'Tablero México', icono: MapPinned },
    ],
  },
];

const gruposBi: Grupo[] = [
  {
    titulo: 'BI',
    enlaces: [
      { href: '/bi', nombre: 'Tableros', icono: LayoutGrid, exacto: true },
      { href: '/bi/the-coffee-mexico', nombre: 'The Coffee México', icono: MapPinned },
    ],
  },
];

const gruposComercializadora: Grupo[] = [
  {
    titulo: 'Operación',
    enlaces: [
      { href: '/comercializadora/inicio', nombre: 'Inicio', icono: LayoutDashboard },
      { href: '/comercializadora/envios', nombre: 'Envíos', icono: Send },
      { href: '/comercializadora/traspasos', nombre: 'Traspasos', icono: ArrowLeftRight },
      { href: '/comercializadora/mapeo', nombre: 'Mapeo SKU', icono: Link2 },
    ],
  },
  {
    titulo: 'Comprar',
    enlaces: [
      { href: '/comercializadora', nombre: 'Qué pedir', icono: ShoppingCart, exacto: true },
      { href: '/comercializadora/esta-semana', nombre: 'Esta semana', icono: CalendarCheck },
      { href: '/comercializadora/oc-automaticas', nombre: 'OC automáticas', icono: Bot },
      { href: '/comercializadora/ordenes', nombre: 'Órdenes de compra', icono: ClipboardList },
      { href: '/comercializadora/minimos', nombre: 'Mínimos de proveedor', icono: Scale },
    ],
  },
  {
    titulo: 'Planear y pagar',
    enlaces: [
      { href: '/comercializadora/plan-abastos', nombre: 'Plan de abastos', icono: CalendarRange },
      { href: '/comercializadora/proveedores-sin-stock', nombre: 'Proveedores sin stock', icono: CalendarX2 },
      { href: '/comercializadora/pagos', nombre: 'Pagos proyectados', icono: Wallet },
      { href: '/comercializadora/doh', nombre: 'DOH', icono: Gauge },
      { href: '/comercializadora/indicadores', nombre: 'Indicadores', icono: Activity },
      { href: '/comercializadora/importaciones', nombre: 'Importaciones', icono: Ship },
      { href: '/comercializadora/cafe', nombre: 'Café', icono: Coffee },
      { href: '/comercializadora/inventario', nombre: 'Inventario', icono: Boxes },
      { href: '/comercializadora/catalogo', nombre: 'Catálogo', icono: Tags },
      { href: '/comercializadora/kit', nombre: 'Kit de apertura', icono: Package },
      { href: '/comercializadora/configuracion', nombre: 'Configuración', icono: Settings2 },
    ],
  },
];

const gruposPorSeccion: Record<Seccion, Grupo[]> = {
  inicio: [],
  costeo: grupos,
  crm: gruposCrm,
  sucursales: gruposSucursales,
  bi: gruposBi,
  comercializadora: gruposComercializadora,
  franquiciatarios: [],
};

/**
 * Grupos de la sección: primero "Portal", luego los del módulo. En Inicio los módulos solo se
 * muestran como tarjetas; dentro de un módulo, "Portal" lleva a Inicio y a los otros módulos visibles.
 */
export function gruposDe(seccion: Seccion, visibles: IdModulo[], franquicia?: Franquicia): Grupo[] {
  const otros = seccion === 'inicio' ? [] : visibles.filter((m) => m !== seccion);
  // Franquiciatarios sin otros módulos: el grupo «Portal» no lleva a nada útil (Inicio regresa aquí).
  if (seccion === 'franquiciatarios' && otros.length === 0)
    return franquicia ? gruposFranquicia(franquicia) : [];
  const portal: Grupo = {
    titulo: 'Portal',
    enlaces: [
      { href: '/', nombre: 'Inicio', icono: LayoutGrid, exacto: true },
      ...otros.map((m) => entradaModulo[m]),
    ],
  };
  if (seccion === 'franquiciatarios') return [portal, ...(franquicia ? gruposFranquicia(franquicia) : [])];
  return [portal, ...gruposPorSeccion[seccion]];
}

function esActivo(href: string, exacto: boolean | undefined, pathname: string, tab: string | null) {
  const [ruta, query] = href.split('?');
  if (ruta === '/configuracion') {
    const destino = new URLSearchParams(query).get('tab');
    const actual = tab === 'canales' || tab === 'parametros' ? null : tab;
    return pathname === ruta && destino === actual;
  }
  if (exacto) return pathname === ruta;
  if (ruta === '/productos' && pathname.startsWith('/productos/calculadora')) return false;
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

export function Navegacion({
  alNavegar,
  seccion = 'costeo',
  visibles = [],
  franquicia,
}: {
  alNavegar?: () => void;
  seccion?: Seccion;
  visibles?: IdModulo[];
  franquicia?: Franquicia;
}) {
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {gruposDe(seccion, visibles, franquicia).map((g) => (
        <div key={g.titulo}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">
            {g.titulo}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.enlaces.map(({ href, nombre, icono: Icono, exacto }) => {
              const activo = esActivo(href, exacto, pathname, tab);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={alNavegar}
                    aria-current={activo ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-colors ${
                      activo ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    {activo && (
                      <span aria-hidden="true" className="absolute -left-3 h-5 w-1 rounded-r-full bg-crema" />
                    )}
                    <Icono
                      size={17}
                      aria-hidden="true"
                      className={activo ? 'text-crema-strong' : 'text-muted-foreground group-hover:text-ink'}
                    />
                    {nombre}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
