import Link from 'next/link';
import { CircleCheck, CircleDashed, CircleDot, TriangleAlert } from 'lucide-react';
import { cn } from 'cn';
import type { Dia, EstadoSeccion } from '@/lib/franquiciatarios/dia';
import { hora } from './formato';

const ESTADO: Record<EstadoSeccion, { texto: string; clase: string; icono: typeof CircleCheck }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-surface-2 text-ink-2', icono: CircleDashed },
  'en-curso': { texto: 'En curso', clase: 'bg-warn-soft text-warn', icono: CircleDot },
  completa: { texto: 'Completa', clase: 'bg-ok-soft text-ok', icono: CircleCheck },
};

/** Avance de las tres secciones del día; cada tarjeta abre su checklist. */
export function ResumenDia({ dia, base, consulta = '' }: { dia: Dia; base: string; consulta?: string }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {dia.secciones.map((s) => {
        const e = ESTADO[s.estado];
        const total = s.puntos.length;
        const ultima = s.firmas.at(-1);
        return (
          <li key={s.clave}>
            <Link
              href={`${base}/checklist?seccion=${s.clave}${consulta}`}
              className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-bold">{s.nombre}</h3>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', e.clase)}>
                  <e.icono size={13} aria-hidden="true" /> {e.texto}
                </span>
              </div>
              <p className="mt-4 font-display text-3xl font-black tabular leading-none">
                {s.respondidos}
                <span className="text-base font-bold text-muted-foreground"> / {total}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">puntos respondidos</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div
                  className={cn('h-full rounded-full', s.estado === 'completa' ? 'bg-ok' : 'bg-ink')}
                  style={{ width: `${total ? (s.respondidos / total) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-auto space-y-1 pt-4 text-sm">
                {s.noes > 0 && (
                  <p className="flex items-center gap-1.5 font-semibold text-bad">
                    <TriangleAlert size={14} aria-hidden="true" /> {s.noes} {s.noes === 1 ? 'punto en «No»' : 'puntos en «No»'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {ultima ? `Firmó ${ultima.nombre} a las ${hora(ultima.registrado_en)}` : 'Sin firma'}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
