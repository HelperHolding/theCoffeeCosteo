'use client';
import { useState, useTransition } from 'react';
import { CircleAlert, LoaderCircle, Pencil, Plus, Sparkles } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  guardarInsumo,
  sugerirInsumos,
  type Resultado,
} from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { FranqInsumo } from '@/lib/franquiciatarios/tipos';
import type { ColumnaConteo, FilaHistorial } from '@/lib/franquiciatarios/conteos';
import { diaCorto, hora } from './formato';

const SIN_RED = 'No se guardó: no hay conexión. Intenta de nuevo cuando vuelva la red.';
async function intentar(fn: () => Promise<Resultado>): Promise<Resultado> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: SIN_RED };
  try {
    return await fn();
  } catch {
    return { error: SIN_RED };
  }
}
const campo =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35';
const cantidad = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

/** Inventario de la sucursal (solo gerencia): lista de insumos a contar y el historial de conteos. */
export function InventarioFranq({
  companyId,
  insumos,
  columnas,
  filas,
}: {
  companyId: number;
  insumos: FranqInsumo[];
  columnas: ColumnaConteo[];
  filas: FilaHistorial[];
}) {
  const activos = insumos.filter((i) => i.activo).sort((a, b) => a.orden - b.orden);
  const inactivos = insumos.filter((i) => !i.activo);
  return (
    <div className="space-y-6">
      <section aria-labelledby="lista" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="lista" className="text-lg">
              Insumos a contar
            </h2>
            <p className="text-sm text-ink-2">
              Se cuentan en la apertura y a medio turno. La lista sugerida sale de las ventas (receta × ventas
              del último mes): los insumos que más pesan en lo consumido. Ajústala cuando haga falta.
            </p>
          </div>
        </div>
        {activos.length === 0 ? <Sugerir companyId={companyId} /> : null}
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {activos.map((i) => (
            <Insumo key={i.id} companyId={companyId} insumo={i} />
          ))}
          <NuevoInsumo companyId={companyId} />
        </ul>
        {inactivos.length > 0 && (
          <details className="text-sm text-ink-2">
            <summary className="cursor-pointer font-semibold">{inactivos.length} dados de baja</summary>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {inactivos.map((i) => (
                <Insumo key={i.id} companyId={companyId} insumo={i} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="historial" className="space-y-3">
        <h2 id="historial" className="text-lg">
          Conteos de los últimos 7 días
        </h2>
        {columnas.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-2 shadow-card">
            Todavía no hay conteos. Los baristas cuentan desde «Conteo» en la apertura y a medio turno.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted-foreground">
                  <th className="sticky left-0 bg-surface px-4 py-2 font-medium">Insumo</th>
                  {columnas.map((c) => (
                    <th
                      key={`${c.dia}-${c.momento}`}
                      className="px-3 py-2 text-right font-medium whitespace-nowrap"
                    >
                      <span className="block text-ink">{diaCorto(c.dia)}</span>
                      {c.momento === 'apertura' ? 'Apertura' : 'Medio'}
                      {c.registrado_en && <span className="block">{hora(c.registrado_en)}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filas.map((f) => (
                  <tr key={f.insumo.id} className={cn(!f.insumo.activo && 'text-muted-foreground')}>
                    <td className="sticky left-0 bg-surface px-4 py-2">
                      {f.insumo.nombre}
                      <span className="block text-xs text-muted-foreground">{f.insumo.unidad}</span>
                    </td>
                    {f.cantidades.map((q, k) => (
                      <td key={k} className="px-3 py-2 text-right tabular">
                        {q === null ? '—' : cantidad(q)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Sugerir({ companyId }: { companyId: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="rounded-2xl border border-pedidos/40 bg-linear-to-t from-pedidos/20 to-surface p-5 shadow-card">
      <p className="font-display font-bold">Arma la lista con la sugerencia de las ventas</p>
      <p className="mt-1 text-sm text-ink-2">
        Toma los insumos que juntan el 80 % de lo consumido el último mes (entre 10 y 20) y los ordena por
        peso. Después puedes agregar, renombrar o dar de baja.
      </p>
      <Button
        size="lg"
        className="mt-3"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            const r = await intentar(() => sugerirInsumos(companyId));
            if ('error' in r) setError(r.error);
          })
        }
      >
        {pendiente ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        Usar la lista sugerida
      </Button>
      {error && <Error texto={error} />}
    </div>
  );
}

function Insumo({ companyId, insumo }: { companyId: number; insumo: FranqInsumo }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(insumo.nombre);
  const [unidad, setUnidad] = useState(insumo.unidad);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const guardar = (activo: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await intentar(() =>
        guardarInsumo({ companyId, id: insumo.id, nombre, unidad, orden: insumo.orden, activo }),
      );
      if ('error' in r) setError(r.error);
      else setEditando(false);
    });
  return (
    <li className="px-4 py-3">
      {editando ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <label className="block text-sm font-medium text-ink">
            Nombre
            <input className={cn(campo, 'mt-1')} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Se cuenta en
            <input className={cn(campo, 'mt-1')} value={unidad} onChange={(e) => setUnidad(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button disabled={pendiente} onClick={() => guardar(insumo.activo)}>
              {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
            <Button variant="ghost" disabled={pendiente} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">{insumo.nombre}</span>
            <span className="block text-xs text-muted-foreground">
              En {insumo.unidad} · {insumo.origen === 'sugerido' ? 'sugerido por ventas' : 'agregado a mano'}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditando(true)}
            aria-label={`Editar ${insumo.nombre}`}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" disabled={pendiente} onClick={() => guardar(!insumo.activo)}>
            {insumo.activo ? 'Dar de baja' : 'Reactivar'}
          </Button>
        </div>
      )}
      {error && <Error texto={error} />}
    </li>
  );
}

function NuevoInsumo({ companyId }: { companyId: number }) {
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <li className="bg-surface-2/50 px-4 py-3">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            setError(null);
            const r = await intentar(() =>
              guardarInsumo({ companyId, id: null, nombre, unidad, orden: null, activo: true }),
            );
            if ('error' in r) setError(r.error);
            else {
              setNombre('');
              setUnidad('');
            }
          });
        }}
      >
        <label className="block text-sm font-medium text-ink">
          Agregar insumo
          <input
            className={cn(campo, 'mt-1')}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Hielo"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Se cuenta en
          <input
            className={cn(campo, 'mt-1')}
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            placeholder="Ej.: bolsa de 5 kg"
          />
        </label>
        <Button type="submit" disabled={pendiente || nombre.trim().length < 2 || !unidad.trim()}>
          {pendiente ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Agregar
        </Button>
      </form>
      {error && <Error texto={error} />}
    </li>
  );
}

function Error({ texto }: { texto: string }) {
  return (
    <p role="alert" className="mt-2 flex items-start gap-2 text-sm font-medium text-bad">
      <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  );
}
