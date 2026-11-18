import { Encabezado } from '@/components/portal/piezas';
import { Traspasos } from '@/components/comercializadora/traspasos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { agruparTraspasos, type MovTraspaso } from '@/lib/comercializadora/traspasos';

export default async function TraspasosPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [filas, catalogo] = await Promise.all([
    leerTodoCom<MovTraspaso>(
      db,
      'com_movimientos',
      'id,folio,fecha,sku,cantidad,cantidad_original,origen,destino,estado',
      'id',
      (q) => q.eq('tipo', 'traspaso'),
    ),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku', (q) =>
      q.neq('estatus', 'Inactivo'),
    ),
  ]);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Traspasos"
        descripcion="Mercancía entre el CEDIS y el 3PL. Al ingresar a 3PL se suma a su saldo; el CEDIS se registra en Zoho."
      />
      <Traspasos
        grupos={agruparTraspasos(filas)}
        catalogo={catalogo}
        editable={puedeEditarCom(accesos)}
        hoy={hoyCdmx()}
      />
    </>
  );
}
