import 'server-only';
import type { Db } from '../../portal/consultas';
import type { Accesos } from '../../portal/modulos';
import { puedeEditarCrm } from '../../portal/modulos';
import { misAreas } from './consultas';
import type { UsuarioCrm } from '@/components/crm/unificado/expediente';

/** Quién es el usuario en el CRM Unificado: áreas, head, funciones. Solo decide qué botones mostrar. */
export async function usuarioCrm(
  db: Db,
  perfil: { user_id: string; nombre: string },
  accesos: Accesos,
): Promise<UsuarioCrm> {
  const m = await misAreas(db, perfil.user_id);
  return {
    id: perfil.user_id,
    nombre: perfil.nombre,
    areas: m.claves,
    funciones: m.funciones,
    esHead: m.esHead,
    desarrollador: accesos.crm === 'desarrollador',
    editable: puedeEditarCrm(accesos),
  };
}
