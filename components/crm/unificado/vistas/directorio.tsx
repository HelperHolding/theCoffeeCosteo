import Link from 'next/link';
import { cn } from 'cn';
import { Building2, Mail, MapPin, Phone } from 'lucide-react';
import { EstadoActividad } from '@/components/crm/expediente/actividades';
import { fechaCorta, vencida } from '@/lib/crm/formato';
import { PRIORIDADES, type Actividad } from '@/lib/crm/tipos';
import { Avatar, Chip, FichaFecha, Segmentos, VacioBreve } from '@/components/crm/unificado/piezas';

export interface ContactoFicha {
  id: string;
  nombre: string | null;
  apellidos: string;
  correo: string | null;
  telefono: string | null;
  puesto: string | null;
  tipo_contacto: string | null;
  franquiciatario: string | null;
  plaza: string | null;
}

/** Contactos en fichas: nombre y puesto arriba, cómo localizarlo abajo. */
export function VistaContactos({ filas, filtrado }: { filas: ContactoFicha[]; filtrado: boolean }) {
  if (!filas.length)
    return (
      <VacioBreve>
        {filtrado
          ? 'Sin resultados. Prueba con otra búsqueda.'
          : 'Aún no hay contactos: se cargan con la importación de Zoho.'}
      </VacioBreve>
    );
  return (
    <ul role="list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filas.map((c) => {
        const nombre = [c.nombre, c.apellidos].filter(Boolean).join(' ');
        return (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card"
          >
            <div className="flex items-start gap-3">
              <Avatar nombre={nombre} tam={40} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/crm/contactos/${c.id}`}
                  className="block truncate font-semibold hover:underline"
                >
                  {nombre}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{c.puesto ?? 'Sin puesto'}</p>
              </div>
              {c.tipo_contacto && <Chip className="shrink-0">{c.tipo_contacto}</Chip>}
            </div>
            <dl className="space-y-1.5 border-t border-line pt-3 text-xs text-ink-2">
              {[
                { icono: Building2, etiqueta: 'Franquiciatario', valor: c.franquiciatario },
                { icono: MapPin, etiqueta: 'Plaza', valor: c.plaza },
                { icono: Phone, etiqueta: 'Teléfono', valor: c.telefono },
                { icono: Mail, etiqueta: 'Correo', valor: c.correo },
              ].map(({ icono: Icono, etiqueta, valor }) => (
                <div key={etiqueta} className="flex items-center gap-2">
                  <dt>
                    <Icono size={13} aria-hidden="true" className="text-muted-foreground" />
                    <span className="sr-only">{etiqueta}</span>
                  </dt>
                  <dd className={cn('min-w-0 truncate', !valor && 'text-muted-foreground')}>
                    {valor ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

export const VISTAS_ACTIVIDADES = {
  abiertas: 'Abiertas',
  vencidas: 'Vencidas',
  completadas: 'Completadas',
  todas: 'Todas',
} as const;

/** Actividades con ficha de fecha: qué hay que hacer, para cuándo, de quién y en qué estado va. */
export function VistaActividades({
  filas,
  vista,
  conteos,
  enlaces,
  relacion,
  editable,
}: {
  filas: Actividad[];
  vista: keyof typeof VISTAS_ACTIVIDADES;
  conteos?: Partial<Record<keyof typeof VISTAS_ACTIVIDADES, number>>;
  enlaces: Record<keyof typeof VISTAS_ACTIVIDADES, string>;
  relacion: Record<string, { texto: string; href: string }>;
  editable: boolean;
}) {
  return (
    <>
      <Segmentos
        etiqueta="Vista"
        activo={vista}
        opciones={(Object.keys(VISTAS_ACTIVIDADES) as (keyof typeof VISTAS_ACTIVIDADES)[]).map((v) => ({
          valor: v,
          texto: VISTAS_ACTIVIDADES[v],
          href: enlaces[v],
          contador: conteos?.[v],
        }))}
      />
      {filas.length === 0 ? (
        <VacioBreve>No hay actividades en esta vista.</VacioBreve>
      ) : (
        <ul role="list" className="grid gap-3 lg:grid-cols-2">
          {filas.map((a) => {
            const rel =
              relacion[a.tienda_id ?? a.franquiciatario_id ?? a.prospecto_id ?? a.contacto_id ?? ''];
            const tarde = vencida(a);
            return (
              <li
                key={a.id}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border bg-surface p-4 shadow-card',
                  tarde ? 'border-bad/30' : 'border-line',
                )}
              >
                {a.fecha_vencimiento ? (
                  <FichaFecha fecha={a.fecha_vencimiento} tono={tarde ? 'bad' : undefined} />
                ) : (
                  <span className="grid h-[3.9rem] w-12 shrink-0 place-items-center rounded-xl border border-dashed border-line-strong text-center text-[10px] leading-tight text-muted-foreground">
                    Sin fecha
                  </span>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      a.estado === 'Completed' && 'text-muted-foreground line-through',
                    )}
                  >
                    {a.asunto}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    {tarde && <span className="font-semibold text-bad">Vencida</span>}
                    {a.prioridad && (
                      <Chip
                        color={
                          a.prioridad === 'Highest' || a.prioridad === 'High' ? 'var(--color-bad)' : undefined
                        }
                      >
                        {PRIORIDADES[a.prioridad]}
                      </Chip>
                    )}
                    {rel && (
                      <Link
                        href={rel.href}
                        className="truncate font-medium text-crema-strong hover:underline"
                      >
                        {rel.texto}
                      </Link>
                    )}
                  </p>
                  {a.cerrada_en && (
                    <p className="text-[11px] text-muted-foreground">
                      Cerrada el {fechaCorta(a.cerrada_en.slice(0, 10))}
                    </p>
                  )}
                </div>
                <EstadoActividad actividad={a} editable={editable} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
