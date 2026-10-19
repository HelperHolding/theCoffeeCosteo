import { sesionCrm } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { perfil, accesos } = await sesionCrm();
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="crm"
      visibles={modulosVisibles(accesos)}
    >
      {children}
    </Marco>
  );
}
