import Link from 'next/link';
import { CalendarClock, CircleCheck, Lock, LockOpen } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { etapasGenerales, vencimientos } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { AREAS, cuando, tramos } from '@/lib/crm/unificado/modelo';
import { Encabezado, Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { BandejaAvisos } from '@/components/crm/unificado/avisos';
import type { CandadoCard, Historial } from '@/lib/crm/tipos';

/** Panel del día: cards por área y etapa, candados, vencimientos, avisos y movimientos recientes. */
export default async function PanelCrm() {
  // Cada página exige el acceso por sí misma: el layout no se vuelve a ejecutar al navegar.
  const { db, perfil, accesos } = await sesionCrm();
  // Avisos que ya entraron en su ventana (idempotente; pg_cron lo hace cada mañana).
  await db.rpc('crm_generar_avisos', {});
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [usuario, etapas, candados, liberados, recientes, { vencimientos: venc, avisos }] = await Promise.all(
    [
      usuarioCrm(db, perfil, accesos),
      etapasGenerales(db),
      db.from('crm_v_candados').select('etapa_id,total,listos,liberado').limit(20_000),
      db.from('crm_liberaciones').select('id', { count: 'exact', head: true }).gte('liberado_en', hace30),
      db
        .from('crm_historial')
        .select('*')
        .not('origen', 'in', '(importacion,zoho)')
        .order('fecha', { ascending: false })
        .limit(12),
      vencimientos(db),
    ],
  );
  const cs = (candados.data ?? []) as Pick<CandadoCard, 'etapa_id' | 'total' | 'listos' | 'liberado'>[];
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  const abiertas = cs.filter(
    (c) => etapaDe.get(c.etapa_id)?.tipo === 'abierta' && !etapaDe.get(c.etapa_id)?.provisional,
  );
  const bloqueadas = abiertas.filter((c) => !c.liberado && c.listos < c.total).length;
  const listas = abiertas.filter((c) => c.liberado || c.listos >= c.total).length;
  const porEtapa = new Map<string, number>();
  for (const c of cs) porEtapa.set(c.etapa_id, (porEtapa.get(c.etapa_id) ?? 0) + 1);
  const maximo = Math.max(1, ...[...porEtapa.values()]);
  const proximos = venc.filter((v) => v.dias <= 14).slice(0, 6);
  const todas = usuario.desarrollador || usuario.esHead;
  const misAvisos = avisos.filter((a) => !a.atendido_en && (todas || usuario.areas.includes(a.area)));
  const movimientos = (recientes.data ?? []) as Historial[];

  if (!cs.length)
    return (
      <>
        <Encabezado area="CRM Franquicias" titulo="Panel" />
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Aún no hay cards en el Pipeline">
            Registra el primer lead desde{' '}
            <Link href="/crm/pipeline" className="underline">
              Pipeline
            </Link>
            .
          </Vacio>
        </Tarjeta>
      </>
    );
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Panel"
        descripcion="El proceso de hoy: qué está bloqueado, qué vence y quién movió qué."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Bloqueadas"
          valor={bloqueadas.toLocaleString('es-MX')}
          icono={Lock}
          tono="sin-precio"
          href="/crm/pipeline"
          nota="les falta un requisito de su etapa"
        />
        <Kpi
          etiqueta="Listas para avanzar"
          valor={listas}
          icono={CircleCheck}
          tono="ok"
          href="/crm/pendientes"
          nota="todo validado"
        />
        <Kpi
          etiqueta="Candados liberados"
          valor={liberados.count ?? 0}
          icono={LockOpen}
          tono="bajo"
          href="/crm/bitacora?accion=candado_liberado"
          nota="últimos 30 días"
        />
        <Kpi
          etiqueta="Vencen en 14 días"
          valor={proximos.length}
          icono={CalendarClock}
          href="/crm/vencimientos"
          nota="COF, 5 días hábiles y 120 días"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Cards por etapa" descripcion="Color = área que mueve la etapa." cuerpo={false}>
          <div className="space-y-4 p-5">
            {tramos(etapas).map((t) => (
              <section key={t.clave}>
                <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{t.nombre}</h3>
                <ul role="list" className="space-y-1">
                  {t.etapas.map((e) => {
                    const n = porEtapa.get(e.id) ?? 0;
                    return (
                      <li
                        key={e.id}
                        className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
                      >
                        <Link
                          href={`/crm/pipeline?vista=tabla&etapa=${e.clave}`}
                          className="truncate hover:underline"
                        >
                          {e.numero ? `${e.numero} · ` : ''}
                          {e.nombre}
                        </Link>
                        <span className="h-2 rounded-full bg-surface-2" aria-hidden="true">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(n / maximo) * 100}%`,
                              minWidth: n ? 4 : 0,
                              background: AREAS[e.area].color,
                            }}
                          />
                        </span>
                        <span className="text-right tabular">{n.toLocaleString('es-MX')}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Tarjeta>
        <div className="space-y-4">
          <Tarjeta titulo="Avisos sin atender" cuerpo={false}>
            <BandejaAvisos avisos={misAvisos.slice(0, 5)} areas={usuario.areas} todas={todas} />
          </Tarjeta>
          <Tarjeta
            titulo="Próximos vencimientos"
            cuerpo={false}
            acciones={
              <Link href="/crm/vencimientos" className="text-xs font-semibold hover:underline">
                Ver todos
              </Link>
            }
          >
            {proximos.length ? (
              <ul role="list" className="divide-y divide-line">
                {proximos.map((v) => (
                  <li
                    key={`${v.tipo}-${v.tienda_id}`}
                    className="flex justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <Link
                      href={`/crm/sucursales/${v.tienda_id}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      {v.nombre}
                    </Link>
                    <span
                      className={
                        v.dias < 0 ? 'shrink-0 text-xs font-semibold text-bad' : 'shrink-0 text-xs text-warn'
                      }
                    >
                      {v.dias < 0 ? `venció hace ${-v.dias} d` : v.dias === 0 ? 'hoy' : `en ${v.dias} d`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nada vence en los próximos 14 días.</p>
            )}
          </Tarjeta>
        </div>
      </div>
      <Tarjeta
        titulo="Movimientos recientes"
        cuerpo={false}
        acciones={
          <Link href="/crm/bitacora" className="text-xs font-semibold hover:underline">
            Ver bitácora
          </Link>
        }
      >
        {movimientos.length ? (
          <ul role="list" className="divide-y divide-line">
            {movimientos.map((h) => (
              <li
                key={h.id}
                className="grid gap-0.5 px-5 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
              >
                <span className="min-w-0">{h.resumen}</span>
                <span className="text-xs text-muted-foreground">
                  {h.actor_nombre ?? 'Sistema'} · {cuando(h.fecha)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">Sin movimientos todavía.</p>
        )}
      </Tarjeta>
    </>
  );
}
