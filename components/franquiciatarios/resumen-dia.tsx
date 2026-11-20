import Link from 'next/link';
import { CircleCheck, CircleDashed, CircleDot, TriangleAlert } from 'lucide-react';
import { cn } from 'cn';
import type { Dia, EstadoSeccion } from '@/lib/franquiciatarios/dia';
import { hora } from './formato';
import { ICONO_SECCION, TONO } from './colores';

const ESTADO: Record<EstadoSeccion, { texto: string; icono: typeof CircleCheck; color: string }> = {
  pendiente: { texto: 'Pendiente', icono: CircleDashed, color: 'text-muted-foreground' },
  'en-curso': { texto: 'En curso', icono: CircleDot, color: 'text-warn' },
  completa: { texto: 'Completa', icono: CircleCheck, color: 'text-ok' },
};

/** Avance de las tres secciones del día; cada tarjeta abre su checklist y lleva el color de su sección. */
export function ResumenDia({ dia, base, consulta = '' }: { dia: Dia; base: string; consulta?: string }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {dia.secciones.map((s) => {
        const e = ESTADO[s.estado];
        const t = TONO[s.clave];
        const Icono = ICONO_SECCION[s.clave];
        const total = s.puntos.length;
        const ultima = s.firmas.at(-1);
        return (
          <li key={s.clave}>
            <Link
              href={`${base}/checklist?seccion=${s.clave}${consulta}`}
              className={cn(
                'group flex h-full flex-col rounded-2xl border p-5 shadow-card transition-[border-color,box-shadow] hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45',
                t.brillo,
                t.borde,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl text-primary-foreground',
                      t.marca,
                    )}
                  >
                    <Icono size={18} aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-lg font-bold">{s.nombre}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 shadow-card">
                  <e.icono size={13} aria-hidden="true" className={e.color} /> {e.texto}
                </span>
              </div>
              <p className="mt-4 font-display text-3xl font-black tabular leading-none">
                {s.respondidos}
                <span className="text-base font-bold text-muted-foreground"> / {total}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">puntos respondidos</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div
                  className={cn('h-full rounded-full', s.estado === 'completa' ? 'bg-ok' : t.marca)}
                  style={{ width: `${total ? (s.respondidos / total) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-auto space-y-1 pt-4 text-sm">
                {s.noes > 0 && (
                  <p className="flex items-center gap-1.5 font-semibold text-bad">
                    <TriangleAlert size={14} aria-hidden="true" /> {s.noes}{' '}
                    {s.noes === 1 ? 'punto en «No»' : 'puntos en «No»'}
                  </p>
                )}
                <p className="text-xs text-ink-2">
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
