import '@/components/sucursales/tablero-mexico.css';
import { sesionSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { sucursalesConfiguradas } from '@/lib/sucursales/config';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { VistasMexico } from '@/components/sucursales/vistas-mexico';

/**
 * Tablero de México (docs/sucursales/16): la venta y el consumo de todas las sucursales del usuario, sumados. Con
 * todas las configuradas es México; con menos, la suma es solo de las suyas y así lo dice.
 */
export default async function TableroMexico({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { companias } = await sesionSucursales();
  const lista = sucursalesAccesibles(companias);
  const todas = lista.length === sucursalesConfiguradas.length;
  return (
    <>
      <Encabezado
        area="Sucursales"
        titulo="Tablero de México"
        descripcion={
          todas
            ? `La venta (se actualiza cada 10 minutos) y el consumo por mes de las ${lista.length} sucursales.`
            : `La venta (se actualiza cada 10 minutos) y el consumo por mes de tus ${lista.length} sucursales.`
        }
      />
      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </Tarjeta>
      ) : (
        <VistasMexico vistaInicial={q.vista === 'consumo' ? 'consumo' : 'ventas'} />
      )}
    </>
  );
}
