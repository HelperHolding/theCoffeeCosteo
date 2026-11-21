import { Bike, ChefHat, Info, TimerOff, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import type { ServicioFranq as Servicio } from '@/lib/franquiciatarios/servicio';
import { Vacio } from '@/components/portal/piezas';
import { diaCorto } from './formato';
import { TONO, type Tono } from './colores';

const pct = (x: number | null) =>
  x === null ? '—' : `${(x * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
const min = (x: number | null) =>
  x === null ? '—' : `${x.toLocaleString('es-MX', { maximumFractionDigits: 1 })} min`;

/**
 * Tiempo de preparación con lo que Rappi publica (el POS no da la hora de entrega): % de pedidos con cocina demorada,
 * rechazos por demora en tienda y espera del repartidor. Solo canal Rappi; con 1–2 días de atraso.
 */
export function ServicioFranq({ s }: { s: Servicio }) {
  if (!s.tiendas)
    return <Vacio titulo="Sin Rappi">Esta sucursal no tiene tiendas de Rappi conectadas al portal.</Vacio>;
  if (!s.actualizadoHasta)
    return (
      <Vacio titulo="Sin datos de Rappi">
        Rappi todavía no ha publicado el nivel de servicio de esta tienda.
      </Vacio>
    );
  const dias = [...s.porDia].reverse().slice(-14);
  const maxTasa = Math.max(0.05, ...dias.map((d) => d.tasaCocina ?? 0));
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Solo pedidos de Rappi. Rappi publica con 1–2 días de atraso: datos hasta el{' '}
        {diaCorto(s.actualizadoHasta)}.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <Indicador
          tono="incidencia"
          icono={ChefHat}
          titulo="Cocina demorada"
          valor={pct(s.semana.tasaCocina)}
          base={s.mes.tasaCocina}
          actual={s.semana.tasaCocina}
          formato={pct}
          detalle={`${s.semana.cocinaDemorada} de ${s.semana.cocinaPedidos} pedidos en 7 días`}
        />
        <Indicador
          tono="alerta"
          icono={TimerOff}
          titulo="Rechazos por demora"
          valor={String(s.semana.rechazos.demora)}
          base={s.mes.rechazos.demora / 30}
          actual={s.semana.rechazos.demora / 7}
          formato={(x) =>
            x === null ? '—' : `${(x * 7).toLocaleString('es-MX', { maximumFractionDigits: 1 })}/sem`
          }
          detalle="Pedidos que Rappi canceló porque la tienda tardó"
        />
        <Indicador
          tono="cierre"
          icono={Bike}
          titulo="Espera del repartidor"
          valor={min(s.semana.espera)}
          base={s.mes.espera}
          actual={s.semana.espera}
          formato={min}
          detalle="Minutos promedio que el repartidor espera en tienda"
        />
      </div>

      <section
        aria-labelledby="por-dia"
        className="rounded-3xl border border-line bg-surface p-5 shadow-card"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="por-dia" className="text-lg">
            Cocina demorada por día
          </h2>
          <p className="text-xs text-ink-2">
            Últimos {dias.length} días publicados · % de pedidos con retraso
          </p>
        </div>
        <div
          className="mt-4 flex h-44 items-end gap-1.5"
          role="img"
          aria-label="Porcentaje de cocina demorada por día"
        >
          {dias.map((d) => {
            const v = d.tasaCocina ?? 0;
            const alto = Math.max(3, (v / maxTasa) * 100);
            const nivel = v >= 0.1 ? 'bg-bad' : v >= 0.05 ? 'bg-incidencia' : 'bg-ok';
            return (
              <div
                key={d.fecha}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-[10px] font-semibold tabular text-ink-2">
                  {d.tasaCocina === null ? '' : Math.round(v * 100)}
                </span>
                <span
                  className={cn('w-full max-w-9 rounded-t-lg', nivel)}
                  style={{ height: `${alto}%` }}
                  title={`${diaCorto(d.fecha)}: ${pct(d.tasaCocina)} (${d.cocinaDemorada} de ${d.cocinaPedidos})`}
                />
                <span className="text-[10px] text-ink-2 tabular">{Number(d.fecha.slice(8))}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-2">
          <Leyenda clase="bg-ok" texto="Menos de 5 %" />
          <Leyenda clase="bg-incidencia" texto="5 a 10 %" />
          <Leyenda clase="bg-bad" texto="10 % o más" />
        </div>
      </section>

      <details className="rounded-3xl border border-line bg-surface p-5 shadow-card">
        <summary className="cursor-pointer font-display font-bold">Detalle por día</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Día</th>
                <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2 text-right font-medium">Cocina demorada</th>
                <th className="px-3 py-2 text-right font-medium">Rechazos por demora</th>
                <th className="py-2 pl-3 text-right font-medium">Espera</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.porDia.map((d) => (
                <tr key={d.fecha}>
                  <td className="py-2 pr-3">{diaCorto(d.fecha)}</td>
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
                  <td className="py-2 pl-3 text-right tabular">{min(d.espera)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-2.5 rounded-full', clase)} /> {texto}
    </span>
  );
}

/** Indicador de la semana contra el promedio de 30 días (más alto = peor en los tres). */
function Indicador({
  tono,
  icono: Icono,
  titulo,
  valor,
  base,
  actual,
  formato,
  detalle,
}: {
  tono: Tono;
  icono: LucideIcon;
  titulo: string;
  valor: string;
  base: number | null;
  actual: number | null;
  formato: (x: number | null) => string;
  detalle: string;
}) {
  const t = TONO[tono];
  const dif = base === null || actual === null ? null : actual - base;
  const peor = dif !== null && dif > 1e-9;
  const mejor = dif !== null && dif < -1e-9;
  return (
    <div className={cn('relative overflow-hidden rounded-3xl border p-5 shadow-card', t.brillo, t.borde)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('grid size-10 place-items-center rounded-2xl text-primary-foreground', t.marca)}>
          <Icono size={19} aria-hidden="true" />
        </span>
        {(peor || mejor) && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
              peor ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok',
            )}
          >
            {peor ? (
              <TrendingUp size={13} aria-hidden="true" />
            ) : (
              <TrendingDown size={13} aria-hidden="true" />
            )}
            {peor ? 'Peor' : 'Mejor'} que el mes
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-semibold text-ink-2">{titulo} · últimos 7 días</p>
      <p className="font-display text-4xl leading-tight font-black tabular">{valor}</p>
      <p className="text-xs text-ink-2">Promedio de 30 días: {formato(base)}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}
