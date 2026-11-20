'use client';
import { useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, CircleAlert, Clock, History, LoaderCircle, PenLine, ReceiptText, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { nombreFirma, type PuntoDia, type SeccionDia } from '@/lib/franquiciatarios/dia';
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
 * Checklist de una sección del día de operación. Un punto por toque: «Sí» se guarda al tocarlo (o abre su dato si el
 * punto lo pide); «No» abre la observación (obligatoria) y se guarda con su botón. La hora la pone el servidor. Con la
 * sección firmada, la cuenta de baristas solo consulta; el gerente o el franquiciatario corrigen con motivo (queda el
 * registro anterior). Las rondas (puntos recurrentes) se registran cuantas veces haga falta y muestran la siguiente.
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
        {seccion.puntos.map((p) =>
          p.tipo === 'recurrente' ? (
            <Ronda
              key={p.id}
              companyId={companyId}
              seccion={seccion}
              punto={p}
              total={total}
              editable={editable}
            />
          ) : (
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
          ),
        )}
      </ol>
      {seccion.firmasRequeridas.length > 0 && (
        <Firmas companyId={companyId} seccion={seccion} quien={quien} editable={editable} gestor={gestor} />
      )}
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
  const [dato, setDato] = useState(r?.dato ?? '');
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
          ? corregir({
              companyId,
              respuesta: r.id,
              cumple,
              observacion: cumple ? null : obs,
              motivo,
              dato: cumple && punto.dato ? dato : null,
            })
          : responder({
              companyId,
              seccion: seccion.clave,
              punto: punto.id,
              cumple,
              observacion: cumple ? null : obs,
              motivo: pideMotivo ? motivo : null,
              dato: cumple && punto.dato ? dato : null,
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
    if (cumple && !pideMotivo && !punto.dato) {
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
  const datoValido = eleccion !== true || !punto.dato || dato.trim().length > 0;

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
          {punto.corte && <EnlaceCorte companyId={companyId} parcial={punto.corte === 'parcial'} />}
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

      {abierto && (eleccion === false || pideMotivo || punto.dato) && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {eleccion === true && punto.dato && (
            <CampoDato etiqueta={punto.dato} valor={dato} alCambiar={setDato} />
          )}
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
              disabled={pendiente || (eleccion === false && !obsValida) || !motivoValido || !datoValido}
              onClick={() => guardar(eleccion!)}
            >
              {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {eleccion === false ? 'Guardar «No»' : pideMotivo ? 'Guardar corrección' : 'Guardar «Sí»'}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                setEleccion(null);
                setError(null);
                setObs(r?.observacion ?? '');
                setDato(r?.dato ?? '');
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
          {r.cumple && r.dato && (
            <p className="text-sm text-ink-2">
              {punto.dato}: <span className="font-medium text-ink">{r.dato}</span>
            </p>
          )}
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

function CampoDato({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{etiqueta}</span>
      <input
        autoFocus
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        maxLength={200}
        className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
      />
    </label>
  );
}

/** Enlace del punto «Enviar corte» a la tira de venta del día (parcial a medio día). */
function EnlaceCorte({ companyId, parcial }: { companyId: number; parcial: boolean }) {
  return (
    <Link
      href={`/franquiciatarios/${companyId}/tira`}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-tira/40 bg-tira-soft px-2.5 py-1 text-sm font-semibold text-ink hover:border-tira focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45"
    >
      <ReceiptText size={14} aria-hidden="true" />
      {parcial ? 'Abrir la tira parcial de hoy' : 'Abrir la tira del día'}
    </Link>
  );
}

/**
 * Ronda (punto recurrente): se registra cada vez que se hace. Muestra la última, cuándo toca la siguiente y si está
 * atrasada (frecuencia + tolerancia). «Hubo un problema» pide la observación. Solo el día en curso.
 */
function Ronda({
  companyId,
  seccion,
  punto,
  total,
  editable,
}: {
  companyId: number;
  seccion: SeccionDia;
  punto: PuntoDia;
  total: number;
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState<boolean | null>(null); // true = registrar con dato; false = problema
  const [obs, setObs] = useState('');
  const [dato, setDato] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const id = useId();
  const ultima = punto.rondas.at(-1);
  const recientes = [...punto.rondas].reverse();

  const guardar = (cumple: boolean) => {
    setError(null);
    iniciar(async () => {
      const res = await intentar(() =>
        responder({
          companyId,
          seccion: seccion.clave,
          punto: punto.id,
          cumple,
          observacion: cumple ? null : obs,
          dato: cumple && punto.dato ? dato : null,
        }),
      );
      if ('error' in res) setError(res.error);
      else {
        setAbierto(null);
        setObs('');
        setDato('');
      }
    });
  };

  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-surface p-4 pl-5 shadow-card sm:p-5 sm:pl-6',
        punto.atrasada ? 'border-warn/50' : 'border-line',
      )}
    >
      <Franja tono={seccion.clave} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs tabular text-muted-foreground">
            {punto.orden} de {total} ·{' '}
            {punto.cada_min ? `cada ${frecuencia(punto.cada_min)}` : 'según demanda'}
          </p>
          <h3 id={`${id}-t`} className="mt-0.5 font-display text-[1.05rem] font-bold leading-snug text-ink">
            {punto.actividad}
          </h3>
          <p className="mt-1 text-sm text-ink-2">{punto.estandar}</p>
          <p
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              punto.atrasada ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-2',
            )}
          >
            <Clock size={13} aria-hidden="true" />
            {ultima ? `Última a las ${hora(ultima.registrado_en)}` : 'Sin registros hoy'}
            {punto.proxima &&
              (punto.atrasada
                ? ` · atrasada: tocaba a las ${hora(punto.proxima)}`
                : ` · siguiente a las ${hora(punto.proxima)}`)}
          </p>
        </div>
        {editable && (
          <div role="group" aria-labelledby={`${id}-t`} className="grid shrink-0 gap-2 sm:w-56">
            <Button
              size="lg"
              className="h-14 text-base"
              disabled={pendiente}
              onClick={() => (punto.dato ? setAbierto(true) : guardar(true))}
            >
              {pendiente && abierto === null ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Registrar ahora
            </Button>
            <Button size="lg" variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
              <X aria-hidden="true" /> Hubo un problema
            </Button>
          </div>
        )}
      </div>

      {abierto !== null && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {abierto && punto.dato ? (
            <CampoDato etiqueta={punto.dato} valor={dato} alCambiar={setDato} />
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-ink">Qué pasó (obligatorio)</span>
              <textarea
                autoFocus
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Qué faltó y a quién se avisó"
                className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              variant={abierto ? 'default' : 'destructive'}
              disabled={pendiente || (abierto ? !dato.trim() : obs.trim().length < 3)}
              onClick={() => guardar(abierto)}
            >
              {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {abierto ? 'Guardar registro' : 'Guardar problema'}
            </Button>
            <Button size="lg" variant="ghost" disabled={pendiente} onClick={() => setAbierto(null)}>
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

      {recientes.length > 0 && (
        <details className="mt-3 text-xs text-muted-foreground" open={recientes.length <= 3}>
          <summary className="inline-flex cursor-pointer items-center gap-1 rounded hover:text-ink">
            <History size={12} aria-hidden="true" /> {recientes.length}{' '}
            {recientes.length === 1 ? 'registro hoy' : 'registros hoy'}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {recientes.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="tabular font-semibold text-ink">{hora(x.registrado_en)}</span>
                <span className={x.cumple ? 'text-ok' : 'font-semibold text-bad'}>
                  {x.cumple ? 'Hecho' : 'Problema'}
                </span>
                <span>· {x.nombre}</span>
                {x.dato && <span className="text-ink-2">· {x.dato}</span>}
                {!x.cumple && x.observacion && <span className="text-ink-2">· «{x.observacion}»</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

const frecuencia = (min: number) =>
  min % 60 === 0 ? (min === 60 ? 'hora' : `${min / 60} horas`) : `${min} min`;

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
  gestor,
}: {
  companyId: number;
  seccion: SeccionDia;
  quien: string;
  editable: boolean;
  gestor: boolean;
}) {
  const faltan = seccion.puntos.filter((p) => p.tipo === 'unico' && !p.respuesta).length;
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
        {seccion.clave === 'cambio' || seccion.clave === 'medio'
          ? 'Firma primero quien entrega el turno y después quien lo recibe (otra persona).'
          : seccion.firmasRequeridas.includes('visto_bueno')
            ? 'Firma el barista que cierra; después el gerente da el visto bueno del día.'
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
            gestor={gestor}
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
  gestor,
}: {
  companyId: number;
  seccion: SeccionDia;
  tipo: TipoFirma;
  quien: string;
  faltan: number;
  editable: boolean;
  gestor: boolean;
}) {
  const hecha = seccion.firmas.find((f) => f.tipo === tipo);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const esperaEntrega = tipo === 'recibe' && !seccion.firmas.some((f) => f.tipo === 'entrega');
  const visto = tipo === 'visto_bueno';
  const esperaResponsable = visto && !seccion.firmas.some((f) => f.tipo === 'responsable');
  const etiqueta = nombreFirma(seccion.clave, tipo);

  if (hecha)
    return (
      <li className="rounded-xl border border-ok/30 bg-ok-soft px-4 py-3">
        <p className="text-xs font-semibold text-ok">{etiqueta}</p>
        <p className="mt-0.5 font-medium text-ink">{hecha.nombre}</p>
        <p className="text-xs text-ink-2">Firmó a las {hora(hecha.registrado_en)}</p>
      </li>
    );

  const motivo = !editable
    ? 'Sin firma ese día.'
    : visto && !gestor
      ? 'Lo da el gerente o el franquiciatario.'
      : esperaResponsable
        ? 'Primero firma el barista que cierra.'
        : !visto && faltan > 0
          ? `Faltan ${faltan} ${faltan === 1 ? 'punto' : 'puntos'} por responder.`
          : esperaEntrega
            ? 'Primero firma quien entrega.'
            : null;

  return (
    <li className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground">{etiqueta}</p>
      {motivo ? (
        <p className="mt-1 text-sm text-ink-2">{motivo}</p>
      ) : confirmar ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-ink">
            {visto ? 'Das el visto bueno' : 'Firmas'} como <strong>{quien}</strong>.{' '}
            {visto
              ? 'Confirma que revisaste el día completo.'
              : 'Después de firmar ya no se cambian las respuestas.'}
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
          <PenLine aria-hidden="true" /> {visto ? 'Dar visto bueno' : `Firmar como ${quien}`}
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
