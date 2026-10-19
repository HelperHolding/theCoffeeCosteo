import { accesos, sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil } = await sesion();
  const [filas, a] = await Promise.all([todas(db, 'recetas', 'nombre,id'), accesos(db, perfil.user_id)]);
  const recetas = filas
    .filter((r) => r.activo)
    .map(({ id, nombre, tipo }) => ({
      id,
      nombre,
      href: `/${tipo === 'producto' ? 'productos' : 'subrecetas'}/${id}`,
      detalle: tipo === 'producto' ? 'Producto' : 'Sub-receta',
      icono: tipo === 'producto' ? ('producto' as const) : ('subreceta' as const),
    }));
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="costeo"
      visibles={modulosVisibles(a)}
      busqueda={recetas}
    >
      {children}
    </Marco>
  );
}
