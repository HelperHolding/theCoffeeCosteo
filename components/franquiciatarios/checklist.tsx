'use client';
import { useId, useRef, useState, useTransition } from 'react';
import { Check, CircleAlert, History, LoaderCircle, PenLine, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { NOMBRE_FIRMA, type PuntoDia, type SeccionDia } from '@/lib/franquiciatarios/dia';
import type { TipoFirma } from '@/lib/franquiciatarios/tipos';
import {
  corregir,
  firmar,
  responder,
  type Resultado,
} from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import { hora } from './formato';
import { Franja, ICONO_SECCION, TONO } from './colores';

const SIN_RED =
  'No se guardó: no hay conexión. Lo que escribiste sigue aquí; reintenta cuando vuelva la red.';

/** Llama una acción del servidor sin perder lo capturado si falla la red. */
async function intentar(fn: () => Promise<Resultado>): Promise<Resultado> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: SIN_RED };
  try {
    return await fn();
  } catch {
    return { error: SIN_RED };
  }
}

/**
 * Checklist de una sección del día de operación. Un punto por toque: «Sí» se guarda al tocarlo; «No» abre la
 * observación (obligatoria) y se guarda con su botón. La hora la pone el servidor. Con la sección firmada, la cuenta
 * de baristas solo consulta; el gerente o el franquiciatario corrigen con motivo (queda el registro anterior).
 */
export function Checklist({
  companyId,
  seccion,
  quien,
  gestor,
  editable,
}: {
  companyId: number;
  seccion: SeccionDia;
  /** Nombre con el que se registra (el declarado en la cuenta de baristas, o el del perfil). */
  quien: string;
  gestor: boolean;
  /** false en días anteriores: la cuenta de baristas solo consulta; el gestor corrige con motivo lo ya respondido. */
  editable: boolean;
}) {
  const total = seccion.puntos.length;
  const bloqueada = seccion.firmada && !gestor;
  const pasado = !editable && gestor;
  return (
    <section aria-labelledby={`sec-${seccion.clave}`} className="space-y-4">
      <Avance seccion={seccion} />
      {bloqueada && editable && (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
          La {seccion.nombre.toLowerCase()} ya está firmada. Si algo cambió, avisa al gerente para que
          registre la corrección.
        </p>
      )}
      <ol className="space-y-3" aria-label={`Puntos de ${seccion.nombre}`}>
        {seccion.puntos.map((p) => (
          <Punto
            key={p.id}
            companyId={companyId}
            seccion={seccion}
            punto={p}
            total={total}
            editable={(editable && !bloqueada) || (pasado && p.respuesta !== null)}
            pideMotivo={seccion.firmada || pasado}
            pasado={pasado}
          />
        ))}
      </ol>
      <Firmas companyId={companyId} seccion={seccion} quien={quien} editable={editable} />
    </section>
  );
}

function Avance({ seccion }: { seccion: SeccionDia }) {
  const total = seccion.puntos.length;
  const pct = total ? Math.round((seccion.respondidos / total) * 100) : 0;
  const t = TONO[seccion.clave];
  const Icono = ICONO_SECCION[seccion.clave];
  return (
    <div className="sticky top-16 z-10 -mx-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`sec-${seccion.clave}`} className="flex items-center gap-2.5 text-lg">
          <span className={cn('grid size-8 place-items-center rounded-lg text-primary-foreground', t.marca)}>
            <Icono size={16} aria-hidden="true" />
          </span>
          {seccion.nombre}
        </h2>
        <p className="text-sm tabular text-ink-2">
          <span className="font-semibold text-ink">{seccion.respondidos}</span> de {total}
          {seccion.noes > 0 && <span className="ml-2 font-semibold text-bad">· {seccion.noes} en «No»</span>}
        </p>
      </div>
      <div
        className={cn('mt-2 h-2 overflow-hidden rounded-full', t.suave)}
        role="progressbar"
        aria-label={`Avance de ${seccion.nombre}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={seccion.respondidos}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            seccion.estado === 'completa' ? 'bg-ok' : t.marca,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Punto({
  companyId,
  seccion,
  punto,
  total,
  editable,
  pideMotivo,
  pasado,
}: {
  companyId: number;
  seccion: SeccionDia;
  punto: PuntoDia;
  total: number;
  editable: boolean;
  pideMotivo: boolean;
  /** Día anterior: la corrección va contra el registro vigente (franq_corregir), no contra el día de hoy. */
  pasado: boolean;
}) {
  const r = punto.respuesta;
  const [eleccion, setEleccion] = useState<boolean | null>(null); // elección local aún sin guardar
  const [obs, setObs] = useState(r?.observacion ?? '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const obsRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const valor = eleccion ?? r?.cumple ?? null;
  const abierto = eleccion !== null; // hay algo por confirmar (un «No» o una corrección con motivo)

  const guardar = (cumple: boolean) => {
    setError(null);
    iniciar(async () => {
      const res = await intentar(() =>
        pasado && r
          ? corregir({ companyId, respuesta: r.id, cumple, observacion: cumple ? null : obs, motivo })
          : responder({
              companyId,
              seccion: seccion.clave,
              punto: punto.id,
              cumple,
              observacion: cumple ? null : obs,
              motivo: pideMotivo ? motivo : null,
            }),
      );
      if ('error' in res) setError(res.error);
      else {
        setEleccion(null);
        setMotivo('');
      }
    });
  };

  const tocar = (cumple: boolean) => {
    if (!editable || pendiente) return;
    if (cumple && !pideMotivo) {
      if (r?.cumple === true) return;
      setEleccion(true);
      guardar(true);
      return;
    }
    setEleccion(cumple);
    if (!cumple) requestAnimationFrame(() => obsRef.current?.focus());
  };

  const obsValida = obs.trim().length >= 3;
  const motivoValido = !pideMotivo || motivo.trim().length >= 3;

  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4 pl-5 shadow-card transition-colors sm:p-5 sm:pl-6',
        valor === false
          ? 'border-bad/40 bg-bad-soft/60'
          : valor === true
            ? 'border-ok/30 bg-surface'
            : 'border-line bg-surface',
      )}
    >
      <Franja tono={seccion.clave} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs tabular text-muted-foreground">
            {punto.orden} de {total}
          </p>
          <h3 id={`${id}-t`} className="mt-0.5 font-display text-[1.05rem] font-bold leading-snug text-ink">
            {punto.actividad}
          </h3>
          <p className="mt-1 text-sm text-ink-2">{punto.estandar}</p>
        </div>
        <div role="group" aria-labelledby={`${id}-t`} className="grid shrink-0 grid-cols-2 gap-2 sm:w-56">
          <BotonRespuesta
            cumple
            activo={valor === true}
            onClick={() => tocar(true)}
            deshabilitado={!editable || pendiente}
            cargando={pendiente && eleccion === true}
          />
          <BotonRespuesta
            cumple={false}
            activo={valor === false}
            onClick={() => tocar(false)}
            deshabilitado={!editable || pendiente}
            cargando={pendiente && eleccion === false}
          />
        </div>
      </div>

      {abierto && (eleccion === false || pideMotivo) && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {eleccion === false && (
            <label className="block">
              <span className="text-sm font-medium text-ink">Observaciones (obligatorio en un «No»)</span>
              <textarea
                ref={obsRef}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Qué pasó y a quién se avisó"
                className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
              />
            </label>
          )}
          {pideMotivo && (
            <label className="block">
              <span className="text-sm font-medium text-ink">Motivo de la corrección</span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
                placeholder="Por qué cambia lo ya firmado"
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              variant={eleccion === false ? 'destructive' : 'default'}
              disabled={pendiente || (eleccion === false && !obsValida) || !motivoValido}
              onClick={() => guardar(eleccion!)}
            >
              {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {eleccion === false ? 'Guardar «No»' : 'Guardar corrección'}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                setEleccion(null);
                setError(null);
                setObs(r?.observacion ?? '');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-bad">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {r && !abierto && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {!r.cumple && r.observacion && <p className="text-sm text-ink-2">«{r.observacion}»</p>}
          <p>
            {r.nombre} · {hora(r.registrado_en)}
            {r.corrige_id !== null && ' · cambió una respuesta anterior'}
            {r.motivo && ` · motivo: ${r.motivo}`}
          </p>
          {punto.anteriores.length > 0 && (
            <details className="group">
              <summary className="inline-flex cursor-pointer items-center gap-1 rounded hover:text-ink">
                <History size={12} aria-hidden="true" /> {punto.anteriores.length} registro
                {punto.anteriores.length === 1 ? '' : 's'} anterior{punto.anteriores.length === 1 ? '' : 'es'}
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {punto.anteriores.map((a) => (
                  <li key={a.id}>
                    {a.cumple ? 'Sí' : 'No'}
                    {a.observacion ? ` («${a.observacion}»)` : ''} · {a.nombre} · {hora(a.registrado_en)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

function BotonRespuesta({
  cumple,
  activo,
  onClick,
  deshabilitado,
  cargando,
}: {
  cumple: boolean;
  activo: boolean;
  onClick: () => void;
  deshabilitado: boolean;
  cargando: boolean;
}) {
  const Icono = cargando ? LoaderCircle : cumple ? Check : X;
  return (
    <button
      type="button"
      aria-pressed={activo}
      disabled={deshabilitado && !activo}
      aria-disabled={deshabilitado}
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-base font-bold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45',
        activo
          ? cumple
            ? 'border-ok bg-ok text-white'
            : 'border-bad bg-bad text-white'
          : 'border-line-strong bg-surface text-ink hover:border-ink/40',
        deshabilitado && !activo && 'opacity-45',
        deshabilitado && 'cursor-default',
      )}
    >
      <Icono size={20} aria-hidden="true" className={cargando ? 'animate-spin' : undefined} />
      {cumple ? 'Sí' : 'No'}
    </button>
  );
}

function Firmas({
  companyId,
  seccion,
  quien,
  editable,
}: {
  companyId: number;
  seccion: SeccionDia;
  quien: string;
  editable: boolean;
}) {
  const faltan = seccion.puntos.length - seccion.respondidos;
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-card sm:p-5',
        TONO[seccion.clave].brillo,
        TONO[seccion.clave].borde,
      )}
    >
      <h3 className="flex items-center gap-2 font-display text-base font-bold">
        <PenLine size={16} aria-hidden="true" /> Firmas de {seccion.nombre.toLowerCase()}
      </h3>
      <p className="mt-1 text-sm text-ink-2">
        {seccion.clave === 'cambio'
          ? 'Firma primero quien entrega el turno y después quien lo recibe (otra persona).'
          : `Firma el responsable de ${seccion.nombre.toLowerCase()} al terminar; queda la hora de término.`}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {seccion.firmasRequeridas.map((t) => (
          <Firma
            key={t}
            companyId={companyId}
            seccion={seccion}
            tipo={t}
            quien={quien}
            faltan={faltan}
            editable={editable}
          />
        ))}
      </ul>
    </div>
  );
}

function Firma({
  companyId,
  seccion,
  tipo,
  quien,
  faltan,
  editable,
}: {
  companyId: number;
  seccion: SeccionDia;
  tipo: TipoFirma;
  quien: string;
  faltan: number;
  editable: boolean;
}) {
  const hecha = seccion.firmas.find((f) => f.tipo === tipo);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const esperaEntrega = tipo === 'recibe' && !seccion.firmas.some((f) => f.tipo === 'entrega');

  if (hecha)
    return (
      <li className="rounded-xl border border-ok/30 bg-ok-soft px-4 py-3">
        <p className="text-xs font-semibold text-ok">{NOMBRE_FIRMA[tipo]}</p>
        <p className="mt-0.5 font-medium text-ink">{hecha.nombre}</p>
        <p className="text-xs text-ink-2">Firmó a las {hora(hecha.registrado_en)}</p>
      </li>
    );

  const motivo = !editable
    ? 'Sin firma ese día.'
    : faltan > 0
      ? `Faltan ${faltan} ${faltan === 1 ? 'punto' : 'puntos'} por responder.`
      : esperaEntrega
        ? 'Primero firma quien entrega.'
        : null;

  return (
    <li className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground">{NOMBRE_FIRMA[tipo]}</p>
      {motivo ? (
        <p className="mt-1 text-sm text-ink-2">{motivo}</p>
      ) : confirmar ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-ink">
            Firmas como <strong>{quien}</strong>. Después de firmar ya no se cambian las respuestas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  setError(null);
                  const r = await intentar(() => firmar(companyId, seccion.clave, tipo));
                  if ('error' in r) setError(r.error);
                  else setConfirmar(false);
                })
              }
            >
              {pendiente ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <PenLine aria-hidden="true" />
              )}
              Confirmar firma
            </Button>
            <Button variant="ghost" disabled={pendiente} onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="mt-2 w-full" onClick={() => setConfirmar(true)}>
          <PenLine aria-hidden="true" /> Firmar como {quien}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </li>
  );
}
