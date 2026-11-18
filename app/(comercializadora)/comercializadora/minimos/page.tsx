import { Encabezado } from '@/components/portal/piezas';
import { Minimos } from '@/components/comercializadora/minimos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { hoyCdmx, masDias } from '@/lib/comercializadora/fechas';
import type { MinimoProveedor } from '@/lib/comercializadora/minimos';

export default async function MinimosPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [proveedores, ocs, sync] = await Promise.all([
    leerTodoCom<MinimoProveedor & { vendor_id: string }>(
      db,
      'com_zoho_proveedor',
      'vendor_id,nombre,minimo_compra,minimo_origen,minimo_editado_at,minimo_pendiente,minimo_error',
      'vendor_id',
    ),
    leerTodoCom<{ id: number; vendor_id: string | null; lineas: { bajo_minimo?: boolean }[] }>(
      db,
      'com_oc_auto',
      'id,vendor_id,lineas',
      'id',
      (q) => q.gte('fecha', masDias(hoyCdmx(), -30)),
    ),
    com(db)
      .from('com_sync_log')
      .select('resumen')
      .eq('proceso', 'zoho-sync')
      .eq('ok', true)
      .not('fin', 'is', null)
      .order('inicio', { ascending: false })
      .limit(1),
  ]);
  const ocsBajo: Record<string, number> = {};
  for (const o of ocs)
    if (o.vendor_id && o.lineas?.some((l) => l.bajo_minimo))
      ocsBajo[o.vendor_id] = (ocsBajo[o.vendor_id] ?? 0) + 1;
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Mínimos de proveedor"
        descripcion="Monto mínimo de compra por proveedor. Se guarda aquí y se envía a Zoho."
      />
      <Minimos
        proveedores={proveedores}
        ocsBajo={ocsBajo}
        minimoCampo={sync.data?.[0]?.resumen?.minimoCampo ?? null}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}
