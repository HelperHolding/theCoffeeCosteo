'use client';
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ConsumoNacional, DesgloseConsumo } from '@/lib/sucursales/contratos';
import { armarDesglose, vistaConsumo, type FilaInsumo } from '@/lib/sucursales/consumo-nacional';
import { etiquetaOrigen, filtrosOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { cn } from '@/lib/utils';
import { ErrorCarga, Esqueleto } from './estados';
import { useLectura } from './use-lectura';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const num = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const pct = (x: number) => `${Math.round(x * 100)} %`;
const cambioTexto = (c: number | null) => (c === null ? '—' : `${c > 0 ? '+' : ''}${Math.round(c * 100)} %`);
/** Cantidad con su unidad; con más de 10,000 g o ml añade el equivalente en kg o L. */
const cantidadTexto = (x: number, unidad: string) => {
  const base = `${num.format(x)} ${unidad}`;
  if (x > 10000 && unidad === 'gr') return `${base} (${num.format(x / 1000)} kg)`;
  if (x > 10000 && unidad === 'ml') return `${base} (${num.format(x / 1000)} L)`;
  return base;
};

/** Consumo nacional por mes (docs/sucursales/17): lee lo que guardó el script; el filtro de origen se aplica aquí. */
export function ConsumoNacionalVista() {
  const [mes, setMes] = useState<string | null>(null);
  const [origen, setOrigen] = useState<FiltroOrigen>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const { datos, error, recargar } = useLectura<ConsumoNacional>(
    `/api/sucursales/consumo-nacional${mes ? `?mes=${mes.slice(0, 7)}` : ''}`,
  );
  const v = useMemo(() => (datos ? vistaConsumo(datos, origen) : null), [datos, origen]);
  if (!datos || !v) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={3} />;
  if (!datos.mes)
    return (
      <Tarjeta>
        <Vacio titulo="Aún no hay meses calculados">
          El consumo de un mes se calcula al cerrarlo con el script consumo-mes (docs/sucursales/17).
        </Vacio>
      </Tarjeta>
    );
  return (
    <div className="tablero-mx space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Mes" className="flex flex-wrap gap-2">
          {datos.meses.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === datos.mes}
              onClick={() => {
                setMes(m);
                setAbierto(null);
              }}
              className={cn('rounded-full px-3 py-1.5 text-sm font-semibold', m === datos.mes ? 'bg-ink text-crema' : 'bg-muted')}
            >
              {nombreMes(m)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Origen" className="flex flex-wrap gap-1.5">
          {filtrosOrigen.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={o === origen}
              onClick={() => setOrigen(o)}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold', o === origen ? 'bg-ink text-crema' : 'bg-muted')}
            >
              {etiquetaOrigen[o]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero titulo="Ingredientes con consumo" valor={num.format(v.ingredientes)} />
        <Numero titulo="Sucursales" valor={num.format(v.sucursales)} nota={v.incompletas ? `${v.incompletas} con el mes incompleto` : undefined} />
        <Numero titulo="Cobertura" valor={v.cobertura === null ? '—' : pct(v.cobertura)} nota="líneas con receta" />
        <Numero
          titulo="Contra el mes anterior"
          valor={datos.sucursalesAnterior ? `${v.categorias.flatMap((c) => c.filas).filter((f) => (f.cambio ?? 0) > 0.1).length} suben >10 %` : '—'}
          nota={datos.sucursalesAnterior && datos.sucursalesAnterior < v.sucursales ? `solo ${datos.sucursalesAnterior} sucursales con mes anterior` : undefined}
        />
      </div>

      {v.incompletas > 0 && (
        <p role="status" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          {v.incompletas} sucursales tienen días sin leer completos en {nombreMes(datos.mes)}: su consumo puede ser menor
          al real.
        </p>
      )}

      <BotonExportar datos={datos} origen={origen} filas={v.categorias.flatMap((c) => c.filas)} />

      {v.categorias.map((c) => (
        <Tarjeta key={c.categoria}>
          <h3 className="font-display text-base font-bold">{c.categoria}</h3>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">Ingrediente</th>
                <th className="py-1 text-right">Consumo</th>
                <th className="hidden py-1 text-right sm:table-cell">Presentaciones</th>
                <th className="py-1 text-right">Vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {c.filas.map((f) => (
                <Fragment key={f.insumoId}>
                  <FilaTabla fila={f} abierta={abierto === f.insumoId} alAbrir={() => setAbierto(abierto === f.insumoId ? null : f.insumoId)} />
                  {abierto === f.insumoId && (
                    <tr>
                      <td colSpan={4}>
                        <Desglose datos={datos} fila={f} origen={origen} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      ))}

      {v.sinReceta.length > 0 && (
        <Tarjeta>
          <h3 className="font-display text-base font-bold">Vendidos sin receta (no cuentan en el consumo)</h3>
          <ul className="mt-2 divide-y text-sm">
            {v.sinReceta.map((s) => (
              <li key={s.nombre} className="flex justify-between py-1.5">
                <span>{s.nombre}{s.sinCodigo ? ' · sin código' : ''}</span>
                <span className="text-muted-foreground">{num.format(s.unidades)} u · {s.sucursales} suc.</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}

function Numero({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="placa px-4 py-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="font-display text-2xl font-bold">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function FilaTabla({ fila: f, abierta, alAbrir }: { fila: FilaInsumo; abierta: boolean; alAbrir: () => void }) {
  const Icono = abierta ? ChevronDown : ChevronRight;
  return (
    <tr className="border-t">
      <td className="py-1.5">
        <button type="button" aria-expanded={abierta} onClick={alAbrir} className="flex items-center gap-1 text-left font-medium">
          <Icono size={14} aria-hidden="true" />
          {f.insumo}
        </button>
      </td>
      <td className="py-1.5 text-right tabular-nums">{cantidadTexto(f.cantidad, f.unidad)}</td>
      <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">
        {f.presentaciones === null ? '—' : `${num.format(f.presentaciones)} × ${num.format(f.presentacion!)} ${f.unidad}`}
      </td>
      <td
        className={cn(
          'py-1.5 text-right tabular-nums',
          f.cambio !== null && f.cambio > 0.03 && 'text-ok',
          f.cambio !== null && f.cambio < -0.03 && 'text-bad',
        )}
      >
        {cambioTexto(f.cambio)}
      </td>
    </tr>
  );
}

function Desglose({ datos, fila, origen }: { datos: ConsumoNacional; fila: FilaInsumo; origen: FiltroOrigen }) {
  const { datos: d, error, recargar } = useLectura<DesgloseConsumo>(
    `/api/sucursales/consumo-nacional/desglose?mes=${datos.mes!.slice(0, 7)}&insumo=${fila.insumoId}`,
  );
  if (!d) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={1} />;
  const r = armarDesglose(d.filas, fila.insumoId, origen, datos.sucursales);
  return (
    <section aria-label={`Desglose de ${fila.insumo}`} className="grid gap-4 bg-muted/40 p-3 sm:grid-cols-2">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground">Por ciudad</h4>
        <ul className="mt-1 space-y-1 text-sm">
          {r.ciudades.map((c) => (
            <li key={c.ciudad} className="flex justify-between gap-2">
              <span>{c.ciudad}</span>
              <span className="tabular-nums">{num.format(c.cantidad)} {fila.unidad} · {pct(c.parte)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground">Por sucursal</h4>
        <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto text-sm">
          {r.sucursales.map((s) => (
            <li key={s.companyId} className="flex justify-between gap-2">
              <span>{s.nombre}</span>
              <span className="tabular-nums">{num.format(s.cantidad)} {fila.unidad} · {pct(s.parte)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BotonExportar(_: { datos: ConsumoNacional; origen: FiltroOrigen; filas: FilaInsumo[] }) {
  return null; // Task 6
}
