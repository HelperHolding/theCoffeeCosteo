import { notFound } from 'next/navigation';
import { sesionSucursales } from '@/lib/supabase/sesion';
import { resolverSucursal } from '@/lib/sucursales/acceso';
import { puedeCostear } from '@/lib/sucursales/costeo-servidor';
import { sucursalInfo } from '@/lib/sucursales/datos';
import { filtrosOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { Encabezado } from '@/components/portal/piezas';
import { SeccionesSucursal, type IdSeccion } from '@/components/sucursales/secciones';
import { periodoDeUrl } from '@/lib/sucursales/periodo';

export default async function Sucursal({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companias, db, perfil } = await sesionSucursales();
  const cfg = resolverSucursal((await params).companyId, companias);
  // Ajena, no configurada o inválida: mismo 404, sin revelar si existe.
  if (!cfg) notFound();
  const q = await searchParams;
  // La sección Costeo solo se ofrece con permiso (la API /costeo lo vuelve a exigir: 403).
  const costeo = await puedeCostear(db, cfg.companyId, perfil);
  const seccion: IdSeccion = q.seccion === 'costeo' || q.seccion === 'consumo' ? q.seccion : 'ventas';
  const busqueda = new URLSearchParams(
    Object.entries(q).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  return (
    <>
      <Encabezado
        titulo={cfg.nombre}
        migas={[{ href: '/sucursales', nombre: 'Sucursales' }]}
        descripcion={`${cfg.ubicacion ? `${cfg.ubicacion}, ` : ''}${cfg.ciudad} · tienda ${cfg.lookerStoreId} · ID API ${cfg.companyId}`}
      />
      <SeccionesSucursal
        sucursal={sucursalInfo(cfg)}
        puedeCostear={costeo}
        seccionInicial={seccion}
        tabInicial={q.tab ?? 'vivo'}
        origenInicial={
          (filtrosOrigen as string[]).includes(q.origen ?? '') ? (q.origen as FiltroOrigen) : 'todos'
        }
        periodoInicial={periodoDeUrl(busqueda, 'hoy')}
      />
    </>
  );
}
