import { Encabezado } from '@/components/portal/piezas';
import { Doh } from '@/components/comercializadora/doh';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { indicadoresMotor, motorPlan } from '@/lib/comercializadora/motor';
import { estadoInicial } from '@/lib/comercializadora/doh';

export default async function DohPagina({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { db } = await sesionComercializadora();
  const sp = await searchParams;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="DOH — días de inventario"
      descripcion="¿Alcanza el inventario hasta que llegue una compra nueva? Con las OCs en camino."
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
  const r = indicadoresMotor(m).riesgo;
  return (
    <>
      {encabezado}
      {m.R.avisos.length ? (
        <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
        </p>
      ) : null}
      <Doh
        filas={r.filas}
        conteos={{
          pedir: r.pedir,
          confirmar: r.confirmar,
          cubierto: r.cubierto,
          pronto: r.pronto,
          ok: r.ok,
          sinventa: r.sinventa,
        }}
        ventana={m.cfg.consumo.ventana}
        inicial={estadoInicial(sp.estado)}
      />
    </>
  );
}
