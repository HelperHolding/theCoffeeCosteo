import { accesos, sesion } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function InicioLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil } = await sesion(undefined, true, { sinCosteo: true });
  const visibles = modulosVisibles(await accesos(db, perfil.user_id), perfil.rol);
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="inicio"
      visibles={visibles}
    >
      {children}
    </Marco>
  );
}
