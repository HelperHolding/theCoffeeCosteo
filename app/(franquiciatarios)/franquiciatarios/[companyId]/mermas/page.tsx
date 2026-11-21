import Link from 'next/link';
import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas } from '@/lib/franquiciatarios/servidor';
import { leerMermasDia } from '@/lib/franquiciatarios/mermas-servidor';
import { diaOperacion, esFecha, sumarDias } from '@/lib/franquiciatarios/dia';
import { Encabezado } from '@/components/portal/piezas';
import { MermasFranq } from '@/components/franquiciatarios/mermas';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaCorto, diaLargo } from '@/components/franquiciatarios/formato';

export const dynamic = 'force-dynamic';

/** Días hacia atrás que la gerencia puede revisar. */
const DIAS_MERMAS = 14;

/**
 * Mermas del día: cualquier rol registra (la cuenta de baristas con su nombre declarado). La gerencia ve además la
 * comparación contra el consumo teórico, la tolerancia, el valor a costo y cierra el día; puede revisar días anteriores.
 */
export default async function PaginaMermas({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const c = await contextoSucursal(params);
  const q = await searchParams;
  const hoy = diaOperacion();
  const pedido = c.gestor && esFecha(q.dia) ? q.dia : hoy;
  const dia = pedido > hoy || pedido < sumarDias(hoy, -DIAS_MERMAS) ? hoy : pedido;
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Mermas"
      descripcion={<span className="first-letter:uppercase">{diaLargo(dia)}</span>}
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
  const datos = await leerMermasDia(c.db, c.cfg, dia, c.gestor);
  const base = `/franquiciatarios/${c.companyId}/mermas`;
  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      {c.gestor && (
        <nav aria-label="Día" className="flex flex-wrap gap-1.5">
          {Array.from({ length: 7 }, (_, i) => sumarDias(hoy, -i)).map((d) => (
            <Link
              key={d}
              href={d === hoy ? base : `${base}?dia=${d}`}
              aria-current={d === dia ? 'page' : undefined}
              className={
                d === dia
                  ? 'rounded-full border border-ink bg-ink px-3 py-1.5 text-sm text-surface'
                  : 'rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-2 hover:text-ink'
              }
            >
              {d === hoy ? 'Hoy' : diaCorto(d)}
            </Link>
          ))}
        </nav>
      )}
      {datos ? (
        <MermasFranq companyId={c.companyId} datos={datos} gestor={c.gestor} hoy={hoy} />
      ) : (
        <p className="aviso">No se pudieron leer las mermas. Intenta de nuevo.</p>
      )}
    </>
  );
}
