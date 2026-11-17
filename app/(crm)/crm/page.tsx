import Link from 'next/link';
import { after } from 'next/server';
import { sesionCrm } from '@/lib/supabase/sesion';
import { candadosTodos, etapasGenerales, vencimientos } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { VistaPanel } from '@/components/crm/unificado/vistas/panel';
import type { Historial } from '@/lib/crm/tipos';

/** Panel del día: cards por área y etapa, candados, vencimientos, avisos y movimientos recientes. */
export default async function PanelCrm() {
  // Cada página exige el acceso por sí misma: el layout no se vuelve a ejecutar al navegar.
  const { db, perfil, accesos } = await sesionCrm();
  // Avisos que ya entraron en su ventana (idempotente; pg_cron lo hace cada mañana a las 7:00). Corre después de
  // responder para no frenar la página (~0.7 s): lo nuevo aparece en la siguiente visita.
  after(async () => {
    await db.rpc('crm_generar_avisos', {});
  });
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [usuario, etapas, cs, liberados, recientes, { vencimientos: venc, avisos }] = await Promise.all([
    usuarioCrm(db, perfil, accesos),
    etapasGenerales(db),
    candadosTodos(db, ['etapa_id', 'total', 'listos', 'liberado', 'carril_total', 'carril_listos'] as const),
    db.from('crm_liberaciones').select('id', { count: 'exact', head: true }).gte('liberado_en', hace30),
    db
      .from('crm_historial')
      .select('*')
      .not('origen', 'in', '(importacion,zoho)')
      .order('fecha', { ascending: false })
      .limit(8),
    vencimientos(db),
  ]);
  const enCarril = cs.filter((c) => c.carril_total > 0);
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  const abiertas = cs.filter(
    (c) => etapaDe.get(c.etapa_id)?.tipo === 'abierta' && !etapaDe.get(c.etapa_id)?.provisional,
  );
  const porEtapa: Record<string, number> = {};
  for (const c of cs) porEtapa[c.etapa_id] = (porEtapa[c.etapa_id] ?? 0) + 1;
  const todas = usuario.desarrollador || usuario.esHead;

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
      <VistaPanel
        etapas={etapas}
        porEtapa={porEtapa}
        candados={{
          bloqueadas: abiertas.filter((c) => !c.liberado && c.listos < c.total).length,
          listas: abiertas.filter((c) => !c.liberado && c.listos >= c.total).length,
          liberadas: abiertas.filter((c) => c.liberado).length,
        }}
        liberados30={liberados.count ?? 0}
        proximos={venc.filter((v) => v.dias <= 14)}
        avisos={avisos.filter((a) => !a.atendido_en && (todas || usuario.areas.includes(a.area)))}
        areas={usuario.areas}
        todas={todas}
        movimientos={(recientes.data ?? []) as Historial[]}
        carril={{
          total: enCarril.length,
          completos: enCarril.filter((c) => c.carril_listos >= c.carril_total).length,
        }}
      />
    </>
  );
}
