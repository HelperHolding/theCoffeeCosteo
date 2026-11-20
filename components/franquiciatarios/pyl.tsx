'use client';
import { useState, useTransition } from 'react';
import { CircleAlert, Info, LoaderCircle, Target } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { guardarGastoFijo, type Resultado } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import { CONCEPTOS_FIJOS } from '@/lib/franquiciatarios/pyl';
import type { PylMes } from '@/lib/franquiciatarios/pyl-servidor';
import { Franja } from './colores';
import { diaCorto } from './formato';

const pesos = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)} %`;
const campo =
  'h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-right text-sm tabular text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35';

/** P&L del mes con su proyección, metas de venta (día, semana, mes) y gastos fijos editables. */
export function PylFranq({
  companyId,
  datos,
  enCurso,
}: {
  companyId: number;
  datos: PylMes;
  enCurso: boolean;
}) {
  const { pyl, metas, venta } = datos;
  const utilidad = pyl.lineas.find((l) => l.clave === 'utilidad')!;
  return (
    <div className="space-y-6">
      {datos.avisos.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-ink">
          {datos.avisos.map((a) => (
            <li key={a} className="flex items-start gap-2">
              <Info size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" /> {a}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="metas" className="space-y-3">
        <h2 id="metas" className="flex items-center gap-2 text-lg">
          <Target size={18} aria-hidden="true" /> Venta contra meta
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Meta
            titulo={enCurso ? 'Hoy' : `Último día (${diaCorto(datos.hasta)})`}
            venta={venta.dia}
            meta={metas.dia}
          />
          <Meta
            titulo={`Semana (${diaCorto(metas.semanaDesde)} – ${diaCorto(metas.semanaHasta)})`}
            venta={venta.semana}
            meta={metas.semana}
          />
          <Meta titulo="Mes" venta={venta.mes} meta={metas.mes} />
        </div>
      </section>

      <section aria-labelledby="pyl" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="pyl" className="text-lg">
            Estado de resultados
          </h2>
          <p className="text-sm text-ink-2">
            {enCurso
              ? `Mes al ${Math.round(pyl.avanceMes * 100)} %: la proyección escala lo variable`
              : 'Mes cerrado'}
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 text-right font-medium">{enCurso ? 'Mes a la fecha' : 'Mes'}</th>
                {enCurso && <th className="px-3 py-2 text-right font-medium">Proyección al cierre</th>}
                <th className="px-4 py-2 text-right font-medium">% de la venta neta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pyl.lineas.map((l) => {
                const netas = pyl.lineas.find((x) => x.clave === 'netas')!.real;
                const fuerte = l.tipo === 'subtotal' || l.tipo === 'resultado';
                const negativo = l.tipo === 'resultado' && l.real < 0;
                return (
                  <tr
                    key={l.clave}
                    className={cn(fuerte && 'bg-surface-2/50', l.tipo === 'resultado' && 'text-base')}
                  >
                    <td className={cn('px-4 py-2', l.tipo === 'costo' && 'pl-7', fuerte && 'font-semibold')}>
                      {l.tipo === 'costo' ? '− ' : ''}
                      {l.nombre}
                      {l.nota && (
                        <span className="block text-xs font-normal text-muted-foreground">{l.nota}</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular',
                        fuerte && 'font-semibold',
                        negativo && 'text-bad',
                      )}
                    >
                      {pesos(l.real)}
                    </td>
                    {enCurso && (
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular',
                          fuerte && 'font-semibold',
                          l.tipo === 'resultado' && l.proyeccion < 0 && 'text-bad',
                        )}
                      >
                        {pesos(l.proyeccion)}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular text-ink-2">
                      {l.clave === 'venta' || netas <= 0 ? '' : pct(l.real / netas)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Cifra
            titulo="Punto de equilibrio (venta con IVA)"
            valor={pyl.puntoEquilibrio === null ? '—' : pesos(pyl.puntoEquilibrio)}
            detalle={
              pyl.margenContribucion === null
                ? 'Sin venta para calcular el margen.'
                : `Con un margen de contribución de ${pct(pyl.margenContribucion)} por peso vendido.`
            }
          />
          <Cifra
            titulo={enCurso ? 'Utilidad proyectada al cierre' : 'Utilidad del mes'}
            valor={pesos(enCurso ? utilidad.proyeccion : utilidad.real)}
            detalle="Antes de impuestos y depreciación."
            malo={(enCurso ? utilidad.proyeccion : utilidad.real) < 0}
          />
        </div>
      </section>

      <Fijos companyId={companyId} datos={datos} />
    </div>
  );
}

function Meta({ titulo, venta, meta }: { titulo: string; venta: number; meta: number | null }) {
  const avance = meta && meta > 0 ? venta / meta : null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ventas/40 bg-linear-to-t from-ventas/20 via-ventas/5 to-surface p-4 pl-5 shadow-card">
      <Franja tono="ventas" />
      <p className="text-xs text-ink-2">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-black tabular">{pesos(venta)}</p>
      <p className="text-xs text-ink-2">{meta === null ? 'Sin meta cargada' : `Meta ${pesos(meta)}`}</p>
      {avance !== null && (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div
              className={cn('h-full rounded-full', avance >= 1 ? 'bg-ok' : 'bg-ventas')}
              style={{ width: `${Math.min(100, avance * 100)}%` }}
            />
          </div>
          <p className={cn('mt-1 text-xs font-semibold', avance >= 1 ? 'text-ok' : 'text-ink-2')}>
            {pct(avance)} de la meta
          </p>
        </>
      )}
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  detalle,
  malo,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  malo?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-xs text-ink-2">{titulo}</p>
      <p className={cn('mt-1 font-display text-2xl font-black tabular', malo && 'text-bad')}>{valor}</p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

/** Gastos fijos del mes: vienen de Zoho; la gerencia corrige o completa (el último registro manda). */
function Fijos({ companyId, datos }: { companyId: number; datos: PylMes }) {
  return (
    <section aria-labelledby="fijos" className="space-y-3">
      <h2 id="fijos" className="text-lg">
        Gastos fijos del mes
      </h2>
      <p className="text-sm text-ink-2">
        Se cargan de Zoho («Gastos Sucursales»). Si algo cambió este mes, corrígelo aquí: queda tu captura y
        el historial.
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {CONCEPTOS_FIJOS.map((c) => (
          <Fijo
            key={c.clave}
            companyId={companyId}
            mes={datos.mes}
            concepto={c.clave}
            nombre={c.nombre}
            actual={datos.fijos.find((f) => f.concepto === c.clave)}
          />
        ))}
      </ul>
    </section>
  );
}

function Fijo({
  companyId,
  mes,
  concepto,
  nombre,
  actual,
}: {
  companyId: number;
  mes: string;
  concepto: string;
  nombre: string;
  actual?: PylMes['fijos'][number];
}) {
  const [valor, setValor] = useState(actual ? String(actual.monto) : '');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const numero = Number(valor.replace(/[$,\s]/g, ''));
  const cambio = valor.trim() !== '' && Number.isFinite(numero) && numero !== (actual?.monto ?? NaN);
  return (
    <li className="px-4 py-2.5">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            setError(null);
            let r: Resultado;
            try {
              r = await guardarGastoFijo({ companyId, mes, concepto, monto: numero });
            } catch {
              r = { error: 'No se guardó: no hay conexión.' };
            }
            if ('error' in r) setError(r.error);
          });
        }}
      >
        <label htmlFor={`fijo-${concepto}`} className="min-w-0 flex-1 text-sm">
          <span className="block font-medium text-ink">{nombre}</span>
          <span className="block text-xs text-muted-foreground">
            {actual ? (actual.origen === 'zoho' ? 'De Zoho' : `Capturado por ${actual.nombre}`) : 'Sin dato'}
          </span>
        </label>
        <input
          id={`fijo-${concepto}`}
          inputMode="decimal"
          className={cn(campo, 'w-36')}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="$0"
        />
        <Button
          type="submit"
          size="sm"
          variant={cambio ? 'default' : 'outline'}
          disabled={pendiente || !cambio}
        >
          {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Guardar
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-sm font-medium text-bad">
          <CircleAlert size={14} aria-hidden="true" /> {error}
        </p>
      )}
    </li>
  );
}
