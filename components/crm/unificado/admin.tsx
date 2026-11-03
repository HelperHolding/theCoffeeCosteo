'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  agregarFestivo,
  editarRequisito,
  guardarMembresia,
  quitarFestivo,
  quitarMembresia,
} from '@/app/(crm)/crm/acciones-pipeline';
import { AREAS } from '@/lib/crm/unificado/modelo';
import type { ClaveArea, Festivo, Membresia, Requisito, RolArea } from '@/lib/crm/tipos';

function useAccion() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState('');
  const correr = (fn: () => Promise<{ error?: string }>, alTerminar?: () => void) =>
    iniciar(async () => {
      setError('');
      const r = await fn();
      if (r.error) return setError(r.error);
      alTerminar?.();
      router.refresh();
    });
  return { pendiente, error, correr };
}
const ROLES: Record<RolArea, string> = { head: 'Head', miembro: 'Miembro', lectura: 'Lectura' };
const AREAS_ACTIVAS: ClaveArea[] = ['ventas', 'legal', 'proyectos'];

/** Usuarios por área y rol. Solo un desarrollador (con OK de Carlo) cambia accesos; queda en la bitácora. */
export function Membresias({
  personas,
  membresias,
  puede,
}: {
  personas: { user_id: string; nombre: string; nivel: string }[];
  membresias: Membresia[];
  puede: boolean;
}) {
  const { pendiente, error, correr } = useAccion();
  const [usuario, setUsuario] = useState('');
  const [area, setArea] = useState<ClaveArea>('ventas');
  const [rol, setRol] = useState<RolArea>('miembro');
  const [locales, setLocales] = useState(false);
  const nombre = new Map(personas.map((p) => [p.user_id, p.nombre]));
  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2 font-semibold">Persona</th>
              <th className="px-5 py-2 font-semibold">Acceso al CRM</th>
              <th className="px-5 py-2 font-semibold">Áreas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {personas.map((p) => (
              <tr key={p.user_id}>
                <td className="px-5 py-2.5 font-medium">{p.nombre}</td>
                <td className="px-5 py-2.5 text-xs">{p.nivel}</td>
                <td className="px-5 py-2.5">
                  <ul role="list" className="flex flex-wrap gap-1.5">
                    {membresias
                      .filter((m) => m.user_id === p.user_id)
                      .map((m) => (
                        <li
                          key={m.area}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full"
                            style={{ background: AREAS[m.area].color }}
                          />
                          {AREAS[m.area].nombre} · {ROLES[m.rol]}
                          {m.funciones.includes('aprobacion_locales') && ' · Aprobación de locales'}
                          {puede && (
                            <button
                              type="button"
                              aria-label={`Quitar ${AREAS[m.area].nombre} a ${p.nombre}`}
                              className="text-muted-foreground hover:text-bad"
                              disabled={pendiente}
                              onClick={() => correr(() => quitarMembresia(m.user_id, m.area))}
                            >
                              <Trash2 size={12} aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      ))}
                    {!membresias.some((m) => m.user_id === p.user_id) && (
                      <li className="text-xs text-muted-foreground">Sin área (solo ve el CRM)</li>
                    )}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {puede ? (
        <form
          className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!usuario) return;
            correr(() => guardarMembresia(usuario, area, rol, locales ? ['aprobacion_locales'] : []));
          }}
        >
          <label className="min-w-48 flex-1">
            Persona
            <select value={usuario} onChange={(e) => setUsuario(e.target.value)} required>
              <option value="">Elegir…</option>
              {personas.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {nombre.get(p.user_id)}
                </option>
              ))}
            </select>
          </label>
          <label className="w-36">
            Área
            <select value={area} onChange={(e) => setArea(e.target.value as ClaveArea)}>
              {AREAS_ACTIVAS.map((a) => (
                <option key={a} value={a}>
                  {AREAS[a].nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="w-32">
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as RolArea)}>
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
            <input type="checkbox" checked={locales} onChange={(e) => setLocales(e.target.checked)} />
            Aprobación de locales
          </label>
          <Button disabled={pendiente}>Guardar acceso</Button>
          {error && (
            <p role="alert" className="basis-full text-sm text-bad">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="border-t border-line px-5 py-3 text-xs text-muted-foreground">
          Los accesos los da un desarrollador con el OK de Carlo. Para dar acceso a alguien nuevo, primero se
          crea su usuario.
        </p>
      )}
    </div>
  );
}

export function Festivos({ festivos, puede }: { festivos: Festivo[]; puede: boolean }) {
  const { pendiente, error, correr } = useAccion();
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const fmt = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div>
      <ul role="list" className="divide-y divide-line">
        {festivos.map((f) => (
          <li key={f.fecha} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
            <span>
              <span className="font-medium tabular">{fmt.format(new Date(`${f.fecha}T00:00:00Z`))}</span> ·{' '}
              {f.nombre}
            </span>
            {puede && (
              <button
                type="button"
                aria-label={`Quitar festivo ${f.nombre}`}
                className="text-muted-foreground hover:text-bad"
                disabled={pendiente}
                onClick={() => correr(() => quitarFestivo(f.fecha))}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {puede && (
        <form
          className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            correr(
              () => agregarFestivo(fecha, nombre),
              () => {
                setFecha('');
                setNombre('');
              },
            );
          }}
        >
          <label className="w-44">
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </label>
          <label className="min-w-48 flex-1">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <Button disabled={pendiente}>Agregar festivo</Button>
          {error && (
            <p role="alert" className="basis-full text-sm text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export function Requisitos({
  requisitos,
  etapas,
  puede,
}: {
  requisitos: Requisito[];
  etapas: { id: string; nombre: string; numero: number | null }[];
  puede: boolean;
}) {
  const { pendiente, error, correr } = useAccion();
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  return (
    <div className="relative overflow-x-auto">
      {error && (
        <p role="alert" className="px-5 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-5 py-2 font-semibold">Etapa</th>
            <th className="px-5 py-2 font-semibold">Requisito</th>
            <th className="px-5 py-2 font-semibold">Cumple / valida</th>
            <th className="px-5 py-2 font-semibold">Candado</th>
            <th className="px-5 py-2 font-semibold">Activo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {requisitos.map((r) => {
            const e = etapaDe.get(r.etapa_id);
            return (
              <tr key={r.id}>
                <td className="px-5 py-2 text-xs">
                  {e ? `${e.numero ? `${e.numero} · ` : ''}${e.nombre}` : '—'}
                </td>
                <td className="px-5 py-2">{r.nombre}</td>
                <td className="px-5 py-2 text-xs">
                  {AREAS[r.area_cumple].nombre} / {AREAS[r.area_valida].nombre}
                </td>
                <td className="px-5 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Candado obligatorio: ${r.nombre}`}
                    checked={r.obligatorio}
                    disabled={!puede || pendiente}
                    onChange={(ev) =>
                      correr(() => editarRequisito(r.id, r.version, { obligatorio: ev.target.checked }))
                    }
                  />
                </td>
                <td className="px-5 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Activo: ${r.nombre}`}
                    checked={r.activo}
                    disabled={!puede || pendiente}
                    onChange={(ev) =>
                      correr(() => editarRequisito(r.id, r.version, { activo: ev.target.checked }))
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
