import { accesos, sesionAnalytics } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil } = await sesionAnalytics();
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="analytics"
      visibles={modulosVisibles(await accesos(db, perfil.user_id), perfil.rol)}
    >
      {children}
    </Marco>
  );
}
