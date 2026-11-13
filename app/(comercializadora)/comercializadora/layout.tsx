import { sesionComercializadora } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Marco } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';

export default async function ComercializadoraLayout({ children }: { children: React.ReactNode }) {
  const { perfil, accesos } = await sesionComercializadora();
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="comercializadora"
      visibles={modulosVisibles(accesos, perfil.rol)}
    >
      <div className="space-y-7">{children}</div>
    </Marco>
  );
}
