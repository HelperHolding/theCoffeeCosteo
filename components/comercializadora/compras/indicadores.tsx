// components/comercializadora/compras/indicadores.tsx
import { AlertTriangle, Clock, ListTodo, type LucideIcon, PackageCheck, Percent, ShoppingBag, Timer, Trophy, Truck } from 'lucide-react';
import { Kpi } from '@/components/portal/piezas';
import { tarjetasIndicadores, type TarjetaIndicador } from '@/lib/comercializadora/compras/indicadores';
import type { TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

const ICONO: Record<TarjetaIndicador['clave'], LucideIcon> = {
  venta: ShoppingBag, compras: PackageCheck, ratio: Percent, llegaron: Truck, entregas: Clock, lead: Timer, mayor: Trophy, vencidas: AlertTriangle, faltan: ListTodo,
};

/** Los 9 indicadores; los textos vienen de tarjetasIndicadores, igual que en la descarga. */
export function IndicadoresCompras({ t, faltan }: { t: TableroCompras; faltan: number | null }) {
  return (
    <section aria-label="Indicadores" className="mb-6 grid gap-3 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
      {tarjetasIndicadores(t, faltan).map((x) => (
        <Kpi key={x.clave} etiqueta={x.etiqueta} icono={ICONO[x.clave]} valor={x.valor} nota={x.nota} tono={x.tono} />
      ))}
    </section>
  );
}
