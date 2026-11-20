'use client';
import { useState, useTransition } from 'react';
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plus,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  anularGasto,
  arquear,
  configurarCaja,
  registrarGasto,
  type Resultado,
} from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import { CATEGORIAS_GASTO } from '@/lib/franquiciatarios/caja';
import type { CajaDia } from '@/lib/franquiciatarios/caja-servidor';
import type { EstadoArqueo, MomentoArqueo } from '@/lib/franquiciatarios/tipos';
import { Franja } from './colores';
import { hora } from './formato';

const SIN_RED = 'No se guardó: no hay conexión. Lo capturado sigue aquí; reintenta cuando vuelva la red.';
async function intentar(fn: () => Promise<Resultado>): Promise<Resultado> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: SIN_RED };
  try {
    return await fn();
  } catch {
    return { error: SIN_RED };
  }
}
const pesos = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const numero = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/[$,\s]/g, '')));
const campo =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35';
const MOMENTOS: { clave: MomentoArqueo; nombre: string }[] = [
  { clave: 'medio', nombre: 'Medio turno' },
  { clave: 'cierre', nombre: 'Cierre' },
];
const NOMBRE_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_GASTO.map((c) => [c.clave, c.nombre]),
);

/**
 * Arqueo ciego: se cuenta el efectivo en caja y se captura sin ver lo esperado. Un recuento reemplaza al anterior del
 * mismo momento. Lo esperado y la diferencia solo los ve la gerencia.
 */
export function ArqueoCaptura({
  companyId,
  estados,
  editable,
}: {
  companyId: number;
  estados: EstadoArqueo[];
  editable: boolean;
}) {
  return (
    <section aria-labelledby="arqueo" className="space-y-3">
      <h2 id="arqueo" className="text-lg">
        Arqueo de caja
      </h2>
      <p className="text-sm text-ink-2">
        Cuenta todo el efectivo de la caja (fondo incluido) y escribe el total. No se muestra cuánto debería
        haber: así el conteo es limpio.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {MOMENTOS.map((m) => (
          <Arqueo
            key={m.clave}
            companyId={companyId}
            momento={m}
            estado={estados.find((e) => e.momento === m.clave)}
            editable={editable}
          />
        ))}
      </div>
    </section>
  );
}

function Arqueo({
  companyId,
  momento,
  estado,
  editable,
}: {
  companyId: number;
  momento: { clave: MomentoArqueo; nombre: string };
  estado?: EstadoArqueo;
  editable: boolean;
}) {
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const valor = numero(contado);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ventas/40 bg-linear-to-t from-ventas/20 via-ventas/5 to-surface p-4 pl-5 shadow-card sm:p-5 sm:pl-6">
      <Franja tono="ventas" />
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <Banknote size={17} aria-hidden="true" /> {momento.nombre}
        </h3>
        {estado ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            <CircleCheck size={13} aria-hidden="true" /> {estado.nombre} · {hora(estado.registrado_en)}
          </span>
        ) : (
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2">
            Sin arqueo
          </span>
        )}
      </div>
      {editable && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              setError(null);
              const r = await intentar(() =>
                arquear({ companyId, momento: momento.clave, contado: valor, observacion: obs }),
              );
              if ('error' in r) setError(r.error);
              else {
                setContado('');
                setObs('');
              }
            });
          }}
        >
          <label className="block text-sm font-medium text-ink">
            {estado ? 'Volver a contar: efectivo en caja' : 'Efectivo en caja'}
            <input
              inputMode="decimal"
              className={cn(campo, 'mt-1 h-12 text-right text-lg tabular')}
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              placeholder="$0.00"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Nota (opcional)
            <input
              className={cn(campo, 'mt-1')}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              maxLength={1000}
              placeholder="Ej.: se hizo un retiro de $1,000 al banco"
            />
          </label>
          <Button size="lg" disabled={pendiente || !Number.isFinite(valor) || valor < 0}>
            {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Guardar arqueo de {momento.nombre.toLowerCase()}
          </Button>
          {error && <Aviso texto={error} />}
        </form>
      )}
    </div>
  );
}

/** Solo gerencia: contado contra esperado de cada arqueo del día. */
export function ResumenCaja({ caja }: { caja: CajaDia }) {
  return (
    <section aria-labelledby="resumen-caja" className="space-y-3">
      <h2 id="resumen-caja" className="text-lg">
        Cuadre del día
      </h2>
      {!caja.config && (
        <p className="aviso">
          Configura el fondo de caja (abajo) para que el esperado sea correcto; hoy se toma $0.
        </p>
      )}
      {!caja.posOk && (
        <p className="aviso">
          No se pudieron leer las ventas del POS: se muestra lo contado sin el esperado.
        </p>
      )}
      {caja.arqueos.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2 shadow-card">
          Aún no hay arqueos este día.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Arqueo</th>
                <th className="px-3 py-2 text-right font-medium">Fondo</th>
                <th className="px-3 py-2 text-right font-medium">Efectivo POS</th>
                <th className="px-3 py-2 text-right font-medium">Gastos</th>
                <th className="px-3 py-2 text-right font-medium">Esperado</th>
                <th className="px-3 py-2 text-right font-medium">Contado</th>
                <th className="px-4 py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {caja.arqueos.map(({ momento, arqueo, resumen }) => (
                <tr key={arqueo.id}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{momento === 'medio' ? 'Medio turno' : 'Cierre'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {arqueo.nombre} · {hora(arqueo.registrado_en)}
                      {arqueo.corrige_id !== null && ' · recontado'}
                    </span>
                    {arqueo.observacion && (
                      <span className="block text-xs text-ink-2">«{arqueo.observacion}»</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{resumen ? pesos(resumen.fondo) : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {resumen ? pesos(resumen.efectivoPos) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {resumen ? `−${pesos(resumen.gastos)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">
                    {resumen ? pesos(resumen.esperado) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular">{pesos(arqueo.contado)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {resumen ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular',
                          resumen.fuera ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok',
                        )}
                      >
                        {resumen.fuera && <TriangleAlert size={12} aria-hidden="true" />}
                        {resumen.diferencia > 0 ? '+' : ''}
                        {pesos(resumen.diferencia)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Solo gerencia: gastos de caja chica del día, alta y anulación con motivo. */
export function CajaChica({
  companyId,
  caja,
  editable,
}: {
  companyId: number;
  caja: CajaDia;
  editable: boolean;
}) {
  const anulados = new Map(caja.gastos.filter((g) => g.anula_id !== null).map((g) => [g.anula_id!, g]));
  const gastos = caja.gastos.filter((g) => g.anula_id === null);
  return (
    <section aria-labelledby="caja-chica" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="caja-chica" className="text-lg">
          Caja chica
        </h2>
        <p className="text-sm text-ink-2">
          Gastos vigentes del día:{' '}
          <span className="font-semibold text-ink tabular">{pesos(caja.totalGastos)}</span>
        </p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {gastos.length === 0 && <li className="px-4 py-3 text-sm text-ink-2">Sin gastos este día.</li>}
        {gastos.map((g) => (
          <Gasto
            key={g.id}
            companyId={companyId}
            gasto={g}
            anulacion={anulados.get(g.id)}
            editable={editable}
          />
        ))}
        {editable && <NuevoGasto companyId={companyId} />}
      </ul>
    </section>
  );
}

function Gasto({
  companyId,
  gasto,
  anulacion,
  editable,
}: {
  companyId: number;
  gasto: CajaDia['gastos'][number];
  anulacion?: CajaDia['gastos'][number];
  editable: boolean;
}) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <li className={cn('px-4 py-3', anulacion && 'text-muted-foreground')}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="min-w-0 flex-1">
          <span
            className={cn('block font-medium text-ink', anulacion && 'line-through text-muted-foreground')}
          >
            {gasto.concepto}
          </span>
          <span className="block text-xs text-muted-foreground">
            {NOMBRE_CATEGORIA[gasto.categoria ?? ''] ?? gasto.categoria} ·{' '}
            {gasto.en_efectivo ? 'efectivo de caja' : 'otro medio'}
            {' · '}
            {gasto.comprobante ? 'con comprobante' : 'sin comprobante'} · {gasto.nombre} ·{' '}
            {hora(gasto.registrado_en)}
          </span>
          {gasto.nota && <span className="block text-xs text-ink-2">«{gasto.nota}»</span>}
          {anulacion && (
            <span className="block text-xs font-semibold text-bad">
              Anulado por {anulacion.nombre}: «{anulacion.nota}»
            </span>
          )}
        </span>
        <span className={cn('font-semibold tabular', anulacion && 'line-through')}>
          {pesos(Number(gasto.monto ?? 0))}
        </span>
        {editable && !anulacion && !anulando && (
          <Button variant="ghost" size="sm" onClick={() => setAnulando(true)}>
            Anular
          </Button>
        )}
      </div>
      {anulando && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className={cn(campo, 'flex-1')}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se anula"
            aria-label="Motivo de la anulación"
          />
          <Button
            variant="destructive"
            disabled={pendiente || motivo.trim().length < 3}
            onClick={() =>
              iniciar(async () => {
                setError(null);
                const r = await intentar(() => anularGasto(companyId, gasto.id, motivo));
                if ('error' in r) setError(r.error);
                else setAnulando(false);
              })
            }
          >
            {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Anular gasto
          </Button>
          <Button variant="ghost" disabled={pendiente} onClick={() => setAnulando(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {error && <Aviso texto={error} />}
    </li>
  );
}

function NuevoGasto({ companyId }: { companyId: number }) {
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState<string>('insumos');
  const [monto, setMonto] = useState('');
  const [enEfectivo, setEnEfectivo] = useState(true);
  const [comprobante, setComprobante] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const valor = numero(monto);
  return (
    <li className="bg-surface-2/50 px-4 py-3">
      <form
        className="grid gap-2 md:grid-cols-[1fr_10rem_8rem] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            setError(null);
            const r = await intentar(() =>
              registrarGasto({ companyId, concepto, categoria, monto: valor, enEfectivo, comprobante }),
            );
            if ('error' in r) setError(r.error);
            else {
              setConcepto('');
              setMonto('');
              setComprobante(false);
            }
          });
        }}
      >
        <label className="block text-sm font-medium text-ink">
          Nuevo gasto
          <input
            className={cn(campo, 'mt-1')}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej.: 2 bolsas de hielo"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Categoría
          <select
            className={cn(campo, 'mt-1')}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Monto
          <input
            inputMode="decimal"
            className={cn(campo, 'mt-1 text-right tabular')}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="$0.00"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enEfectivo} onChange={(e) => setEnEfectivo(e.target.checked)} />
            Se pagó con efectivo de la caja
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={comprobante} onChange={(e) => setComprobante(e.target.checked)} />
            Hay comprobante
          </label>
          <Button
            type="submit"
            className="ml-auto"
            disabled={pendiente || concepto.trim().length < 3 || !Number.isFinite(valor) || valor <= 0}
          >
            {pendiente ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Registrar gasto
          </Button>
        </div>
      </form>
      {error && <Aviso texto={error} />}
    </li>
  );
}

/** Solo gerencia: fondo de caja y tolerancia de la diferencia. */
export function ConfigCaja({ companyId, caja }: { companyId: number; caja: CajaDia }) {
  const [fondo, setFondo] = useState(String(caja.config?.fondo ?? ''));
  const [tolerancia, setTolerancia] = useState(String(caja.config?.tolerancia ?? 20));
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  return (
    <section
      aria-labelledby="config-caja"
      className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <h2 id="config-caja" className="flex items-center gap-2 text-base font-bold">
        <Settings2 size={16} aria-hidden="true" /> Fondo y tolerancia
      </h2>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[12rem_12rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            setError(null);
            setListo(false);
            const r = await intentar(() => configurarCaja(companyId, numero(fondo), numero(tolerancia)));
            if ('error' in r) setError(r.error);
            else setListo(true);
          });
        }}
      >
        <label className="block text-sm font-medium text-ink">
          Fondo de caja
          <input
            inputMode="decimal"
            className={cn(campo, 'mt-1 text-right tabular')}
            value={fondo}
            onChange={(e) => setFondo(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Diferencia tolerada
          <input
            inputMode="decimal"
            className={cn(campo, 'mt-1 text-right tabular')}
            value={tolerancia}
            onChange={(e) => setTolerancia(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={pendiente}>
          {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Guardar
        </Button>
      </form>
      {listo && <p className="mt-2 text-sm text-ok">Guardado.</p>}
      {error && <Aviso texto={error} />}
    </section>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p role="alert" className="mt-2 flex items-start gap-2 text-sm font-medium text-bad">
      <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  );
}
