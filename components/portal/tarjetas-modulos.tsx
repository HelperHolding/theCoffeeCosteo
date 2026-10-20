import Link from 'next/link';
import { ArrowUpRight, Calculator, Store, type LucideIcon } from 'lucide-react';
import type { IdModulo, Modulo } from '@/lib/portal/modulos';
import { Vacio } from './piezas';

const iconos: Record<IdModulo, LucideIcon> = { costeo: Calculator, crm: Store };

export function TarjetasModulos({
  modulos,
}: {
  modulos: Pick<Modulo, 'id' | 'nombre' | 'descripcion' | 'href'>[];
}) {
  if (modulos.length === 0)
    return <Vacio titulo="Aún no tienes módulos asignados">Pide acceso al administrador del portal.</Vacio>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {modulos.map((m) => {
        const Icono = iconos[m.id];
        return (
          <li key={m.id}>
            <Link
              href={m.href}
              className="group flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-ink text-crema">
                  <Icono size={20} aria-hidden="true" />
                </span>
                <ArrowUpRight
                  size={18}
                  aria-hidden="true"
                  className="text-muted-foreground transition-colors group-hover:text-ink"
                />
              </span>
              <span>
                <span className="block font-display text-lg font-bold">{m.nombre}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{m.descripcion}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
