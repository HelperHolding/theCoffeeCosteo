// components/comercializadora/reporte-semanal/ventas.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Ventas } from '../../../supabase/functions/_shared/reporte/ventas.ts';
import { finSemana } from '../../../supabase/functions/_shared/reporte/fechas.ts';
import { variacion, VerTodas } from './piezas';

const TIPOS = ['Ordinario', 'Llenado de canal', 'Apertura'];

export function VentasVista({ v }: { v: Ventas }) {
  const max = Math.max(1, ...v.semanas.map((s) => s.total));
  return (
    <div className="grid gap-3">
      <Tarjeta>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ventas de la semana</p>
            <p className="font-display text-4xl font-black tabular">{pesos(v.total)}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">MXN con IVA · ~{pesos(v.sinIva)} sin IVA (aprox.)</p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-black tabular">{v.pedidos}</p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">pedidos facturados</p>
          </div>
        </div>
        <ol className="mt-4 divide-y divide-line">
          <VerTodas
            filas={v.top}
            visibles={5}
            etiqueta="Ver top clientes"
            render={(t, i) => (
              <li key={t.nombre} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-5 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.sucursales.slice(0, 4).join(', ')}{t.sucursales.length > 4 ? ', y más' : ''}
                  </p>
                </div>
                <span className="font-mono tabular">{pesos(t.total)}</span>
              </li>
            )}
          />
        </ol>
      </Tarjeta>
      <Tarjeta titulo="Ventas · últimas 5 semanas" descripcion="Con IVA, por tipo de envío. Sin las exclusiones configuradas.">
        <div className="grid grid-cols-5 items-end gap-2">
          {v.semanas.map((s, i) => (
            <div key={s.lunes} className="text-center">
              <div className="mx-auto flex h-32 w-full max-w-14 flex-col-reverse overflow-hidden rounded-md bg-surface-2">
                {TIPOS.map((t, k) => (
                  <div
                    key={t}
                    title={`${t}: ${pesos(s.porTipo[t] ?? 0)}`}
                    className={['bg-ink', 'bg-crema-strong', 'bg-ok'][k]}
                    style={{ height: `${((s.porTipo[t] ?? 0) / max) * 100}%` }}
                  />
                ))}
              </div>
              <p className="mt-1 font-mono text-[11px] tabular">{pesos(s.total)}</p>
              <p className="text-[10px] text-muted-foreground">{fechaCorta(s.lunes)}–{fechaCorta(finSemana(s.lunes))}</p>
              <p className="text-[10px]">{i === 0 ? '—' : variacion(v.semanas[i - 1].total ? (s.total - v.semanas[i - 1].total) / v.semanas[i - 1].total : null)}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
          {TIPOS.map((t, k) => (
            <li key={t} className="flex items-center gap-1">
              <span className={['bg-ink', 'bg-crema-strong', 'bg-ok'][k] + ' size-2 rounded-sm'} aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-1 text-sm">
          <div>Vs semana anterior: <strong className="tabular">{pesos(v.difAnterior)}</strong> {variacion(v.vsAnterior)}</div>
          <div>Solo ordinario: <strong className="tabular">{pesos(v.difAnteriorOrdinario)}</strong> {variacion(v.vsAnteriorOrdinario)}</div>
          <div>Promedio 5 semanas: <strong className="tabular">{pesos(v.promedio)}</strong> · esta semana {variacion(v.vsPromedio)}</div>
        </dl>
      </Tarjeta>
    </div>
  );
}
