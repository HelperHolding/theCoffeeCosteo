import Link from 'next/link';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { AREAS, areaDeTexto } from '@/lib/crm/unificado/modelo';
import { Avatar, Segmentos, VacioBreve } from '@/components/crm/unificado/piezas';
import type { ClaveArea, Historial } from '@/lib/crm/tipos';

export const ACCIONES: Record<string, string> = {
  etapa: 'Cambio de etapa',
  requisito_cumplido: 'Requisito registrado',
  requisito_validado: 'Requisito validado',
  requisito_revertido: 'Requisito corregido',
  requisito_no_aplica: 'Requisito no aplica',
  candado_liberado: 'Candado liberado',
  sucursal_creada: 'Sucursal creada',
  creado: 'Alta',
  editado: 'Edición de datos',
  responsable: 'Cambio de responsable',
  nota: 'Nota',
  archivo: 'Archivo',
  archivo_version: 'Nueva versión de archivo',
  archivo_retirado: 'Archivo retirado',
  archivo_descargado: 'Descarga',
  checklist: 'Checklist',
  acceso: 'Acceso',
  aviso: 'Aviso automático',
  eliminado: 'Eliminación',
  configuracion: 'Configuración',
};

export interface DatosBitacora {
  filas: Historial[];
  total: number;
  pagina: number;
  paginas: number;
  /** Parámetros de la URL tal como llegaron (filtros activos). */
  p: Record<string, string | undefined>;
  personas: { user_id: string; nombre: string }[];
}

const dia = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});
const hora = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Mexico_City',
});

/** Bitácora como línea de tiempo por día: quién (avatar del área), qué, a qué card y por qué. */
export function VistaBitacora(d: DatosBitacora) {
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams(
      Object.fromEntries(Object.entries({ ...d.p, ...extra }).filter((x): x is [string, string] => !!x[1])),
    ).toString();
  const dias = new Map<string, Historial[]>();
  for (const h of d.filas) {
    const k = dia.format(new Date(h.fecha));
    dias.set(k, [...(dias.get(k) ?? []), h]);
  }
  const extras = ['actor', 'accion', 'desde', 'hasta', 'muestra'].filter((k) => d.p[k]).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmentos
          etiqueta="Área"
          activo={d.p.area ?? ''}
          opciones={[
            { valor: '', texto: 'Todas las áreas', href: `/crm/bitacora?${qs({ area: '', pagina: '' })}` },
            ...(['ventas', 'legal', 'proyectos'] as ClaveArea[]).map((a) => ({
              valor: a,
              texto: AREAS[a].nombre,
              href: `/crm/bitacora?${qs({ area: a, pagina: '' })}`,
            })),
          ]}
        />
        <form className="min-w-56 flex-1" role="search">
          {Object.entries(d.p)
            .filter(([k, v]) => v && k !== 'q' && k !== 'pagina')
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label>
            <span className="sr-only">Buscar en el resumen</span>
            <input name="q" type="search" defaultValue={d.p.q} placeholder="Buscar card, requisito, etapa…" />
          </label>
        </form>
      </div>

      <details className="group rounded-2xl border border-line bg-surface shadow-card" open={extras > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal size={15} aria-hidden="true" />
          Más filtros
          {extras > 0 && (
            <span className="rounded-full bg-ink px-1.5 text-[11px] tabular text-white">{extras}</span>
          )}
          <ChevronRight
            size={15}
            aria-hidden="true"
            className="ml-auto transition-transform group-open:rotate-90"
          />
        </summary>
        <form className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          {d.p.q && <input type="hidden" name="q" value={d.p.q} />}
          {d.p.area && <input type="hidden" name="area" value={d.p.area} />}
          <label>
            Persona
            <select name="actor" defaultValue={d.p.actor ?? ''}>
              <option value="">Todas</option>
              {d.personas.map((x) => (
                <option key={x.user_id} value={x.user_id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Acción
            <select name="accion" defaultValue={d.p.accion ?? ''}>
              <option value="">Todas</option>
              {Object.entries(ACCIONES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input name="desde" type="date" defaultValue={d.p.desde} />
          </label>
          <label>
            Hasta
            <input name="hasta" type="date" defaultValue={d.p.hasta} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" name="muestra" value="1" defaultChecked={d.p.muestra === '1'} />
            Incluir la importación de Zoho (datos de muestra)
          </label>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <Link
              href="/crm/bitacora"
              className="h-10 px-3 py-2 text-sm font-semibold text-ink-2 hover:underline"
            >
              Limpiar
            </Link>
            <button className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
              Filtrar
            </button>
          </div>
        </form>
      </details>

      {d.filas.length === 0 ? (
        <VacioBreve>Sin movimientos con estos filtros. Amplía las fechas o quita algún filtro.</VacioBreve>
      ) : (
        [...dias.entries()].map(([nombre, hs]) => (
          <section key={nombre} className="rounded-2xl border border-line bg-surface shadow-card">
            <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-semibold">
              {nombre[0].toUpperCase() + nombre.slice(1)}
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular text-ink-2">
                {hs.length}
              </span>
            </h2>
            <ol role="list" className="divide-y divide-line">
              {hs.map((h) => {
                const area = areaDeTexto(h.actor_area);
                const actor = h.actor_nombre ?? (h.origen === 'zoho' ? 'Zoho' : 'Sistema');
                const card =
                  h.franquiciatario_id && !h.tienda_id
                    ? `/crm/franquiciatarios/${h.franquiciatario_id}`
                    : h.tienda_id
                      ? `/crm/sucursales/${h.tienda_id}`
                      : null;
                return (
                  <li key={h.id} className="grid grid-cols-[3rem_auto_minmax(0,1fr)] gap-3 px-5 py-3">
                    <time dateTime={h.fecha} className="pt-1.5 text-xs tabular text-muted-foreground">
                      {hora.format(new Date(h.fecha))}
                    </time>
                    <Avatar nombre={actor} area={area} tam={30} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-semibold text-ink">{actor}</span>
                        {area && <span className="text-muted-foreground">{AREAS[area].nombre}</span>}
                        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium text-ink-2">
                          {ACCIONES[h.accion] ?? h.accion}
                        </span>
                      </p>
                      <p className="mt-1 text-sm">
                        {h.resumen}
                        {card && (
                          <>
                            {' '}
                            <Link
                              href={card}
                              className="whitespace-nowrap text-xs font-semibold text-crema-strong hover:underline"
                            >
                              Abrir card
                            </Link>
                          </>
                        )}
                      </p>
                      {h.motivo && (
                        <p className="mt-1.5 rounded-lg border-l-2 border-warn bg-warn-soft px-2.5 py-1.5 text-xs text-ink-2">
                          Motivo: {h.motivo}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      <nav aria-label="Páginas" className="placa flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="text-muted-foreground tabular">
          {d.total.toLocaleString('es-MX')} movimientos · página {d.pagina} de {d.paginas}
        </span>
        <span className="flex gap-3">
          {d.pagina > 1 && (
            <Link
              className="font-semibold hover:underline"
              href={`/crm/bitacora?${qs({ pagina: String(d.pagina - 1) })}`}
            >
              Anterior
            </Link>
          )}
          {d.pagina < d.paginas && (
            <Link
              className="font-semibold hover:underline"
              href={`/crm/bitacora?${qs({ pagina: String(d.pagina + 1) })}`}
            >
              Siguiente
            </Link>
          )}
        </span>
      </nav>
    </>
  );
}
