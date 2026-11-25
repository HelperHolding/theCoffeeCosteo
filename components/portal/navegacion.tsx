'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Timer,
  Trash2,
  Users,
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
  ArrowDownToLine,
} from 'lucide-react';
import { modulos, type IdModulo } from '@/lib/portal/modulos';
import { ESTILO_MODULO } from './modulos-ui';

type Enlace = {
  href: string;
  nombre: string;
  icono: LucideIcon;
  exacto?: boolean;
  /** Entrada de un módulo: se marca activa por la sección (Costeo vive en /resumen, /productos…), no por la ruta. */
  modulo?: IdModulo;
};
type Grupo = { titulo: string; enlaces: Enlace[]; separado?: boolean };
export type Seccion = 'inicio' | IdModulo;
/** Sucursal abierta en Franquiciatarios. gestor = gerente, franquiciatario o admin del módulo. */
export type Franquicia = { companyId: number; nombre: string; gestor: boolean; varias: boolean };

const entradaModulo = (m: IdModulo): Enlace => {
  const def = modulos.find((x) => x.id === m)!;
  return { href: def.href, nombre: def.nombre, icono: ESTILO_MODULO[m].icono, modulo: m };
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
        { href: `${b}/entradas`, nombre: 'Entradas', icono: ArrowDownToLine },
        { href: `${b}/caja`, nombre: 'Caja', icono: Banknote },
        { href: `${b}/mermas`, nombre: 'Mermas', icono: Trash2 },
        { href: `${b}/roles`, nombre: 'Roles', icono: Users },
        { href: `${b}/recetas`, nombre: 'Recetas', icono: BookOpen },
      ],
    },
  ];
  if (f.gestor)
    g.push({
      titulo: 'Gerencia',
      enlaces: [
        { href: `${b}/pedidos`, nombre: 'Pedidos', icono: Truck },
        { href: `${b}/inventario`, nombre: 'Inventario', icono: Boxes },
        { href: `${b}/existencias`, nombre: 'Existencias', icono: Scale },
        { href: `${b}/pyl`, nombre: 'P&L y metas', icono: BarChart3 },
        { href: `${b}/servicio`, nombre: 'Tiempo de preparación', icono: Timer },
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
    titulo: 'Red',
    enlaces: [
      { href: '/sucursales', nombre: 'Directorio', icono: LayoutGrid, exacto: true },
      { href: '/sucursales/mexico', nombre: 'Tablero México', icono: MapPinned },
    ],
  },
];

/** Pagos y administración de las sucursales propias: solo empleados Holding con 'sucursales_pagos' (spec §3). */
const grupoPropias: Grupo = {
  titulo: 'Sucursales propias · Helper Holding',
  separado: true,
  enlaces: [{ href: '/sucursales/propias/pagos', nombre: 'Pagos', icono: Wallet }],
};

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
 * Grupos de la sección: primero «Módulos» (Inicio y todos los módulos que el usuario puede ver, incluido el abierto),
 * luego los del módulo abierto. Franquiciatarios sin otros módulos no lleva «Módulos»: Inicio lo regresa a su sucursal.
 */
export function gruposDe(
  seccion: Seccion,
  visibles: IdModulo[],
  franquicia?: Franquicia,
  opciones: { red?: boolean; propias?: boolean } = {},
): Grupo[] {
  let propios =
    seccion === 'franquiciatarios'
      ? franquicia
        ? gruposFranquicia(franquicia)
        : []
      : gruposPorSeccion[seccion];
  if (seccion === 'sucursales')
    propios = [
      ...(opciones.red === false ? [] : gruposSucursales),
      ...(opciones.propias ? [grupoPropias] : []),
    ];
  if (visibles.every((m) => m === 'franquiciatarios') && seccion === 'franquiciatarios') return propios;
  const modulosGrupo: Grupo = {
    titulo: 'Módulos',
    enlaces: [
      { href: '/', nombre: 'Inicio', icono: LayoutGrid, exacto: true },
      ...visibles.map(entradaModulo),
    ],
  };
  return [modulosGrupo, ...propios];
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
  sucursales,
}: {
  alNavegar?: () => void;
  seccion?: Seccion;
  visibles?: IdModulo[];
  franquicia?: Franquicia;
  sucursales?: { red: boolean; propias: boolean };
}) {
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {gruposDe(seccion, visibles, franquicia, sucursales).map((g) => (
        <div key={g.titulo} className={g.separado ? 'border-t border-line pt-4' : undefined}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">
            {g.titulo}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.enlaces.map(({ href, nombre, icono: Icono, exacto, modulo }) => {
              const activo = modulo ? modulo === seccion : esActivo(href, exacto, pathname, tab);
              const color = modulo ? ESTILO_MODULO[modulo].texto : null;
              return (
                <li key={`${g.titulo}-${href}`}>
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
                      className={
                        color ?? (activo ? 'text-crema-strong' : 'text-muted-foreground group-hover:text-ink')
                      }
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
