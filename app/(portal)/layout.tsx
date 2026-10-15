import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil } = await sesion();
  const recetas = (await todas(db, 'recetas', 'nombre,id'))
    .filter((r) => r.activo)
    .map(({ id, nombre, tipo }) => ({ id, nombre, tipo }));
  return (
    <Marco key={perfil.user_id} perfil={{ nombre: perfil.nombre, rol: perfil.rol }} recetas={recetas}>
      {children}
    </Marco>
  );
}
