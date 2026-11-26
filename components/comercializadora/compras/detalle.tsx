// components/comercializadora/compras/detalle.tsx
import { pesos, numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

export function DetalleCompras({ t }: { t: TableroCompras }) {
  const cab = 'bg-surface-2 text-left text-xs text-ink-2';
  return (
    <div className="mb-6 grid gap-3">
      <details className="rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">OCs por proveedor del periodo ({t.proveedores.length})</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm tabular">
            <thead className={cab}><tr>{['Proveedor', 'OCs', 'Monto', 'Registro', 'A tiempo', 'Atrasadas', 'Pendientes (vencidas / en plazo)', 'Lead time'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{t.proveedores.map((p) => (
              <tr key={p.proveedor} className="border-t border-line">
                <td className="px-3 py-2">{p.proveedor}</td><td className="px-3 py-2 text-right">{p.ocs}</td><td className="px-3 py-2 text-right">{pesos(p.monto)}</td>
                <td className="px-3 py-2 text-right">{p.registro}</td><td className="px-3 py-2 text-right">{p.aTiempo}</td><td className="px-3 py-2 text-right">{p.atrasadas}</td>
                <td className="px-3 py-2 text-right">{p.pendVencidas} / {p.pendEnPlazo}</td><td className="px-3 py-2 text-right">{p.lead == null ? '—' : `${numero(p.lead)} días`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      <details className="rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">OCs por llegar ({t.porLlegar.length})</summary>
        <ul className="mt-3 grid gap-2">{t.porLlegar.map((o) => (
          <li key={o.folio} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap gap-x-3"><b>{o.folio}</b><span>{o.proveedor}</span><span>{o.arribo ? `Arribo ${fechaCorta(o.arribo)}` : 'Sin fecha de arribo'}</span>
              <span className={o.estado === 'Vencida' ? 'font-semibold text-bad' : 'text-ink-2'}>{o.estado}</span><span className="ml-auto">{pesos(o.monto)}</span></div>
            {o.articulos.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{o.articulos.map((a) => `${a.sku} · ${a.nombre} ×${numero(a.pendiente)}`).join('; ')}</p>}
          </li>
        ))}</ul>
      </details>
    </div>
  );
}
