import { sesionCrm } from '@/lib/supabase/sesion';
import { modulosVisibles } from '@/lib/portal/modulos';
import { leerTodo } from '@/lib/crm/consultas';
import { Marco, type ItemBusqueda } from '@/components/portal/marco';
// Mismo cristal sobre el muro que Sucursales (propuesta «vitrina»).
import '../../(sucursales)/sucursales/vitrina.css';
export const dynamic = 'force-dynamic';
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { db, perfil, accesos } = await sesionCrm();
  // Búsqueda Ctrl K: tiendas y contactos (pocos). Los prospectos se buscan en su lista paginada.
  const [tiendas, contactos, franquiciatarios] = await Promise.all([
    leerTodo<{ id: string; nombre: string; ciudad: string | null; embudo: string }>(
      db,
      'crm_tiendas',
      'id,nombre,ciudad,embudo',
      (q) => q.is('archivado_en', null),
    ),
    leerTodo<{ id: string; nombre: string | null; apellidos: string; franquiciatario: string | null }>(
      db,
      'crm_contactos',
      'id,nombre,apellidos,franquiciatario',
      (q) => q.is('archivado_en', null),
    ),
    // Solo los formalizados (pocos): los leads en proceso se buscan en el Pipeline.
    leerTodo<{ id: string; nombre: string; ciudad_interes: string | null }>(
      db,
      'crm_franquiciatarios',
      'id,nombre,ciudad_interes',
      (q) => q.is('archivado_en', null).not('formalizado_en', 'is', null),
    ),
  ]);
  const busqueda: ItemBusqueda[] = [
    ...franquiciatarios.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      href: `/crm/franquiciatarios/${f.id}`,
      detalle: f.ciudad_interes ? `Franquiciatario · ${f.ciudad_interes}` : 'Franquiciatario',
      icono: 'contacto' as const,
    })),
    ...tiendas.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      href: t.embudo === 'general' ? `/crm/sucursales/${t.id}` : `/crm/tiendas/${t.id}`,
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
      visibles={modulosVisibles(accesos, perfil.rol)}
      busqueda={busqueda}
    >
      <div className="vitrina space-y-6">{children}</div>
    </Marco>
  );
}
