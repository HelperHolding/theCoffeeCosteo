import { notFound } from 'next/navigation';
import { sesionSucursales } from '@/lib/supabase/sesion';
import { resolverSucursal } from '@/lib/sucursales/acceso';
import { sucursalInfo } from '@/lib/sucursales/datos';
import { filtrosOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { Encabezado } from '@/components/portal/piezas';
import { VentasPos } from '@/components/sucursales/ventas-pos';

export default async function Sucursal({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ tab?: string; origen?: string }>;
}) {
  const { companias } = await sesionSucursales();
  const cfg = resolverSucursal((await params).companyId, companias);
  // Ajena, no configurada o inválida: mismo 404, sin revelar si existe.
  if (!cfg) notFound();
  const { tab, origen } = await searchParams;
  return (
    <>
      <Encabezado
        titulo={cfg.nombre}
        migas={[{ href: '/sucursales', nombre: 'Sucursales' }]}
        descripcion={`Ventas POS · ${cfg.ciudad} · tienda ${cfg.lookerStoreId} · ID API ${cfg.companyId}`}
      />
      <VentasPos
        sucursal={sucursalInfo(cfg)}
        tabInicial={tab ?? 'vivo'}
        origenInicial={
          (filtrosOrigen as string[]).includes(origen ?? '') ? (origen as FiltroOrigen) : 'todos'
        }
      />
    </>
  );
}
