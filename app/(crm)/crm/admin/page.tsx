import { sesionCrm } from '@/lib/supabase/sesion';
import { etapasGenerales, nombres } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { Festivos, Membresias, Requisitos } from '@/components/crm/unificado/admin';
import { VistaAdmin } from '@/components/crm/unificado/vistas/admin';
import type { Festivo, Membresia, Requisito } from '@/lib/crm/tipos';

/** Administración del CRM: usuarios por área, requisitos por etapa y festivos (heads y desarrolladores). */
export default async function Administracion({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { db, perfil, accesos } = await sesionCrm();
  const usuario = await usuarioCrm(db, perfil, accesos);
  if (!usuario.desarrollador && !usuario.esHead)
    return (
      <>
        <Encabezado area="CRM Franquicias" titulo="Administración" />
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Solo para heads y desarrolladores">
            Pide a tu head cualquier cambio de etapas, requisitos o festivos.
          </Vacio>
        </Tarjeta>
      </>
    );
  const [accesosCrm, membresias, requisitos, festivos, etapas] = await Promise.all([
    db.from('perfil_modulos').select('user_id,nivel').eq('modulo', 'crm'),
    db.from('crm_membresias').select('*'),
    db.from('crm_requisitos').select('*').order('orden'),
    db.from('crm_festivos').select('*').order('fecha'),
    etapasGenerales(db),
  ]);
  const filas = (accesosCrm.data ?? []) as { user_id: string; nivel: string }[];
  const quien = await nombres(
    db,
    filas.map((f) => f.user_id),
  );
  const personas = filas
    .map((f) => ({ user_id: f.user_id, nivel: f.nivel, nombre: quien.get(f.user_id) ?? 'Usuario' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const ms = (membresias.data ?? []) as Membresia[];
  const fs = (festivos.data ?? []) as Festivo[];
  const orden = new Map(etapas.map((e) => [e.id, e.orden]));
  const reqs = ((requisitos.data ?? []) as Requisito[]).sort(
    (a, b) => (orden.get(a.etapa_id) ?? 0) - (orden.get(b.etapa_id) ?? 0) || a.orden - b.orden,
  );
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Administración"
        descripcion="Usuarios por área, requisitos por etapa y festivos. Cada cambio queda en la bitácora."
      />
      <VistaAdmin
        personas={personas}
        membresias={ms}
        requisitosActivos={reqs.filter((r) => r.activo).length}
        requisitosTotal={reqs.length}
        festivosAnio={fs.filter((f) => f.fecha.startsWith(String(new Date().getFullYear()))).length}
        pestana={tab}
        usuarios={
          <Tarjeta
            titulo="Usuarios por área"
            descripcion="Heads: Andrés (Legal), Luis (Ventas) y Diego (Proyectos)."
            cuerpo={false}
          >
            <Membresias personas={personas} membresias={ms} puede={usuario.desarrollador} />
          </Tarjeta>
        }
        requisitos={
          <Tarjeta
            titulo="Requisitos por etapa"
            descripcion="Marca si un requisito es candado (bloquea avanzar) o solo aviso, o desactívalo."
            cuerpo={false}
          >
            <Requisitos requisitos={reqs} etapas={etapas} puede />
          </Tarjeta>
        }
        festivos={
          <Tarjeta
            titulo="Festivos"
            descripcion="Se saltan al contar los 5 días hábiles antes de una apertura."
            cuerpo={false}
          >
            <Festivos festivos={fs} puede />
          </Tarjeta>
        }
      />
    </>
  );
}
