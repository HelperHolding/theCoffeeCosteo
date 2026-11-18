import { Encabezado } from '@/components/portal/piezas';
import { DetalleKpiVista, ParametrosKpi, TarjetasKpi } from '@/components/comercializadora/indicadores';
import { MetasKpi } from '@/components/comercializadora/metas-kpi';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { indicadoresMotor, memoMotor, motorPlan } from '@/lib/comercializadora/motor';
import { com } from '@/lib/comercializadora/consultas';
import {
  conRevisionOcSync,
  esDetalle,
  kpiAbCalc,
  kpiAbEstados,
  kpiAbTraza,
  kpiAbVentanas,
} from '@/lib/comercializadora/indicadores';

export default async function IndicadoresPagina({
  searchParams,
}: {
  searchParams: Promise<{ detalle?: string; traza?: string }>;
}) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Indicadores de abasto"
      descripcion="Forecast, compras e inventario con los mismos datos y la misma configuración del plan. Responsable: Compras / Dirección de Supply."
    >
      <ActualizarMotor />
    </Encabezado>
  );
  if (!m.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {m.error}
        </p>
      </>
    );
  // Decisión 12: la revisión de OCs usa la última corrida buena de zoho-sync (copia: K vive en la caché compartida).
  const sync = await com(db)
    .from('com_sync_log')
    .select('inicio')
    .eq('proceso', 'zoho-sync')
    .eq('ok', true)
    .order('inicio', { ascending: false })
    .limit(1);
  const K = conRevisionOcSync(indicadoresMotor(m), sync.data?.[0]?.inicio ?? null, Date.now());
  const E = kpiAbEstados(K);
  const detalle = esDetalle(sp.detalle) ? sp.detalle : null;
  // Las otras ventanas (14 y 21 días) son dos cálculos completos más: solo cuando se abre el detalle del forecast.
  const ventanas =
    detalle === 'fc'
      ? kpiAbVentanas(m.R, m.cfg, Date.now(), (R, c, t) =>
          memoMotor({ R, cfg: c }, 'kpi', () => kpiAbCalc(R, c, t)),
        )
      : [];
  const traza = detalle === 'fc' && sp.traza ? kpiAbTraza(m.R, K, sp.traza) : null;
  return (
    <>
      {encabezado}
      <div className="space-y-5">
        {m.R.avisos.length ? (
          <p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            No se pudieron leer: {m.R.avisos.join(', ')}. Los indicadores pueden salir incompletos.
          </p>
        ) : null}
        <TarjetasKpi K={K} E={E} />
        <ParametrosKpi params={K.params} />
        {detalle ? <DetalleKpiVista K={K} E={E} detalle={detalle} ventanas={ventanas} traza={traza} /> : null}
        <MetasKpi metas={K.metas} version={m.version} editable={puedeEditarCom(accesos)} />
      </div>
    </>
  );
}
