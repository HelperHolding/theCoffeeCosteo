import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { diaOperacion, sumarDias } from '@/lib/franquiciatarios/dia';
import { armarHistorial, DIAS_HISTORIAL } from '@/lib/franquiciatarios/conteos';
import { Encabezado } from '@/components/portal/piezas';
import { InventarioFranq } from '@/components/franquiciatarios/inventario';

export const dynamic = 'force-dynamic';

/** Inventario: lista de insumos a contar e historial de conteos. Solo gerencia (la cuenta de baristas no lo ve). */
export default async function PaginaInventario({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoGestor(params);
  const desde = sumarDias(diaOperacion(), -(DIAS_HISTORIAL - 1));
  const [insumos, conteos] = await Promise.all([
    c.db.from('franq_insumos').select('*').eq('company_id', c.companyId),
    c.db.from('franq_conteos').select('*').eq('company_id', c.companyId).gte('dia', desde),
  ]);
  const ok = !insumos.error && !conteos.error;
  const h = ok ? armarHistorial(insumos.data ?? [], conteos.data ?? []) : null;
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Inventario"
        descripcion="Insumos críticos que se cuentan en cada turno y lo que se contó en la última semana."
      />
      {!h ? (
        <p className="aviso">No se pudo leer el inventario. Intenta de nuevo.</p>
      ) : (
        <InventarioFranq
          companyId={c.companyId}
          insumos={insumos.data ?? []}
          columnas={h.columnas}
          filas={h.filas}
        />
      )}
    </>
  );
}
