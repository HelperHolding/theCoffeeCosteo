import '@/components/sucursales/tablero-mexico.css';
import { sesionSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { sucursalesConfiguradas } from '@/lib/sucursales/config';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { TableroMexicoVista } from '@/components/sucursales/tablero-mexico';

/**
 * Tablero de México (docs/sucursales/16): la venta de todas las sucursales del usuario, sumada. Con todas las
 * configuradas es México; con menos, la suma es solo de las suyas y así lo dice.
 */
export default async function TableroMexico() {
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
            ? `La venta de las ${lista.length} sucursales, sumada. Se actualiza cada 10 minutos.`
            : `La venta de tus ${lista.length} sucursales, sumada. Se actualiza cada 10 minutos.`
        }
      />
      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </Tarjeta>
      ) : (
        <TableroMexicoVista />
      )}
    </>
  );
}
