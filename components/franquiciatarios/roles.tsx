'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CircleAlert, Copy, LoaderCircle, Plus, X } from 'lucide-react';
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
import type { FranqBarista } from '@/lib/franquiciatarios/tipos';
import { Vacio } from '@/components/portal/piezas';
import { diaCorto, diaLargo } from './formato';

const campo =
  'h-9 rounded-[10px] border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35';

/** Ejecuta una acción del servidor y deja el error a la vista (nada se da por guardado sin respuesta). */
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

/** Matriz de la semana para la gerencia: asignar y quitar por día, turno y posición. */
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
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-line-strong px-3 text-sm"
          href={`${base}?semana=${sumarDias(semana.lunes, -7)}`}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Semana anterior
        </Link>
        <p className="px-1 text-sm font-semibold">
          {diaCorto(semana.lunes)} – {diaCorto(sumarDias(semana.lunes, 6))}
        </p>
        <Link
          className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-line-strong px-3 text-sm"
          href={`${base}?semana=${sumarDias(semana.lunes, 7)}`}
        >
          Semana siguiente <ChevronRight size={16} aria-hidden="true" />
        </Link>
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
          Copiar la semana anterior a los días vacíos
        </Button>
      </div>
      <Fallo texto={a.error} />
      {!activos.length && (
        <p className="aviso">Da de alta a los baristas en «Baristas» para poder asignarlos.</p>
      )}
      <div className="space-y-4">
        {semana.dias.map((d) => (
          <DiaGestor
            key={d.dia}
            companyId={companyId}
            semana={semana}
            d={d}
            baristas={activos}
            editable={d.dia >= sumarDias(hoy, -7)}
            esHoy={d.dia === hoy}
          />
        ))}
      </div>
      <Catalogo companyId={companyId} semana={semana} />
    </div>
  );
}

function DiaGestor({
  companyId,
  semana,
  d,
  baristas,
  editable,
  esHoy,
}: {
  companyId: number;
  semana: SemanaRoles;
  d: DiaRoles;
  baristas: FranqBarista[];
  editable: boolean;
  esHoy: boolean;
}) {
  const a = useAccion();
  return (
    <section
      aria-label={diaLargo(d.dia)}
      className={cn(
        'overflow-hidden rounded-2xl border bg-surface shadow-card',
        esHoy ? 'border-ink' : 'border-line',
      )}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-base font-semibold first-letter:uppercase">
          {diaLargo(d.dia)}
          {esHoy && <span className="ml-2 text-xs font-semibold text-ink-2">Hoy</span>}
        </h2>
        <p className="text-xs text-ink-2">
          {d.asignados} {d.asignados === 1 ? 'barista' : 'baristas'}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-40 px-4 py-2 font-medium">Posición</th>
              {semana.turnos.map((t) => (
                <th key={t.id} className="px-3 py-2 font-medium">
                  {t.nombre} · {horaCorta(t.entrada)}–{horaCorta(t.salida)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {semana.posiciones.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {p.nombre}
                </th>
                {semana.turnos.map((t) => {
                  const celda = d.celdas.find((c) => c.turnoId === t.id && c.posicionId === p.id)!;
                  const libres = baristas.filter((b) => !celda.baristas.some((x) => x.id === b.id));
                  return (
                    <td key={t.id} className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {celda.baristas.map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-xs font-medium"
                          >
                            {b.nombre}
                            {editable && (
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
                                className="grid size-5 place-items-center rounded-full hover:bg-line"
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        ))}
                        {editable && libres.length > 0 && (
                          <select
                            aria-label={`Agregar barista a ${p.nombre}, ${t.nombre}`}
                            className={cn(campo, 'h-8 w-auto max-w-36 py-0 text-xs leading-none')}
                            value=""
                            disabled={a.pendiente}
                            onChange={(e) => {
                              const id = Number(e.target.value);
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
                            <option value="">+ Agregar</option>
                            {libres.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.nombre}
                              </option>
                            ))}
                          </select>
                        )}
                        {!editable && !celda.baristas.length && <span className="text-ink-2">—</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.error && (
        <div className="px-4 pb-3">
          <Fallo texto={a.error} />
        </div>
      )}
    </section>
  );
}

/** Posiciones y turnos: agregar, renombrar, cambiar horas y desactivar. */
function Catalogo({ companyId, semana }: { companyId: number; semana: SemanaRoles }) {
  const a = useAccion();
  const [posicion, setPosicion] = useState('');
  const [turno, setTurno] = useState({ nombre: '', entrada: '', salida: '' });
  return (
    <details className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <summary className="cursor-pointer font-semibold">Posiciones y turnos</summary>
      <div className="mt-3 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Posiciones</h3>
          <ul className="divide-y divide-line text-sm">
            {semana.posiciones.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className={cn(!p.activo && 'text-ink-2 line-through')}>{p.nombre}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={a.pendiente}
                  onClick={() =>
                    a.correr(() =>
                      guardarPosicion({ companyId, id: p.id, nombre: p.nombre, activo: !p.activo }),
                    )
                  }
                >
                  {p.activo ? 'Desactivar' : 'Activar'}
                </Button>
              </li>
            ))}
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
            <label className="sr-only" htmlFor="posicion-nueva">
              Nueva posición
            </label>
            <input
              id="posicion-nueva"
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
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Turnos</h3>
          <ul className="divide-y divide-line text-sm">
            {semana.turnos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className={cn(!t.activo && 'text-ink-2 line-through')}>
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
            ))}
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
      <div className="mt-2">
        <Fallo texto={a.error} />
      </div>
    </details>
  );
}

/** Cuenta de baristas: quién está hoy en qué posición (solo lectura). */
export function RolesHoy({ semana, hoy }: { semana: SemanaRoles; hoy: string }) {
  const d = semana.dias.find((x) => x.dia === hoy);
  if (!d || !d.asignados)
    return <Vacio titulo="Sin roles para hoy">La gerencia todavía no asigna las posiciones de hoy.</Vacio>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {semana.turnos.map((t) => (
        <section key={t.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-base font-semibold">
            {t.nombre} · {horaCorta(t.entrada)}–{horaCorta(t.salida)}
          </h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {semana.posiciones.map((p) => {
              const c = d.celdas.find((x) => x.turnoId === t.id && x.posicionId === p.id)!;
              return (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-ink-2">{p.nombre}</span>
                  <span className="text-right font-semibold">
                    {c.baristas.length ? c.baristas.map((b) => b.nombre).join(', ') : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
