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
  Store,
  UsersRound,
  Contact,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react';
import type { IdModulo } from '@/lib/portal/modulos';

type Enlace = { href: string; nombre: string; icono: LucideIcon; exacto?: boolean };
type Grupo = { titulo: string; enlaces: Enlace[] };
export type Seccion = 'inicio' | IdModulo;

const entradaModulo: Record<IdModulo, Enlace> = {
  costeo: { href: '/costeo', nombre: 'Costeo', icono: Calculator },
  crm: { href: '/crm', nombre: 'CRM Franquicias', icono: Store },
};

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
      { href: '/crm/tiendas', nombre: 'Tiendas', icono: Store },
      { href: '/crm/prospectos', nombre: 'Prospectos', icono: UsersRound },
      { href: '/crm/contactos', nombre: 'Contactos', icono: Contact },
      { href: '/crm/actividades', nombre: 'Actividades', icono: CalendarCheck },
    ],
  },
];

/**
 * Grupos de la sección: primero "Portal", luego los del módulo. En Inicio los módulos solo se
 * muestran como tarjetas; dentro de un módulo, "Portal" lleva a Inicio y a los otros módulos visibles.
 */
export function gruposDe(seccion: Seccion, visibles: IdModulo[]): Grupo[] {
  const otros = seccion === 'inicio' ? [] : visibles.filter((m) => m !== seccion);
  const portal: Grupo = {
    titulo: 'Portal',
    enlaces: [
      { href: '/', nombre: 'Inicio', icono: LayoutGrid, exacto: true },
      ...otros.map((m) => entradaModulo[m]),
    ],
  };
  const propios = seccion === 'costeo' ? grupos : seccion === 'crm' ? gruposCrm : [];
  return [portal, ...propios];
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
}: {
  alNavegar?: () => void;
  seccion?: Seccion;
  visibles?: IdModulo[];
}) {
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {gruposDe(seccion, visibles).map((g) => (
        <div key={g.titulo}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.22em] text-neutral-500">
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
                      activo
                        ? 'bg-white/[.09] text-white'
                        : 'text-neutral-400 hover:bg-white/[.05] hover:text-white'
                    }`}
                  >
                    {activo && (
                      <span aria-hidden="true" className="absolute -left-3 h-5 w-1 rounded-r-full bg-crema" />
                    )}
                    <Icono
                      size={17}
                      aria-hidden="true"
                      className={activo ? 'text-crema' : 'text-neutral-500 group-hover:text-neutral-300'}
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
