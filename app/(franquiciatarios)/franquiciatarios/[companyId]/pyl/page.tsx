import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { leerPyl } from '@/lib/franquiciatarios/pyl-servidor';
import { hoyLocal } from '@/lib/sucursales/datos';
import { Encabezado } from '@/components/portal/piezas';
import { PylFranq } from '@/components/franquiciatarios/pyl';

export const dynamic = 'force-dynamic';

/** P&L mensual y metas de venta: gerente, franquiciatario y admin (la cuenta de baristas recibe 404). */
export default async function PaginaPyl({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const c = await contextoGestor(params);
  const q = await searchParams;
  const actual = hoyLocal(c.cfg).fecha.slice(0, 7);
  const mes =
    q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) && q.mes <= actual && q.mes >= '2025-01' ? q.mes : actual;
  const datos = await leerPyl(c.db, c.cfg, mes).catch(() => null);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="P&L y metas"
        descripcion="Estado de resultados del mes y avance contra la meta de venta del día, la semana y el mes."
      />
      <form className="flex flex-wrap items-end gap-2" action={`/franquiciatarios/${c.companyId}/pyl`}>
        <label className="text-sm font-medium text-ink">
          Mes
          <input
            type="month"
            name="mes"
            defaultValue={mes}
            max={actual}
            min="2025-01"
            className="mt-1 block h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink"
          />
        </label>
        <button className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-ink/40">
          Ver mes
        </button>
      </form>
      {datos ? (
        <PylFranq companyId={c.companyId} datos={datos} enCurso={mes === actual} />
      ) : (
        <p className="aviso">No se pudo armar el P&L. Intenta de nuevo en unos minutos.</p>
      )}
    </>
  );
}
