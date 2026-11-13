import { AlertTriangle } from 'lucide-react';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { Pagos } from '@/components/comercializadora/pagos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { edadHoras, leerTodoCom, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import type { PagoFila } from '@/lib/comercializadora/pagos';

export default async function PagosPagina() {
  const { db } = await sesionComercializadora();
  const proy = await ultimaProyeccion(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Pagos proyectados"
      descripcion="Lo que toca pagar a cada proveedor por las compras propuestas y las OCs abiertas."
    />
  );
  if (!proy)
    return (
      <>
        {encabezado}
        <Vacio titulo="Todavía no hay proyección">
          Se calcula todos los días a las 06:30 (hora de Ciudad de México).
        </Vacio>
      </>
    );
  const calc = proy.resumen.calculado_at!;
  const filas = await leerTodoCom<PagoFila & { id: number }>(db, 'com_pago_proyectado', '*', 'id', (q) =>
    q.eq('calculado_at', calc),
  );
  const incompleta = typeof proy.resumen.filas === 'number' && proy.resumen.filas !== filas.length;
  return (
    <>
      {encabezado}
      {edadHoras(calc) > 36 || incompleta ? (
        <p
          role="status"
          className="placa flex items-center gap-2 border-warn/40 bg-warn-soft px-4 py-3 text-sm"
        >
          <AlertTriangle size={16} aria-hidden="true" className="text-warn" />
          {incompleta
            ? 'La última proyección quedó incompleta: los montos pueden faltar.'
            : 'La proyección se calculó hace más de 36 horas.'}
        </p>
      ) : null}
      <Pagos
        filas={filas}
        hoy={hoyCdmx()}
        sinCosto={proy.resumen.sinCosto ?? []}
        sinProveedor={proy.resumen.sinProveedor ?? []}
      />
    </>
  );
}
