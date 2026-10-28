import { sesionAnalytics } from '@/lib/supabase/sesion';
import { leerSemana } from '@/lib/analytics/consultas';
import { construirTablero, lunesDe, semanaActual } from '@/lib/analytics/tablero';
import { fechaValida } from '@/lib/sucursales/tiempo';
import { ErrorAnalytics, TableroAnalytics } from '@/components/analytics/tablero';
import { Encabezado } from '@/components/portal/piezas';

export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string | string[] }>;
}) {
  // El layout no se vuelve a ejecutar al navegar: cada página valida su propia sesión (admin activo).
  const { db } = await sesionAnalytics();
  const ahora = new Date();
  const pedida = (await searchParams).semana;
  const actual = semanaActual(ahora);
  // Semana = lunes; nunca posterior a la actual.
  const lunes =
    typeof pedida === 'string' && fechaValida(pedida) && lunesDe(pedida) <= actual ? lunesDe(pedida) : actual;
  try {
    return <TableroAnalytics t={construirTablero(await leerSemana(db, lunes), lunes, ahora)} />;
  } catch (e) {
    console.error('[analytics] lectura', e instanceof Error ? e.message : e);
    return (
      <>
        <Encabezado area="Analytics" titulo="Ventas de la red" />
        <ErrorAnalytics mensaje="La base no respondió o las tablas de Analytics aún no existen." />
      </>
    );
  }
}
