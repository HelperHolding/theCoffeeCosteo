// app/(comercializadora)/comercializadora/compras/page.tsx
import { Encabezado } from '@/components/portal/piezas';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leerDatosCompras } from '@/lib/comercializadora/compras/datos';
import { semDelMotor } from '@/lib/comercializadora/compras/motor';
import { filtrosDeUrl, textoFiltros, type ParamsCompras } from '@/lib/comercializadora/compras/filtros';
import { planCompra } from '@/lib/comercializadora/compras/plan';
import { estadoSync } from '@/lib/comercializadora/compras/sync';
import { armarTablero, faltanDatos } from '../../../../supabase/functions/_shared/compras/tablero.ts';
import { ErrorSeccion, SeccionTitulo } from '@/components/comercializadora/reporte-semanal/piezas';
import { FiltrosCompras } from '@/components/comercializadora/compras/filtros';
import { SincronizarCompras } from '@/components/comercializadora/compras/sincronizar';
import { IndicadoresCompras } from '@/components/comercializadora/compras/indicadores';
import { GraficaCompras } from '@/components/comercializadora/compras/grafica';
import { PlanCompraVista } from '@/components/comercializadora/compras/plan';
import { DetalleCompras } from '@/components/comercializadora/compras/detalle';

// «Sincronizar ahora» espera a la función (hasta ~80 s de lectura de Zoho).
export const maxDuration = 150;

export default async function ComprasPagina({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const editor = puedeEditarCom(accesos);
  const [{ datos, ultimaSync }, motor] = await Promise.all([leerDatosCompras(db), semDelMotor(db)]);
  const t = armarTablero(datos, filtrosDeUrl(await searchParams), hoy);
  const sync = estadoSync(ultimaSync, new Date());
  const encabezado = (
    <Encabezado area="Comercializadora" titulo="Compras"
      descripcion={`Venta, compras recibidas y entregas de proveedores · ${textoFiltros(t.filtros, t.periodo.etiqueta)}. Datos sincronizados desde Zoho Books.`}>
      <span className="text-sm text-ink-2">{sync.texto}</span>
      {editor && <SincronizarCompras />}
    </Encabezado>
  );
  if (faltanDatos(datos))
    return (<>{encabezado}<p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Todavía no hay datos de compras. La primera sincronización tarda varias corridas; vuelve en unos minutos.</p></>);
  const plan = motor.ok ? planCompra(motor.S, t.filtros, hoy) : null;
  return (
    <>
      {encabezado}
      {sync.viejo && !sync.nunca && <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">La última sincronización buena tiene más de 36 horas: las cifras pueden estar atrasadas.</p>}
      {t.sinDetalle.length > 0 && (
        <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Compras recibidas aproximadas: Zoho no dio el detalle de cada recepción de {t.sinDetalle.join(', ')}. Lo recibido de esas OCs se cuenta completo en su recepción más reciente, aunque haya llegado en varias semanas.
        </p>
      )}
      <FiltrosCompras filtros={t.filtros} opciones={t.opciones} />
      <SeccionTitulo num="01">Indicadores · {t.periodo.etiqueta}</SeccionTitulo>
      <IndicadoresCompras t={t} faltan={plan ? plan.faltan : null} />
      <SeccionTitulo num="02">Evolución</SeccionTitulo>
      <GraficaCompras serie={t.serie} />
      <SeccionTitulo num="03">Plan de compra · Plan de abastos</SeccionTitulo>
      {plan ? <PlanCompraVista plan={plan} porLlegar={t.porLlegar} /> : <ErrorSeccion error={motor.ok ? '' : motor.error} />}
      <SeccionTitulo num="04">Detalle</SeccionTitulo>
      <DetalleCompras t={t} />
      <p className="mt-8 border-t border-line pt-4 text-center text-xs text-muted-foreground">
        Compras = mercancía de órdenes de compra recibida; no pagos. Venta y compras con IVA. Los meses suman las semanas que empiezan en ese mes. OCs en borrador y de registro no cuentan como elaboradas.
      </p>
    </>
  );
}
