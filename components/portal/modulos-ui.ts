import {
  Activity,
  BarChart3,
  Calculator,
  ClipboardCheck,
  ShoppingCart,
  Store,
  type LucideIcon,
} from 'lucide-react';
import type { IdModulo } from '@/lib/portal/modulos';

/**
 * Presentación de cada módulo (un solo lugar para la navegación, la paleta y el dashboard de Inicio): ícono y color de
 * acento. Los colores son tokens del tema (globals.css, con variante oscura); las clases van completas para Tailwind.
 */
export interface EstiloModulo {
  icono: LucideIcon;
  /** Texto e ícono en el color del módulo. */
  texto: string;
  /** Fondo sólido (marca, barras). */
  marca: string;
  /** Fondo suave. */
  suave: string;
  /** Borde con transparencia. */
  borde: string;
  /** Brillo que sube desde abajo (tarjetas del dashboard). */
  brillo: string;
}

export const ESTILO_MODULO: Record<IdModulo, EstiloModulo> = {
  costeo: {
    icono: Calculator,
    texto: 'text-apertura',
    marca: 'bg-apertura',
    suave: 'bg-apertura-soft',
    borde: 'border-apertura/35',
    brillo: 'bg-linear-to-t from-apertura/18 via-apertura/6 via-45% to-surface',
  },
  crm: {
    icono: Store,
    texto: 'text-cambio',
    marca: 'bg-cambio',
    suave: 'bg-cambio-soft',
    borde: 'border-cambio/35',
    brillo: 'bg-linear-to-t from-cambio/18 via-cambio/6 via-45% to-surface',
  },
  sucursales: {
    icono: Activity,
    texto: 'text-ventas',
    marca: 'bg-ventas',
    suave: 'bg-ventas-soft',
    borde: 'border-ventas/35',
    brillo: 'bg-linear-to-t from-ventas/18 via-ventas/6 via-45% to-surface',
  },
  bi: {
    icono: BarChart3,
    texto: 'text-cierre',
    marca: 'bg-cierre',
    suave: 'bg-cierre-soft',
    borde: 'border-cierre/35',
    brillo: 'bg-linear-to-t from-cierre/18 via-cierre/6 via-45% to-surface',
  },
  comercializadora: {
    icono: ShoppingCart,
    texto: 'text-pedidos',
    marca: 'bg-pedidos',
    suave: 'bg-pedidos-soft',
    borde: 'border-pedidos/35',
    brillo: 'bg-linear-to-t from-pedidos/18 via-pedidos/6 via-45% to-surface',
  },
  franquiciatarios: {
    icono: ClipboardCheck,
    texto: 'text-tira',
    marca: 'bg-tira',
    suave: 'bg-tira-soft',
    borde: 'border-tira/35',
    brillo: 'bg-linear-to-t from-tira/18 via-tira/6 via-45% to-surface',
  },
};
