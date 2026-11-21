'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Bike,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coffee,
  Copy,
  Croissant,
  CupSoda,
  LoaderCircle,
  MoonStar,
  Plus,
  Store,
  Sun,
  Sunrise,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  asignar,
  copiarSemana,
  guardarPosicion,
  guardarTurno,
  rolesBase,
  type Resultado,
} from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import { horaCorta, type DiaRoles, type SemanaRoles } from '@/lib/franquiciatarios/roles';
import { sumarDias } from '@/lib/franquiciatarios/dia';
import type { FranqBarista, FranqPosicion, FranqTurno } from '@/lib/franquiciatarios/tipos';
import { Vacio } from '@/components/portal/piezas';
import { TONO, type Tono } from './colores';
import { diaCorto } from './formato';

const campo =
  'h-9 rounded-[10px] border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35';
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Color e ícono del turno por la hora de entrada: mañana ámbar, tarde azul, noche morado. */
function estiloTurno(t: FranqTurno): { tono: Tono; icono: LucideIcon } {
  const h = Number(t.entrada.slice(0, 2));
  if (h < 12) return { tono: 'apertura', icono: Sunrise };
  if (h < 18) return { tono: 'cierre', icono: Sun };
  return { tono: 'cambio', icono: MoonStar };
}
/** Ícono de la posición por su nombre (lista base; cualquier otra lleva una persona). */
function iconoPosicion(p: FranqPosicion): LucideIcon {
  const n = p.nombre.toLocaleLowerCase('es-MX');
  if (/caja|mostrador/.test(n)) return Store;
  if (/fr[ií]a/.test(n)) return CupSoda;
  if (/caliente|barra|espresso|m[eé]todo/.test(n)) return Coffee;
  if (/aliment|cocina|pan/.test(n)) return Croissant;
  if (/rappi|delivery|domicilio/.test(n)) return Bike;
  return UserRound;
}

function useAccion() {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (fn: () => Promise<Resultado>) =>
    iniciar(async () => {
      setError(null);
      let r: Resultado;
      try {
        r = await fn();
      } catch {
        r = { error: 'No se guardó: no hay conexión.' };
      }
      if ('error' in r) setError(r.error);
    });
  return { error, pendiente, correr };
}

function Fallo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-bad">
      <CircleAlert size={14} aria-hidden="true" /> {texto}
    </p>
  );
}

/** Matriz de la semana para la gerencia: elige el día y asigna por turno y posición. */
export function RolesGestor({
  companyId,
  semana,
  baristas,
  hoy,
}: {
  companyId: number;
  semana: SemanaRoles;
  baristas: FranqBarista[];
  hoy: string;
}) {
  const a = useAccion();
  const enSemana = semana.dias.some((d) => d.dia === hoy);
  const [dia, setDia] = useState(enSemana ? hoy : semana.lunes);
  const base = `/franquiciatarios/${companyId}/roles`;
  if (!semana.turnos.length || !semana.posiciones.length)
    return (
      <div className="space-y-3">
        <Vacio titulo="Sin posiciones ni turnos">
          Arranca con la lista base: Caja/Mostrador, Barra caliente, Barra fría, Alimentos y Rappi/Delivery, y
          los turnos matutino (7:00–15:00) y vespertino (15:00–22:00). Después los ajustas.
        </Vacio>
        <Button onClick={() => a.correr(() => rolesBase(companyId))} disabled={a.pendiente}>
          {a.pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Crear la lista base
        </Button>
        <Fallo texto={a.error} />
      </div>
    );
  const activos = baristas.filter((b) => b.activo);
  const d = semana.dias.find((x) => x.dia === dia) ?? semana.dias[0];
  const vacios = semana.dias.filter((x) => !x.asignados).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="grid size-9 place-items-center rounded-full border border-line-strong hover:bg-surface-2"
          href={`${base}?semana=${sumarDias(semana.lunes, -7)}`}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </Link>
        <p className="font-display text-lg font-bold">
          {diaCorto(semana.lunes)} – {diaCorto(sumarDias(semana.lunes, 6))}
        </p>
        <Link
          className="grid size-9 place-items-center rounded-full border border-line-strong hover:bg-surface-2"
          href={`${base}?semana=${sumarDias(semana.lunes, 7)}`}
          aria-label="Semana siguiente"
        >
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
        {vacios > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={a.pendiente}
            onClick={() => a.correr(() => copiarSemana(companyId, semana.lunes))}
          >
            {a.pendiente ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            Copiar la semana anterior ({vacios} {vacios === 1 ? 'día vacío' : 'días vacíos'})
          </Button>
        )}
      </div>
      <Fallo texto={a.error} />

      <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Día">
        {semana.dias.map((x, i) => {
          const activo = x.dia === d.dia;
          return (
            <button
              key={x.dia}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setDia(x.dia)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 transition-colors',
                activo ? 'border-ink bg-ink text-surface' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <span className={cn('text-[11px] font-semibold', !activo && 'text-ink-2')}>
                {DIAS_CORTOS[i]}
              </span>
              <span className="font-display text-lg leading-none font-black">{Number(x.dia.slice(8))}</span>
              <span
                className={cn(
                  'mt-0.5 rounded-full px-1.5 text-[10px] font-bold',
                  activo ? 'bg-surface/20' : x.asignados ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn',
                )}
              >
                {x.dia === hoy ? 'hoy' : x.asignados ? x.asignados : 'vacío'}
              </span>
            </button>
          );
        })}
      </div>

      {!activos.length && (
        <p className="aviso">Da de alta a los baristas en «Baristas» para poder asignarlos.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {semana.turnos.map((t) => (
          <TurnoCard
            key={t.id}
            turno={t}
            semana={semana}
            d={d}
            editable={d.dia >= sumarDias(hoy, -7)}
            companyId={companyId}
            baristas={activos}
          />
        ))}
      </div>
      <Catalogo companyId={companyId} semana={semana} />
    </div>
  );
}

function TurnoCard({
  turno: t,
  semana,
  d,
  editable,
  companyId,
  baristas,
}: {
  turno: FranqTurno;
  semana: SemanaRoles;
  d: DiaRoles;
  editable?: boolean;
  companyId?: number;
  baristas?: FranqBarista[];
}) {
  const a = useAccion();
  const e = estiloTurno(t);
  const tono = TONO[e.tono];
  const Icono = e.icono;
  const gente = new Set(
    d.celdas.filter((c) => c.turnoId === t.id).flatMap((c) => c.baristas.map((b) => b.id)),
  ).size;
  return (
    <section
      aria-label={`${t.nombre} ${horaCorta(t.entrada)} a ${horaCorta(t.salida)}`}
      className={cn('overflow-hidden rounded-3xl border shadow-card', tono.brillo, tono.borde)}
    >
      <header className="flex items-center gap-3 px-5 pt-4 pb-3">
        <span
          className={cn('grid size-11 place-items-center rounded-2xl text-primary-foreground', tono.marca)}
        >
          <Icono size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg leading-tight font-bold">{t.nombre}</span>
          <span className="text-sm text-ink-2 tabular">
            {horaCorta(t.entrada)} – {horaCorta(t.salida)}
          </span>
        </span>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', tono.suave)}>
          {gente} {gente === 1 ? 'persona' : 'personas'}
        </span>
      </header>
      <ul className="space-y-1.5 px-3 pb-3">
        {semana.posiciones.map((p) => {
          const c = d.celdas.find((x) => x.turnoId === t.id && x.posicionId === p.id)!;
          const libres = (baristas ?? []).filter((b) => !c.baristas.some((x) => x.id === b.id));
          const IconoP = iconoPosicion(p);
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface/85 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2">
                <IconoP size={16} aria-hidden="true" className={tono.texto} />
              </span>
              <span className="w-24 shrink-0 text-sm leading-tight font-semibold sm:w-28">{p.nombre}</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                {c.baristas.map((b) => (
                  <span
                    key={b.id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full py-1 pl-2.5 text-sm font-semibold',
                      tono.suave,
                      editable ? 'pr-1' : 'pr-2.5',
                    )}
                  >
                    {b.nombre.split(' ')[0]}
                    {editable && companyId && (
                      <button
                        type="button"
                        aria-label={`Quitar a ${b.nombre} de ${p.nombre}, ${t.nombre}`}
                        disabled={a.pendiente}
                        onClick={() =>
                          a.correr(() =>
                            asignar({
                              companyId,
                              dia: d.dia,
                              turno: t.id,
                              posicion: p.id,
                              barista: b.id,
                              quitar: true,
                            }),
                          )
                        }
                        className="grid size-5 place-items-center rounded-full hover:bg-surface"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
                {!c.baristas.length && !editable && <span className="text-sm text-ink-2">Sin asignar</span>}
                {editable && companyId && libres.length > 0 && (
                  <select
                    aria-label={`Agregar barista a ${p.nombre}, ${t.nombre}`}
                    className={cn(
                      campo,
                      'h-8 w-auto max-w-32 rounded-full border-dashed py-0 text-xs leading-none',
                    )}
                    value=""
                    disabled={a.pendiente}
                    onChange={(ev) => {
                      const id = Number(ev.target.value);
                      if (id)
                        a.correr(() =>
                          asignar({
                            companyId,
                            dia: d.dia,
                            turno: t.id,
                            posicion: p.id,
                            barista: id,
                            quitar: false,
                          }),
                        );
                    }}
                  >
                    <option value="">+ Asignar</option>
                    {libres.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {a.error && (
        <div className="px-5 pb-3">
          <Fallo texto={a.error} />
        </div>
      )}
    </section>
  );
}

/** Posiciones y turnos: agregar, desactivar y volver a activar. */
function Catalogo({ companyId, semana }: { companyId: number; semana: SemanaRoles }) {
  const a = useAccion();
  const [posicion, setPosicion] = useState('');
  const [turno, setTurno] = useState({ nombre: '', entrada: '', salida: '' });
  return (
    <details className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <summary className="cursor-pointer font-display font-bold">Ajustar posiciones y turnos</summary>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-2">Posiciones de la barra</h3>
          <ul className="flex flex-wrap gap-2">
            {semana.posiciones.map((p) => {
              const Icono = iconoPosicion(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={a.pendiente}
                    title={p.activo ? 'Desactivar' : 'Activar'}
                    onClick={() =>
                      a.correr(() =>
                        guardarPosicion({ companyId, id: p.id, nombre: p.nombre, activo: !p.activo }),
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
                      p.activo ? 'border-line-strong' : 'border-dashed border-line text-ink-2 line-through',
                    )}
                  >
                    <Icono size={14} aria-hidden="true" /> {p.nombre}
                    {p.activo ? <X size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              a.correr(async () => {
                const r = await guardarPosicion({ companyId, id: null, nombre: posicion, activo: true });
                if ('ok' in r) setPosicion('');
                return r;
              });
            }}
          >
            <input
              aria-label="Nueva posición"
              className={cn(campo, 'min-w-0 flex-1')}
              value={posicion}
              onChange={(e) => setPosicion(e.target.value)}
              placeholder="Nueva posición"
            />
            <Button type="submit" size="sm" disabled={a.pendiente || posicion.trim().length < 2}>
              <Plus aria-hidden="true" /> Agregar
            </Button>
          </form>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-2">Turnos</h3>
          <ul className="space-y-2">
            {semana.turnos.map((t) => {
              const e = estiloTurno(t);
              const Icono = e.icono;
              return (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className={cn('grid size-7 place-items-center rounded-lg', TONO[e.tono].suave)}>
                    <Icono size={14} aria-hidden="true" className={TONO[e.tono].texto} />
                  </span>
                  <span className={cn('flex-1', !t.activo && 'text-ink-2 line-through')}>
                    {t.nombre} · {horaCorta(t.entrada)}–{horaCorta(t.salida)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.pendiente}
                    onClick={() =>
                      a.correr(() =>
                        guardarTurno({
                          companyId,
                          id: t.id,
                          nombre: t.nombre,
                          entrada: t.entrada.slice(0, 5),
                          salida: t.salida.slice(0, 5),
                          activo: !t.activo,
                        }),
                      )
                    }
                  >
                    {t.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </li>
              );
            })}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              a.correr(async () => {
                const r = await guardarTurno({ companyId, id: null, ...turno, activo: true });
                if ('ok' in r) setTurno({ nombre: '', entrada: '', salida: '' });
                return r;
              });
            }}
          >
            <input
              aria-label="Nombre del turno"
              className={cn(campo, 'min-w-0 flex-1 basis-32')}
              value={turno.nombre}
              onChange={(e) => setTurno({ ...turno, nombre: e.target.value })}
              placeholder="Nuevo turno"
            />
            <input
              aria-label="Entrada"
              type="time"
              className={campo}
              value={turno.entrada}
              onChange={(e) => setTurno({ ...turno, entrada: e.target.value })}
            />
            <input
              aria-label="Salida"
              type="time"
              className={campo}
              value={turno.salida}
              onChange={(e) => setTurno({ ...turno, salida: e.target.value })}
            />
            <Button type="submit" size="sm" disabled={a.pendiente || turno.nombre.trim().length < 2}>
              <Plus aria-hidden="true" /> Agregar
            </Button>
          </form>
        </div>
      </div>
      <div className="mt-3">
        <Fallo texto={a.error} />
      </div>
    </details>
  );
}

/** Cuenta de baristas: quién está hoy en cada posición (solo lectura). */
export function RolesHoy({ semana, hoy }: { semana: SemanaRoles; hoy: string }) {
  const d = semana.dias.find((x) => x.dia === hoy);
  if (!d || !d.asignados)
    return <Vacio titulo="Sin roles para hoy">La gerencia todavía no asigna las posiciones de hoy.</Vacio>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {semana.turnos.map((t) => (
        <TurnoCard key={t.id} turno={t} semana={semana} d={d} />
      ))}
    </div>
  );
}
