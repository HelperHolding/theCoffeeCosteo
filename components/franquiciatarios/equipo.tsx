'use client';
import { useState, useTransition } from 'react';
import { LoaderCircle, Pencil, UserPlus } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { guardarBarista } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { FranqBarista } from '@/lib/franquiciatarios/tipos';

const campo =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35';

/**
 * Nombres de la cuenta de baristas. El gerente (o el franquiciatario) los da de alta, corrige y desactiva. Un nombre
 * desactivado ya no aparece para elegir, pero su historial se conserva; nunca se borra.
 */
export function Equipo({ companyId, baristas }: { companyId: number; baristas: FranqBarista[] }) {
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const activos = baristas.filter((b) => b.activo);
  const inactivos = baristas.filter((b) => !b.activo);

  const guardar = (id: number | null, nombre: string, activo: boolean, alTerminar?: () => void) =>
    iniciar(async () => {
      setError(null);
      try {
        const r = await guardarBarista({ companyId, id, nombre, activo });
        if ('error' in r) setError(r.error);
        else alTerminar?.();
      } catch {
        setError('No se guardó: no hay conexión. Intenta de nuevo.');
      }
    });

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          guardar(null, nuevo, true, () => setNuevo(''));
        }}
      >
        <label htmlFor="nuevo-barista" className="font-display text-base font-bold">
          Agregar barista
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Escribe el nombre como lo reconocerá el equipo. Aparecerá en la lista «¿Quién eres?» de la tablet.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="nuevo-barista"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            maxLength={60}
            placeholder="Nombre y apellido"
            className={campo}
          />
          <Button size="lg" type="submit" disabled={pendiente || nuevo.trim().length < 2}>
            {pendiente ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
            Agregar
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-bad">
            {error}
          </p>
        )}
      </form>

      <Lista titulo={`Activos (${activos.length})`} vacio="Sin baristas activos.">
        {activos.map((b) => (
          <Fila key={b.id} b={b} pendiente={pendiente} guardar={guardar} />
        ))}
      </Lista>
      {inactivos.length > 0 && (
        <Lista titulo={`Desactivados (${inactivos.length})`} vacio="">
          {inactivos.map((b) => (
            <Fila key={b.id} b={b} pendiente={pendiente} guardar={guardar} />
          ))}
        </Lista>
      )}
    </div>
  );
}

function Lista({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface shadow-card">
      <h2 className="border-b border-line px-5 py-3 font-display text-base font-bold">{titulo}</h2>
      {children.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}

function Fila({
  b,
  pendiente,
  guardar,
}: {
  b: FranqBarista;
  pendiente: boolean;
  guardar: (id: number | null, nombre: string, activo: boolean, alTerminar?: () => void) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(b.nombre);
  return (
    <li className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      {editando ? (
        <form
          className="flex flex-1 flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            guardar(b.id, nombre, b.activo, () => setEditando(false));
          }}
        >
          <label className="sr-only" htmlFor={`b-${b.id}`}>
            Nombre
          </label>
          <input id={`b-${b.id}`} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} className={campo} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pendiente || nombre.trim().length < 2}>
              Guardar
            </Button>
            <Button type="button" variant="ghost" onClick={() => (setEditando(false), setNombre(b.nombre))}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div>
            <p className={cn('font-medium', b.activo ? 'text-ink' : 'text-muted-foreground')}>{b.nombre}</p>
            <p className="text-xs text-muted-foreground">
              Alta {new Date(b.creado_en).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}
              {b.actualizado_en &&
                ` · último cambio ${new Date(b.actualizado_en).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}`}
            </p>
          </div>
          <div className="flex gap-2">
            {b.activo && (
              <Button variant="ghost" size="sm" onClick={() => setEditando(true)} aria-label={`Editar ${b.nombre}`}>
                <Pencil aria-hidden="true" /> Editar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pendiente}
              onClick={() => guardar(b.id, b.nombre, !b.activo)}
            >
              {b.activo ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        </>
      )}
    </li>
  );
}
