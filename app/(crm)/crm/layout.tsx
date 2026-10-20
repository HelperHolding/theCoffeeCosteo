import { sesionCrm } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { leerTodo } from '@/lib/crm/consultas';
import { Marco, type ItemBusqueda } from '@/components/portal/marco';
export const dynamic = 'force-dynamic';
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil, accesos } = await sesionCrm();
  // Búsqueda Ctrl K: tiendas y contactos (pocos). Los prospectos se buscan en su lista paginada.
  const [tiendas, contactos] = await Promise.all([
    leerTodo<{ id: string; nombre: string; ciudad: string | null }>(
      db,
      'crm_tiendas',
      'id,nombre,ciudad',
      (q) => q.is('archivado_en', null),
    ),
    leerTodo<{ id: string; nombre: string | null; apellidos: string; franquiciatario: string | null }>(
      db,
      'crm_contactos',
      'id,nombre,apellidos,franquiciatario',
      (q) => q.is('archivado_en', null),
    ),
  ]);
  const busqueda: ItemBusqueda[] = [
    ...tiendas.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      href: `/crm/tiendas/${t.id}`,
      detalle: t.ciudad ?? 'Tienda',
      icono: 'tienda' as const,
    })),
    ...contactos.map((c) => ({
      id: c.id,
      nombre: [c.nombre, c.apellidos].filter(Boolean).join(' '),
      href: `/crm/contactos/${c.id}`,
      detalle: c.franquiciatario ?? 'Contacto',
      icono: 'contacto' as const,
    })),
  ];
  return (
    <Marco
      key={perfil.user_id}
      perfil={{ nombre: perfil.nombre, rol: perfil.rol }}
      seccion="crm"
      visibles={modulosVisibles(accesos)}
      busqueda={busqueda}
    >
      {children}
    </Marco>
  );
}
