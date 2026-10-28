import { accesos, sesionSucursales } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { Marco, type ItemBusqueda } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function SucursalesLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil, companias } = await sesionSucursales();
  const busqueda: ItemBusqueda[] = sucursalesAccesibles(companias).map((s) => ({
    id: String(s.companyId),
    nombre: s.nombre,
    href: `/sucursales/${s.companyId}`,
    detalle: s.ciudad,
    icono: 'sucursal' as const,
  }));
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="sucursales"
      visibles={modulosVisibles(await accesos(db, perfil.user_id), perfil.rol)}
      busqueda={busqueda}
    >
      {children}
    </Marco>
  );
}
