'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, CircleCheck, LoaderCircle, PackageSearch } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { contar, type Resultado } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { EstadoConteo, FranqInsumo, MomentoConteo } from '@/lib/franquiciatarios/tipos';
import { MOMENTOS } from '@/lib/franquiciatarios/conteos';
import { Franja } from './colores';
import { hora } from './formato';

const SIN_RED = 'No se guardó: no hay conexión. Lo capturado sigue aquí; reintenta cuando vuelva la red.';

/**
 * Conteo de insumos críticos de hoy. Siempre en blanco: la cuenta de baristas no ve cantidades anteriores (no ve
 * inventario). Se cuenta todo lo de la lista; un recuento reemplaza al anterior del mismo momento.
 */
export function ConteoFranq({
  companyId,
  momento,
  insumos,
  estados,
  gestor,
}: {
  companyId: number;
  momento: MomentoConteo;
  insumos: Pick<FranqInsumo, 'id' | 'nombre' | 'unidad'>[];
  estados: EstadoConteo[];
  gestor: boolean;
}) {
  const [valores, setValores] = useState<string[]>(() => insumos.map(() => ''));
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const estado = estados.find((e) => e.momento === momento);
  const numeros = valores.map((v) => (v.trim() === '' ? NaN : Number(v.replace(',', '.'))));
  const faltan = numeros.filter((n) => !Number.isFinite(n)).length;
  const negativos = numeros.some((n) => Number.isFinite(n) && n < 0);

  const guardar = () =>
    iniciar(async () => {
      setError(null);
      let r: Resultado;
      try {
        r =
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? { error: SIN_RED }
            : await contar({
                companyId,
                momento,
                conteos: insumos.map((i, k) => ({ insumo: i.id, cantidad: numeros[k] })),
              });
      } catch {
        r = { error: SIN_RED };
      }
      if ('error' in r) setError(r.error);
      else {
        setListo(true);
        setValores(insumos.map(() => ''));
      }
    });

  return (
    <div className="space-y-4">
      <nav aria-label="Momento del conteo" className="grid grid-cols-2 gap-2">
        {MOMENTOS.map((m) => {
          const e = estados.find((x) => x.momento === m.clave);
          const activo = m.clave === momento;
          return (
            <Link
              key={m.clave}
              href={`/franquiciatarios/${companyId}/conteo?momento=${m.clave}`}
              aria-current={activo ? 'page' : undefined}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center overflow-hidden rounded-xl border px-3 py-2 text-center text-ink transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45',
                activo
                  ? 'border-pedidos/40 bg-linear-to-t from-pedidos/25 to-surface shadow-card'
                  : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('absolute inset-x-0 top-0 bg-pedidos', activo ? 'h-1' : 'h-0.5')}
              />
              <span className="text-sm font-bold">{m.nombre}</span>
              <span className="text-xs text-ink-2">
                {e ? `Contado a las ${hora(e.registrado_en)}` : 'Sin contar'}
              </span>
            </Link>
          );
        })}
      </nav>

      {estado && (
        <p className="flex items-start gap-2 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ink">
          <CircleCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
          <span>
            {estado.nombre} contó {estado.insumos} insumos a las {hora(estado.registrado_en)}. Si hace falta,
            vuelve a contar: el nuevo conteo reemplaza al anterior.
          </span>
        </p>
      )}
      {listo && !estado && (
        <p className="rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ink">
          Conteo guardado.
        </p>
      )}

      {insumos.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-2 shadow-card">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <PackageSearch size={16} aria-hidden="true" /> Aún no hay lista de insumos a contar.
          </p>
          <p className="mt-1">
            {gestor ? (
              <>
                Ármala en{' '}
                <Link className="font-semibold underline" href={`/franquiciatarios/${companyId}/inventario`}>
                  Inventario
                </Link>{' '}
                con la lista sugerida por las ventas.
              </>
            ) : (
              'Pide al gerente que la arme en Inventario.'
            )}
          </p>
        </div>
      ) : (
        <>
          <ul className="relative divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <Franja tono="pedidos" />
            {insumos.map((i, k) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5 pr-3 pl-5 sm:pr-4 sm:pl-6">
                <label htmlFor={`conteo-${i.id}`} className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{i.nombre}</span>
                  <span className="block text-xs text-muted-foreground">En {i.unidad}</span>
                </label>
                <input
                  id={`conteo-${i.id}`}
                  inputMode="decimal"
                  value={valores[k]}
                  onChange={(e) => setValores((v) => v.map((x, j) => (j === k ? e.target.value : x)))}
                  placeholder="0"
                  className="h-12 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right text-base tabular text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" disabled={pendiente || faltan > 0 || negativos} onClick={guardar}>
              {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Guardar conteo de {momento === 'apertura' ? 'apertura' : 'medio turno'}
            </Button>
            <p className="text-sm text-ink-2">
              {faltan > 0 ? `Faltan ${faltan} de ${insumos.length}. Si no hay, escribe 0.` : 'Todo contado.'}
            </p>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
