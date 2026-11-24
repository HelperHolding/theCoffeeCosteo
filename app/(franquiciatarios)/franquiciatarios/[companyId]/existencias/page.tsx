import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { leerExistencias } from '@/lib/franquiciatarios/existencias-servidor';
import { Encabezado } from '@/components/portal/piezas';
import { ExistenciasFranq } from '@/components/franquiciatarios/existencias';

export const dynamic = 'force-dynamic';

/**
 * Existencias: lo que debería haber de cada insumo crítico y la diferencia del último conteo. Solo gerencia (usa el
 * consumo teórico de las ventas); la cuenta de baristas recibe el mismo 404 que las otras páginas de gerencia.
 */
export default async function PaginaExistencias({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoGestor(params);
  const datos = await leerExistencias(c.db, c.cfg);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Existencias"
        descripcion="Lo que debería haber de cada insumo crítico: conteo, entradas, consumo por recetas y mermas."
      />
      {datos ? (
        <ExistenciasFranq
          companyId={c.companyId}
          filas={datos.filas}
          entradas={datos.entradas}
          insumos={datos.insumos}
          aviso={datos.aviso}
          hoy={datos.hoy}
        />
      ) : (
        <p className="aviso">No se pudieron leer las existencias. Intenta de nuevo.</p>
      )}
    </>
  );
}
