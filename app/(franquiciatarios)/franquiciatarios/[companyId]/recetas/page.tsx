import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { leerFicha } from '@/lib/franquiciatarios/recetas-servidor';
import { Encabezado } from '@/components/portal/piezas';
import { RecetasFranq } from '@/components/franquiciatarios/recetas';

export const dynamic = 'force-dynamic';

/** Recetas estándar: insumos y cantidades por tamaño. Toda la sucursal (barista incluido); nunca costos. */
export default async function PaginaRecetas({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const ficha = await leerFicha(c.db, c.companyId);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Recetas"
        descripcion="Insumos y cantidades de cada producto por tamaño, como están en el recetario."
      />
      {ficha ? (
        <RecetasFranq ficha={ficha} />
      ) : (
        <p className="aviso">No se pudieron leer las recetas. Intenta de nuevo.</p>
      )}
    </>
  );
}
