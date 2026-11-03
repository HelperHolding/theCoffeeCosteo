import Link from 'next/link';
import { AREAS, ETIQUETA_VENCIMIENTO } from '@/lib/crm/unificado/modelo';
import { BandejaAvisos } from '@/components/crm/unificado/avisos';
import { Chip, FichaFecha, PanelCifras, Seccion, VacioBreve } from '@/components/crm/unificado/piezas';
import type { Aviso, ClaveArea, VencimientoCard } from '@/lib/crm/tipos';

export interface DatosVencimientos {
  lista: (VencimientoCard & { dias: number })[];
  avisos: Aviso[];
  areas: ClaveArea[];
  todas: boolean;
}

const mes = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const texto = (d: number) => (d < 0 ? `Venció hace ${-d} d` : d === 0 ? 'Vence hoy' : `En ${d} d`);

/** Fechas clave por mes, en fichas de calendario; los avisos sin atender a un lado. */
export function VistaVencimientos(d: DatosVencimientos) {
  const grupos = new Map<string, typeof d.lista>();
  for (const v of d.lista) {
    const k = mes.format(new Date(`${v.fecha}T00:00:00Z`));
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  const cuenta = (f: (dias: number) => boolean) => d.lista.filter((v) => f(v.dias)).length;
  return (
    <>
      <PanelCifras
        cifras={[
          { etiqueta: 'Vencidas', valor: cuenta((x) => x < 0), tono: 'bad', nota: 'ya pasó la fecha' },
          {
            etiqueta: 'Esta semana',
            valor: cuenta((x) => x >= 0 && x <= 7),
            tono: 'warn',
            nota: 'de hoy a 7 días',
          },
          { etiqueta: 'Este mes', valor: cuenta((x) => x > 7 && x <= 30), nota: 'de 8 a 30 días' },
          { etiqueta: 'Más adelante', valor: cuenta((x) => x > 30), nota: 'después de 30 días' },
        ]}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {d.lista.length === 0 ? (
            <VacioBreve>
              Sin fechas por vigilar. Aparecen cuando una sucursal tiene fecha estimada, confirmada o límite
              de apertura.
            </VacioBreve>
          ) : (
            [...grupos.entries()].map(([nombre, vs]) => (
              <Seccion key={nombre} titulo={nombre[0].toUpperCase() + nombre.slice(1)} contador={vs.length}>
                <ul role="list" className="grid gap-2 md:grid-cols-2">
                  {vs.map((v) => {
                    const tono = v.dias < 0 ? 'bad' : v.dias <= 7 ? 'warn' : undefined;
                    return (
                      <li key={`${v.tipo}-${v.tienda_id}`}>
                        <Link
                          href={`/crm/sucursales/${v.tienda_id}`}
                          className="flex h-full items-center gap-3 rounded-xl border border-line bg-surface/60 p-2.5 hover:border-line-strong"
                        >
                          <FichaFecha fecha={v.fecha} tono={tono} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{v.nombre}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Chip color={AREAS[v.area].color}>
                                {ETIQUETA_VENCIMIENTO[v.tipo] ?? v.tipo}
                              </Chip>
                              <span
                                className={
                                  tono === 'bad'
                                    ? 'text-xs font-semibold text-bad'
                                    : tono === 'warn'
                                      ? 'text-xs font-semibold text-warn'
                                      : 'text-xs text-muted-foreground'
                                }
                              >
                                {texto(v.dias)}
                              </span>
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Seccion>
            ))
          )}
        </div>
        <Seccion
          titulo="Avisos sin atender"
          contador={d.avisos.length}
          descripcion="Los días hábiles saltan fines de semana y festivos."
          cuerpo={false}
          className="xl:sticky xl:top-20"
        >
          <BandejaAvisos avisos={d.avisos} areas={d.areas} todas={d.todas} />
        </Seccion>
      </div>
    </>
  );
}
