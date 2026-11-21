import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { leerBaristas } from '@/lib/franquiciatarios/servidor';
import { leerSemanaRoles } from '@/lib/franquiciatarios/roles-servidor';
import { lunesDe } from '@/lib/franquiciatarios/roles';
import { diaOperacion, esFecha } from '@/lib/franquiciatarios/dia';
import { Encabezado } from '@/components/portal/piezas';
import { RolesGestor, RolesHoy } from '@/components/franquiciatarios/roles';

export const dynamic = 'force-dynamic';

/** Matriz de roles por posición: la gerencia arma la semana; la cuenta de baristas ve quién está hoy en qué posición. */
export default async function PaginaRoles({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ semana?: string }>;
}) {
  const c = await contextoSucursal(params);
  const q = await searchParams;
  const hoy = diaOperacion();
  const lunes = lunesDe(c.gestor && esFecha(q.semana) ? q.semana : hoy);
  const [semana, baristas] = await Promise.all([
    leerSemanaRoles(c.db, c.companyId, lunes),
    c.gestor ? leerBaristas(c.db, c.companyId) : Promise.resolve([]),
  ]);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo={c.gestor ? 'Roles por posición' : 'Roles de hoy'}
        descripcion={
          c.gestor
            ? 'Quién cubre cada posición de la barra en cada turno, día por día.'
            : 'Quién está en cada posición de la barra en cada turno.'
        }
      />
      {!semana ? (
        <p className="aviso">No se pudieron leer los roles. Intenta de nuevo.</p>
      ) : c.gestor ? (
        <RolesGestor companyId={c.companyId} semana={semana} baristas={baristas} hoy={hoy} />
      ) : (
        <RolesHoy semana={semana} hoy={hoy} />
      )}
    </>
  );
}
