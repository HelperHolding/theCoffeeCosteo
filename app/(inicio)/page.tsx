import { accesos, sesion } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { Dashboard } from '@/components/inicio/dashboard';

/**
 * Inicio: resumen de los módulos que el usuario puede ver (los módulos viven en el panel izquierdo). Cada bloque lee
 * con el permiso de su módulo y carga por su cuenta (Suspense), así que la página aparece de inmediato.
 */
export default async function Inicio() {
  const { db, perfil } = await sesion(undefined, true, { sinCosteo: true });
  const visibles = modulosVisibles(await accesos(db, perfil.user_id), perfil.rol);
  return <Dashboard nombre={perfil.nombre.split(' ')[0]} visibles={visibles} />;
}
