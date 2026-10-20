import Link from 'next/link';
import { CalendarClock, CircleAlert, Store, TriangleAlert, UsersRound } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { tablero } from '@/lib/crm/consultas';
import { columnas, GRUPOS, resumenPorGrupo } from '@/lib/crm/kanban';
import { Encabezado, Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { fechaCorta } from '@/components/crm/expediente/actividades';

const enDias = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export default async function PanelCrm() {
  // Cada página exige el acceso por sí misma: el layout no se vuelve a ejecutar al navegar.
  const { db } = await sesionCrm();
  const hoy = enDias(0);
  const [{ etapas, tarjetas }, prospectos, sinEstado, vencidas, proximas] = await Promise.all([
    tablero(db),
    db.from('crm_prospectos').select('id', { count: 'exact', head: true }).is('archivado_en', null),
    db
      .from('crm_prospectos')
      .select('id', { count: 'exact', head: true })
      .is('archivado_en', null)
      .is('etapa_id', null),
    db
      .from('crm_actividades')
      .select('id', { count: 'exact', head: true })
      .is('archivado_en', null)
      .neq('estado', 'Completed')
      .lt('fecha_vencimiento', hoy),
    db
      .from('crm_actividades')
      .select('id,asunto,fecha_vencimiento,tienda_id')
      .is('archivado_en', null)
      .neq('estado', 'Completed')
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', enDias(14))
      .order('fecha_vencimiento')
      .limit(8),
  ]);
  const grupos = resumenPorGrupo(columnas(etapas, tarjetas));
  const porRevisar = tarjetas.filter((t) => t.revisar.length > 0).length;
  const arranques = tarjetas
    .filter(
      (t) =>
        t.fecha_programada_arranque &&
        t.fecha_programada_arranque >= hoy &&
        t.fecha_programada_arranque <= enDias(90),
    )
    .sort((a, b) => a.fecha_programada_arranque!.localeCompare(b.fecha_programada_arranque!))
    .slice(0, 8);
  const nombreTienda = new Map(tarjetas.map((t) => [t.id, t.nombre]));
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Panel"
        descripcion="Estado general de tiendas, prospectos y seguimiento."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta={`Tiendas ${GRUPOS.abierta.toLowerCase()}`}
          valor={grupos.abierta}
          icono={Store}
          nota={`${grupos.ganada} operando · ${grupos.lateral} en pausa · ${grupos.perdida} cerradas`}
          href="/crm/tiendas"
        />
        <Kpi
          etiqueta="Prospectos"
          valor={prospectos.count ?? 0}
          icono={UsersRound}
          nota={`${sinEstado.count ?? 0} sin estado`}
          href="/crm/prospectos"
        />
        <Kpi
          etiqueta="Actividades vencidas"
          valor={vencidas.count ?? 0}
          icono={CircleAlert}
          tono={(vencidas.count ?? 0) > 0 ? 'pierde' : 'ok'}
          href="/crm/actividades?vista=vencidas"
        />
        <Kpi
          etiqueta="Tiendas por revisar"
          valor={porRevisar}
          icono={TriangleAlert}
          tono={porRevisar > 0 ? 'bajo' : 'ok'}
          nota="Datos de Zoho que no coincidían"
          href="/crm/tiendas"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Próximas actividades" descripcion="Siguientes 14 días" cuerpo={false}>
          {(proximas.data ?? []).length === 0 ? (
            <Vacio titulo="Sin actividades próximas" />
          ) : (
            <ul className="divide-y divide-line">
              {(proximas.data ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <CalendarClock size={15} aria-hidden="true" className="text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {a.asunto}
                    {a.tienda_id && nombreTienda.get(a.tienda_id) && (
                      <Link
                        href={`/crm/tiendas/${a.tienda_id}?tab=actividades`}
                        className="ml-1 text-muted-foreground underline"
                      >
                        {nombreTienda.get(a.tienda_id)}
                      </Link>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{fechaCorta(a.fecha_vencimiento!)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Arranques programados" descripcion="Siguientes 90 días" cuerpo={false}>
          {arranques.length === 0 ? (
            <Vacio titulo="Sin arranques programados" />
          ) : (
            <ul className="divide-y divide-line">
              {arranques.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Link
                    href={`/crm/tiendas/${t.id}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {t.nombre}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {fechaCorta(t.fecha_programada_arranque!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
