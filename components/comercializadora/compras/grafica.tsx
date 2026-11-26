// components/comercializadora/compras/grafica.tsx
import { COLORES_GRAFICA, graficaCompras } from '@/lib/comercializadora/compras/grafica';
import type { PuntoSerie } from '../../../supabase/functions/_shared/compras/tablero.ts';

export function GraficaCompras({ serie }: { serie: PuntoSerie[] }) {
  const ley = [['Venta', COLORES_GRAFICA.venta], ['Compras recibidas', COLORES_GRAFICA.compras], ['Presupuesto (50%)', COLORES_GRAFICA.presupuesto]];
  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 className="font-semibold">Venta, compras y presupuesto por semana</h2>
      <p className="mb-2 text-xs text-muted-foreground">Con IVA, sin DODO Pizza ni Compras The Coffee, igual al Reporte semanal. Presupuesto = 50% de la venta. Pasa el cursor sobre una semana para ver sus valores.</p>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-ink-2">
        {ley.map(([n, c]) => <span key={n} className="inline-flex items-center gap-1"><i aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: c }} />{n}</span>)}
      </div>
      {/* graficaCompras escapa todo el texto (esc) y no lleva scripts. */}
      <div dangerouslySetInnerHTML={{ __html: graficaCompras(serie) }} />
    </section>
  );
}
