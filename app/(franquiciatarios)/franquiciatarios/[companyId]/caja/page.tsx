import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas } from '@/lib/franquiciatarios/servidor';
import { diaOperacion, esFecha } from '@/lib/franquiciatarios/dia';
import { leerCaja } from '@/lib/franquiciatarios/caja-servidor';
import { Encabezado } from '@/components/portal/piezas';
import { ArqueoCaptura, CajaChica, ConfigCaja, ResumenCaja } from '@/components/franquiciatarios/caja';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaLargo } from '@/components/franquiciatarios/formato';

export const dynamic = 'force-dynamic';

/**
 * Caja: arqueo ciego (todos los roles, solo hoy) y, para la gerencia, el cuadre contra el POS, la caja chica y la
 * configuración. La cuenta de baristas no ve montos (decisión de Carlos, 2026-11-20).
 */
export default async function PaginaCaja({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const c = await contextoSucursal(params);
  const q = await searchParams;
  const hoy = diaOperacion();
  const dia = c.gestor && esFecha(q.dia) && q.dia <= hoy ? q.dia : hoy;
  const esHoy = dia === hoy;
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Caja"
      descripcion={
        <span className="first-letter:uppercase">
          {diaLargo(dia)}
          {esHoy ? ' · arqueo a medio turno y al cierre' : ' · consulta de un día anterior'}
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
  const [estados, caja] = await Promise.all([
    c.db.rpc('franq_arqueo_estado', { p_company: c.companyId, p_dia: dia }),
    c.gestor ? leerCaja(c.db, c.cfg, dia).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      {c.gestor && (
        <form className="flex flex-wrap items-end gap-2" action={`/franquiciatarios/${c.companyId}/caja`}>
          <label className="text-sm font-medium text-ink">
            Día de operación
            <input
              type="date"
              name="dia"
              defaultValue={dia}
              max={hoy}
              className="mt-1 block h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink"
            />
          </label>
          <button className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-ink/40">
            Ver día
          </button>
        </form>
      )}
      {estados.error ? (
        <p className="aviso">No se pudo leer el estado de la caja. Intenta de nuevo.</p>
      ) : (
        <ArqueoCaptura companyId={c.companyId} estados={estados.data ?? []} editable={esHoy} />
      )}
      {c.gestor &&
        (caja ? (
          <>
            <ResumenCaja caja={caja} />
            <CajaChica companyId={c.companyId} caja={caja} editable={esHoy} />
            <ConfigCaja companyId={c.companyId} caja={caja} />
          </>
        ) : (
          <p className="aviso">No se pudo leer la caja. Intenta de nuevo.</p>
        ))}
    </>
  );
}
