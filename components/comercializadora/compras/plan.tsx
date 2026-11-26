// components/comercializadora/compras/plan.tsx
import { pesos, numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { PlanCompra } from '@/lib/comercializadora/compras/plan';
import type { OcPorLlegar } from '../../../supabase/functions/_shared/compras/tablero.ts';

const TONO_URG = { Urgente: 'text-bad font-semibold', Pronto: 'text-warn font-semibold', Normal: 'text-ink-2' } as const;

export function PlanCompraVista({ plan, porLlegar }: { plan: PlanCompra; porLlegar: OcPorLlegar[] }) {
  const tarjeta = (t: string, v: string, nota: string, clase: string) => (
    <div className="rounded-2xl border border-line bg-surface p-4"><p className="text-sm text-ink-2">{t}</p><p className={`mt-1 font-display text-2xl font-black ${clase}`}>{v}</p><p className="mt-1 text-xs text-muted-foreground">{nota}</p></div>
  );
  return (
    <>
      <p className="mb-3 max-w-4xl text-xs text-muted-foreground">Artículos de compra recurrente que el plan de abastos marca para pedir esta semana o la próxima. Días que alcanza = inventario entre venta diaria (Urgente: menos de 5 días; Pronto: 5 a 10). Llega: arribo esperado de la OC abierta (en rojo si ya pasó).</p>
      <div className="mb-3 grid gap-3 *:min-w-0 sm:grid-cols-3">
        {tarjeta('Urgentes (menos de 5 días)', String(plan.urgentes.n), pesos(plan.urgentes.monto), 'text-bad')}
        {tarjeta('Pronto (5 a 10 días)', String(plan.pronto.n), pesos(plan.pronto.monto), 'text-warn')}
        {tarjeta('Insumos por llegar', String(porLlegar.length), pesos(porLlegar.reduce((a, o) => a + o.monto, 0)), '')}
      </div>
      {plan.filas.length === 0 ? <p className="mb-6 text-sm text-ink-2">El plan no pide nada esta semana ni la próxima con estos filtros.</p> : (
        <div className="mb-6 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[56rem] text-sm tabular">
            <thead className="bg-surface-2 text-left text-xs text-ink-2"><tr>
              {['Urgencia', 'Artículo', 'Proveedor', 'Decisión', 'Inventario', 'Días que alcanza', 'Pedir esta', 'Costo esta', 'Pedir próxima', 'Costo próxima', 'Llega'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>{plan.filas.map((f) => (
              <tr key={`${f.proveedor}|${f.sku}`} className="border-t border-line align-top">
                <td className={`px-3 py-2 ${TONO_URG[f.urgencia]}`}>{f.urgencia}</td>
                <td className="px-3 py-2">{f.nombre}<div className="text-xs text-muted-foreground">{f.sku}</div></td>
                <td className="px-3 py-2">{f.proveedor}</td>
                <td className="px-3 py-2">{f.decision}</td>
                <td className="px-3 py-2 text-right">{numero(f.inventario)}{f.faltaSurtir > 0 && <div className="text-xs text-bad">faltan {numero(f.faltaSurtir)} por surtir</div>}</td>
                <td className="px-3 py-2 text-right">{f.dias == null ? '—' : numero(Math.round(f.dias * 10) / 10)}</td>
                <td className="px-3 py-2 text-right">{numero(f.pedir[0])}</td>
                <td className="px-3 py-2 text-right">{pesos(f.costo[0])}</td>
                <td className="px-3 py-2 text-right">{numero(f.pedir[1])}</td>
                <td className="px-3 py-2 text-right">{pesos(f.costo[1])}</td>
                <td className={`px-3 py-2 ${f.llegaVencida ? 'text-bad font-semibold' : ''}`}>{f.llega ? fechaCorta(f.llega) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
