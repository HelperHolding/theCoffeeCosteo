import { accesos } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { configDe } from '@/lib/sucursales/config';
import { Marco, type ItemBusqueda } from '@/components/portal/marco';
import type { Franquicia } from '@/components/portal/navegacion';
import type { sesionFranquiciatarios } from '@/lib/supabase/sesion';

type Sesion = Awaited<ReturnType<typeof sesionFranquiciatarios>>;

/** Marco del portal para Franquiciatarios: navegación de la sucursal abierta y búsqueda entre las suyas. */
export async function MarcoFranq({
  s,
  franquicia,
  children,
}: {
  s: Sesion;
  franquicia?: Franquicia;
  children: React.ReactNode;
}) {
  const busqueda: ItemBusqueda[] = [...s.sucursales.keys()]
    .map(configDe)
    .filter((c) => c !== null)
    .map((c) => ({
      id: String(c.companyId),
      nombre: c.nombre,
      href: `/franquiciatarios/${c.companyId}`,
      detalle: c.ciudad,
      icono: 'sucursal' as const,
    }));
  return (
    <Marco
      key={s.perfil.user_id}
      perfil={{ nombre: s.perfil.nombre, rol: s.perfil.rol }}
      seccion="franquiciatarios"
      visibles={modulosVisibles(await accesos(s.db, s.perfil.user_id), s.perfil.rol)}
      busqueda={s.sucursales.size > 1 ? busqueda : []}
      franquicia={franquicia}
      marca={s.admin && s.verComo !== 'admin' ? 'thecoffee' : undefined}
    >
      <div className="space-y-7">{children}</div>
    </Marco>
  );
}
