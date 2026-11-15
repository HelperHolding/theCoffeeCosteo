import { Suspense } from 'react';
import { sesionBi } from '@/lib/supabase/sesion';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { TableroMexico } from '@/components/bi/tablero-mexico';
import { Cargando } from '@/components/bi/estados-bi';

export default async function TheCoffeeMexico() {
  const { companias } = await sesionBi();
  return (
    <>
      <Encabezado area="BI" titulo="The Coffee México" />
      {companias.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </Tarjeta>
      ) : (
        // El tablero lee los filtros con useSearchParams: va dentro de Suspense (guía de Next, use-search-params).
        <Suspense fallback={<Cargando texto="Cargando el tablero…" />}>
          <TableroMexico />
        </Suspense>
      )}
    </>
  );
}
