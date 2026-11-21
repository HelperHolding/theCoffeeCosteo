import { Info } from 'lucide-react';
import { cn } from 'cn';
import type { ServicioFranq } from '@/lib/franquiciatarios/servicio';
import { Vacio } from '@/components/portal/piezas';
import { diaCorto } from './formato';

const pct = (x: number | null) =>
  x === null ? '—' : `${(x * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
const min = (x: number | null) =>
  x === null ? '—' : `${x.toLocaleString('es-MX', { maximumFractionDigits: 1 })} min`;

/**
 * Tiempo de preparación con lo que Rappi publica (el POS no da la hora de entrega): % de pedidos con cocina demorada,
 * rechazos por demora en tienda y espera del repartidor. Solo canal Rappi; con 1–2 días de atraso.
 */
export function ServicioFranq({ s, compacto }: { s: ServicioFranq; compacto?: boolean }) {
  if (!s.tiendas)
    return <Vacio titulo="Sin Rappi">Esta sucursal no tiene tiendas de Rappi conectadas al portal.</Vacio>;
  if (!s.actualizadoHasta)
    return (
      <Vacio titulo="Sin datos de Rappi">
        Rappi todavía no ha publicado el nivel de servicio de esta tienda.
      </Vacio>
    );
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Solo pedidos de Rappi. Rappi publica con 1–2 días de atraso: datos hasta el{' '}
        {diaCorto(s.actualizadoHasta)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra
          titulo="Cocina demorada"
          semana={pct(s.semana.tasaCocina)}
          mes={pct(s.mes.tasaCocina)}
          detalle={`${s.semana.cocinaDemorada} de ${s.semana.cocinaPedidos} pedidos en 7 días`}
          malo={(s.semana.tasaCocina ?? 0) > (s.mes.tasaCocina ?? 0)}
        />
        <Cifra
          titulo="Rechazos por demora en tienda"
          semana={String(s.semana.rechazos.demora)}
          mes={String(s.mes.rechazos.demora)}
          detalle="Pedidos que Rappi canceló porque la tienda tardó"
          malo={s.semana.rechazos.demora > 0}
        />
        <Cifra
          titulo="Espera del repartidor"
          semana={min(s.semana.espera)}
          mes={min(s.mes.espera)}
          detalle="Minutos promedio que el repartidor espera en tienda"
          malo={(s.semana.espera ?? 0) > (s.mes.espera ?? 0)}
        />
      </div>
      {!compacto && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Día</th>
                <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2 text-right font-medium">Cocina demorada</th>
                <th className="px-3 py-2 text-right font-medium">Rechazos por demora</th>
                <th className="px-4 py-2 text-right font-medium">Espera del repartidor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.porDia.map((d) => (
                <tr key={d.fecha}>
                  <td className="px-4 py-2">{diaCorto(d.fecha)}</td>
                  <td className="px-3 py-2 text-right tabular">{d.cocinaPedidos}</td>
                  <td className="px-3 py-2 text-right tabular">
                    {d.cocinaDemorada} <span className="text-ink-2">({pct(d.tasaCocina)})</span>
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular',
                      d.rechazos.demora > 0 && 'font-semibold text-bad',
                    )}
                  >
                    {d.rechazos.demora}
                  </td>
                  <td className="px-4 py-2 text-right tabular">{min(d.espera)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cifra({
  titulo,
  semana,
  mes,
  detalle,
  malo,
}: {
  titulo: string;
  semana: string;
  mes: string;
  detalle: string;
  malo?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-xs text-ink-2">{titulo} · 7 días</p>
      <p className={cn('mt-1 font-display text-2xl font-black tabular', malo && 'text-bad')}>{semana}</p>
      <p className="text-xs text-ink-2">30 días: {mes}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}
