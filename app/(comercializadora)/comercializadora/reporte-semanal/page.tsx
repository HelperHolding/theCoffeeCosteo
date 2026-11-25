// app/(comercializadora)/comercializadora/reporte-semanal/page.tsx
import Link from 'next/link';
import { Encabezado } from '@/components/portal/piezas';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { hoyCdmx, fechaCorta } from '@/lib/comercializadora/fechas';
import { leerReporteSemanal, semanaDeUrl } from '@/lib/comercializadora/reporteSemanal';
import { com } from '@/lib/comercializadora/consultas';
import { finSemana, sumar } from '../../../../supabase/functions/_shared/reporte/fechas.ts';
import { normalizarConfigReporte } from '../../../../supabase/functions/_shared/reporte/config.ts';
import { ActualizarReporte } from '@/components/comercializadora/reporte-semanal/actualizar';
import { ErrorSeccion, SeccionTitulo } from '@/components/comercializadora/reporte-semanal/piezas';
import { VentasVista } from '@/components/comercializadora/reporte-semanal/ventas';
import { SurtidoVista } from '@/components/comercializadora/reporte-semanal/surtido';
import { AperturasVista, AtencionVista, NotasVista } from '@/components/comercializadora/reporte-semanal/atencion';
import { ExternosVista, SucursalesVista } from '@/components/comercializadora/reporte-semanal/saldos';

// Lectura en vivo de Zoho (hasta 150 s) y su acción «Actualizar»: la guía de Next aplica maxDuration de la página a sus Server Actions.
export const maxDuration = 300;

export default async function ReporteSemanalPagina({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const { db } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const semana = semanaDeUrl((await searchParams).semana, hoy);
  const [r, cfgR] = await Promise.all([
    leerReporteSemanal(semana),
    com(db).from('com_reporte_config').select('config').eq('id', 1).maybeSingle(),
  ]);
  const cfg = normalizarConfigReporte(cfgR.data?.config);
  const siguiente = sumar(semana, 7);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Reporte semanal"
      descripcion={`Ventas y supply chain del ${fechaCorta(semana)} al ${fechaCorta(finSemana(semana))}, en vivo desde Zoho Books.`}
    >
      <nav aria-label="Semana" className="flex items-center gap-3 text-sm">
        <Link href={`?semana=${sumar(semana, -7)}`} className="underline">‹ Anterior</Link>
        {siguiente <= hoy && <Link href={`?semana=${siguiente}`} className="underline">Siguiente ›</Link>}
      </nav>
      <ActualizarReporte semana={semana} />
    </Encabezado>
  );
  if (!r.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{r.error}</p>
      </>
    );
  const x = r.reporte;
  return (
    <>
      {encabezado}
      {r.aviso && <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{r.aviso}</p>}
      {x.sinClasificar.length > 0 && (
        <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Valores de Zoho sin clasificar (se cuentan aparte): {x.sinClasificar.join('; ')}.
        </p>
      )}
      <SeccionTitulo num="01">Ventas de la semana</SeccionTitulo>
      {x.ventas.ok ? <VentasVista v={x.ventas.datos} /> : <ErrorSeccion error={x.ventas.error} />}
      <SeccionTitulo num="02">Calidad de surtido</SeccionTitulo>
      {x.surtido.ok ? <SurtidoVista s={x.surtido.datos} /> : <ErrorSeccion error={x.surtido.error} />}
      <SeccionTitulo num="03">Atención al cliente · incidencias abiertas</SeccionTitulo>
      {x.atencion.ok ? <AtencionVista a={x.atencion.datos} /> : <ErrorSeccion error={x.atencion.error} />}
      <SeccionTitulo num="04">Notas de crédito · saldos sucursales propias</SeccionTitulo>
      <div className="grid gap-3 lg:grid-cols-2">
        {x.notas.ok ? <NotasVista n={x.notas.datos} /> : <ErrorSeccion error={x.notas.error} />}
        {x.sucursales.ok ? <SucursalesVista s={x.sucursales.datos} excluidas={cfg.excluir_saldos_sucursales} /> : <ErrorSeccion error={x.sucursales.error} />}
      </div>
      <SeccionTitulo num="05">Saldos pendientes · clientes externos</SeccionTitulo>
      {x.externos.ok ? <ExternosVista e={x.externos.datos} corte={x.corte} /> : <ErrorSeccion error={x.externos.error} />}
      <SeccionTitulo num="06">Aperturas · seguimiento</SeccionTitulo>
      {x.aperturas.ok ? <AperturasVista a={x.aperturas.datos} /> : <ErrorSeccion error={x.aperturas.error} />}
      <p className="mt-8 border-t border-line pt-4 text-center text-xs text-muted-foreground">
        Leído de Zoho el {new Date(x.leidoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
        {r.cache ? ' (copia de menos de 15 min)' : ''}. Las incidencias se capturan días después de la entrega; estas cifras pueden moverse.
      </p>
    </>
  );
}
