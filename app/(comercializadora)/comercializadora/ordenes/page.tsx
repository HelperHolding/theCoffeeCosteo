import { ClipboardList, Clock } from 'lucide-react';
import { Encabezado, Kpi } from '@/components/portal/piezas';
import { Ordenes } from '@/components/comercializadora/ordenes';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { agruparOcs, resumenOcs, type MovCompra } from '@/lib/comercializadora/ordenes';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { pesos } from '@/lib/comercializadora/formato';

const ESTADOS = ['emitida', 'parcial', 'recibida'];

export default async function OrdenesPagina({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; mes?: string }>;
}) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const hoy = hoyCdmx();
  const [movs, proveedores, catalogo, sync] = await Promise.all([
    leerTodoCom<MovCompra>(
      db,
      'com_movimientos',
      'id,folio,fecha,sku,cantidad,cantidad_recibida,monto,destino,fecha_arribo,proveedor,estado',
      'id',
      (q) => q.eq('tipo', 'compra'),
    ),
    leerTodoCom<{ vendor_id: string; nombre: string | null }>(
      db,
      'com_zoho_proveedor',
      'vendor_id,nombre',
      'vendor_id',
    ),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku', (q) =>
      q.neq('estatus', 'Inactivo'),
    ),
    com(db)
      .from('com_sync_log')
      .select('inicio,ok')
      .eq('proceso', 'zoho-sync')
      .order('inicio', { ascending: false })
      .limit(1),
  ]);
  const k = resumenOcs(movs, hoy);
  const estado = ESTADOS.includes(sp.estado ?? '') ? sp.estado : undefined;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes : undefined;
  const grupos = agruparOcs(movs).filter(
    (g) => (!estado || g.estado === estado) && (!mes || String(g.fecha).startsWith(mes)),
  );
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Órdenes de compra"
        descripcion="OCs de la plataforma y su recepción. Zoho las concilia cada 30 minutos."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          etiqueta="OCs abiertas (por recibir)"
          valor={k.abiertas}
          nota={pesos(k.montoAbiertas)}
          icono={ClipboardList}
        />
        <Kpi
          etiqueta="Atrasadas"
          valor={k.atrasadas}
          nota={
            k.atrasadas
              ? `${pesos(k.montoAtrasadas)} con fecha de arribo vencida`
              : 'Ninguna con fecha de arribo vencida'
          }
          icono={Clock}
          tono={k.atrasadas ? 'pierde' : 'ok'}
        />
      </div>
      <Ordenes
        grupos={grupos}
        estado={estado}
        mes={mes}
        proveedores={proveedores.map((p) => p.nombre ?? p.vendor_id).sort((a, b) => a.localeCompare(b, 'es'))}
        catalogo={catalogo}
        ultimoSync={sync.data?.[0]?.inicio ?? null}
        editable={puedeEditarCom(accesos)}
        hoy={hoy}
      />
    </>
  );
}
