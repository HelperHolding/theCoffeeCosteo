import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas } from '@/lib/franquiciatarios/servidor';
import { diaOperacion } from '@/lib/franquiciatarios/dia';
import type { MomentoConteo } from '@/lib/franquiciatarios/tipos';
import { Encabezado } from '@/components/portal/piezas';
import { ConteoFranq } from '@/components/franquiciatarios/conteo';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaLargo } from '@/components/franquiciatarios/formato';

export const dynamic = 'force-dynamic';

/** Conteo de insumos críticos del día (apertura o medio turno). Todos los roles cuentan; las cantidades solo las ve la gerencia. */
export default async function PaginaConteo({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ momento?: string }>;
}) {
  const c = await contextoSucursal(params);
  const q = await searchParams;
  const momento: MomentoConteo = q.momento === 'medio' ? 'medio' : 'apertura';
  const hoy = diaOperacion();
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Conteo de insumos"
      descripcion={
        <span className="first-letter:uppercase">
          {diaLargo(hoy)} · se cuenta en la apertura y a medio turno. Si de algo no hay, escribe 0.
        </span>
      }
    />
  );
  const baristas = c.rol === 'barista' ? await leerBaristas(c.db, c.companyId) : [];
  const elegido = c.rol === 'barista' ? await baristaElegido(baristas, c.companyId) : null;
  if (c.rol === 'barista' && !elegido)
    return (
      <>
        {encabezado}
        <QuienEres companyId={c.companyId} nombres={baristas.filter((b) => b.activo)} />
      </>
    );
  const [insumos, estados] = await Promise.all([
    c.db
      .from('franq_insumos')
      .select('id,nombre,unidad,orden')
      .eq('company_id', c.companyId)
      .eq('activo', true)
      .order('orden'),
    c.db.rpc('franq_conteo_estado', { p_company: c.companyId, p_dia: hoy }),
  ]);
  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      {insumos.error || estados.error ? (
        <p className="aviso">No se pudo leer la lista de insumos. Intenta de nuevo.</p>
      ) : (
        <ConteoFranq
          key={momento}
          companyId={c.companyId}
          momento={momento}
          insumos={insumos.data ?? []}
          estados={estados.data ?? []}
          gestor={c.gestor}
        />
      )}
    </>
  );
}
