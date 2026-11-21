import 'server-only';
import { leerBaristas, type Db } from './servidor';
import { sumarDias } from './dia';
import { armarSemana, type SemanaRoles } from './roles';

/** Semana de roles desde `lunes`, con la sesión del usuario (RLS: miembros de la sucursal). null = error de lectura. */
export async function leerSemanaRoles(db: Db, companyId: number, lunes: string): Promise<SemanaRoles | null> {
  try {
    const [turnos, posiciones, asignaciones, baristas] = await Promise.all([
      db.from('franq_turnos').select('*').eq('company_id', companyId),
      db.from('franq_posiciones').select('*').eq('company_id', companyId),
      db
        .from('franq_asignaciones')
        .select('*')
        .eq('company_id', companyId)
        .gte('dia', lunes)
        .lte('dia', sumarDias(lunes, 6)),
      leerBaristas(db, companyId),
    ]);
    if (turnos.error || posiciones.error || asignaciones.error) return null;
    return armarSemana(lunes, turnos.data ?? [], posiciones.data ?? [], asignaciones.data ?? [], baristas);
  } catch {
    return null;
  }
}
