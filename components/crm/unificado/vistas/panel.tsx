import Link from 'next/link';
import {
  AREAS,
  ETIQUETA_VENCIMIENTO,
  areaDeTexto,
  cuando,
  tramos,
  type EtapaGeneral,
} from '@/lib/crm/unificado/modelo';
import { BandejaAvisos } from '@/components/crm/unificado/avisos';
import {
  Avatar,
  Chip,
  FichaFecha,
  PanelCifras,
  Seccion,
  VacioBreve,
} from '@/components/crm/unificado/piezas';
import type { Aviso, ClaveArea, Historial, VencimientoCard } from '@/lib/crm/tipos';

export interface DatosPanel {
  etapas: EtapaGeneral[];
  porEtapa: Record<string, number>;
  candados: { bloqueadas: number; listas: number; liberadas: number };
  liberados30: number;
  proximos: (VencimientoCard & { dias: number })[];
  avisos: Aviso[];
  areas: ClaveArea[];
  todas: boolean;
  movimientos: Historial[];
  ahora?: Date;
}

const textoDias = (d: number) => (d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : `en ${d} d`);

/** Panel del día en recuadros: cifras, recorrido por tramo, candados, avisos, vencimientos y movimientos. */
export function VistaPanel(d: DatosPanel) {
  const ts = tramos(d.etapas);
  const abiertos = ts.filter((t) => t.clave !== 'cierre');
  const cierre = ts.find((t) => t.clave === 'cierre');
  const n = (id: string) => d.porEtapa[id] ?? 0;
  return (
    <>
      <PanelCifras
        cifras={[
          {
            etiqueta: 'Bloqueadas',
            valor: d.candados.bloqueadas,
            tono: 'bad',
            href: '/crm/pipeline',
            nota: 'les falta un requisito',
          },
          {
            etiqueta: 'Listas para avanzar',
            valor: d.candados.listas + d.candados.liberadas,
            tono: 'ok',
            href: '/crm/pendientes',
            nota: 'requisitos completos o candado liberado',
          },
          {
            etiqueta: 'Candados liberados',
            valor: d.liberados30,
            tono: 'warn',
            href: '/crm/bitacora?accion=candado_liberado',
            nota: 'últimos 30 días',
          },
          {
            etiqueta: 'Vencen en 14 días',
            valor: d.proximos.length,
            href: '/crm/vencimientos',
            nota: 'COF, 5 días hábiles y 120 días',
          },
        ]}
      />

      <Seccion
        titulo="Recorrido del proceso"
        descripcion="Cards abiertas en cada tramo. Toca una etapa para ver sus cards."
        accion={{ href: '/crm/pipeline', texto: 'Abrir Pipeline' }}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {abiertos.map((t) => {
            const color = t.area ? AREAS[t.area].color : 'var(--color-line-strong)';
            const total = t.etapas.reduce((s, e) => s + n(e.id), 0);
            const max = Math.max(1, ...t.etapas.map((e) => n(e.id)));
            return (
              <article
                key={t.clave}
                className="relative overflow-hidden rounded-xl border border-line bg-surface/70 p-4"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: color }}
                />
                <h3 className="text-[13px] font-semibold text-ink-2">{t.nombre}</h3>
                <p className="mt-1 font-display text-3xl font-black leading-none tabular">
                  {total.toLocaleString('es-MX')}
                </p>
                <ul role="list" className="mt-3 space-y-1.5">
                  {t.etapas.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/crm/pipeline?vista=tabla&etapa=${e.clave}`}
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-xs"
                      >
                        <span className="truncate text-ink-2 group-hover:underline">
                          {e.numero ? `${e.numero}. ` : ''}
                          {e.nombre}
                        </span>
                        <span className="font-semibold tabular">{n(e.id).toLocaleString('es-MX')}</span>
                        <span className="col-span-2 mt-0.5 h-1 rounded-full bg-surface-2" aria-hidden="true">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(n(e.id) / max) * 100}%`,
                              minWidth: n(e.id) ? 3 : 0,
                              background: color,
                            }}
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
        {cierre && (
          <ul role="list" className="mt-3 flex flex-wrap gap-2">
            {cierre.etapas.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/crm/pipeline?vista=tabla&etapa=${e.clave}`}
                  className="inline-flex items-baseline gap-2 rounded-lg border border-line bg-surface-2/70 px-3 py-1.5 text-xs hover:border-line-strong"
                >
                  <span className="text-ink-2">{e.nombre}</span>
                  <span className="font-semibold tabular">{n(e.id).toLocaleString('es-MX')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Avisos sin atender" contador={d.avisos.length} cuerpo={false}>
          <BandejaAvisos avisos={d.avisos.slice(0, 4)} areas={d.areas} todas={d.todas} />
        </Seccion>

        <Seccion
          titulo="Próximos vencimientos"
          contador={d.proximos.length}
          accion={{ href: '/crm/vencimientos', texto: 'Ver todos' }}
        >
          {d.proximos.length ? (
            <ul role="list" className="space-y-2.5">
              {d.proximos.slice(0, 5).map((v) => {
                const tono = v.dias < 0 ? 'bad' : v.dias <= 3 ? 'warn' : undefined;
                return (
                  <li key={`${v.tipo}-${v.tienda_id}`}>
                    <Link
                      href={`/crm/sucursales/${v.tienda_id}`}
                      className="flex items-center gap-3 rounded-xl p-1 pr-2 hover:bg-surface-2/70"
                    >
                      <FichaFecha fecha={v.fecha} tono={tono} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{v.nombre}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Chip color={AREAS[v.area].color}>{ETIQUETA_VENCIMIENTO[v.tipo] ?? v.tipo}</Chip>
                          <span
                            className={
                              tono === 'bad'
                                ? 'text-xs font-semibold text-bad'
                                : tono === 'warn'
                                  ? 'text-xs font-semibold text-warn'
                                  : 'text-xs text-muted-foreground'
                            }
                          >
                            {textoDias(v.dias)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <VacioBreve>Nada vence en los próximos 14 días.</VacioBreve>
          )}
        </Seccion>
      </div>

      <Seccion
        titulo="Movimientos recientes"
        descripcion="Quién movió qué en el CRM."
        accion={{ href: '/crm/bitacora', texto: 'Ver bitácora' }}
      >
        {d.movimientos.length ? (
          <ol
            role="list"
            className="relative space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line"
          >
            {d.movimientos.slice(0, 8).map((h) => {
              const area = areaDeTexto(h.actor_area);
              return (
                <li key={h.id} className="relative flex gap-3">
                  <Avatar
                    nombre={h.actor_nombre ?? 'Sistema'}
                    area={area}
                    tam={32}
                    className="ring-4 ring-surface"
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm">{h.resumen}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium text-ink-2">{h.actor_nombre ?? 'Sistema'}</span>
                      {area && <span>{AREAS[area].nombre}</span>}
                      <span>{cuando(h.fecha, d.ahora)}</span>
                    </p>
                    {h.motivo && (
                      <p className="mt-1 rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-xs text-ink-2">
                        Motivo: {h.motivo}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <VacioBreve>Sin movimientos todavía.</VacioBreve>
        )}
      </Seccion>
    </>
  );
}
