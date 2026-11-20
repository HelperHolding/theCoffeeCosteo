import { accesos, sesion } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { redirect } from 'next/navigation';
import { Marco } from '@/components/portal/marco';
import '@/components/portal/vitrina.css';
export const dynamic = 'force-dynamic';
export default async function InicioLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil } = await sesion(undefined, true, { sinCosteo: true });
  const visibles = modulosVisibles(await accesos(db, perfil.user_id), perfil.rol);
  // Quien solo tiene Franquiciatarios (p. ej. la cuenta de baristas) entra directo a su sucursal.
  if (visibles.length === 1 && visibles[0] === 'franquiciatarios') redirect('/franquiciatarios');
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="inicio"
      visibles={visibles}
    >
      {/* Portada: las tarjetas de módulos son cristal sobre el muro (vitrina.css). */}
      <div className="vitrina space-y-7">{children}</div>
    </Marco>
  );
}
