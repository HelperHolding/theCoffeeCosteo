import { sesionBi } from '@/lib/supabase/sesion';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';

export default async function TheCoffeeMexico() {
  const { companias } = await sesionBi();
  return (
    <>
      <Encabezado area="BI" titulo="The Coffee México" />
      {companias.length === 0 && (
        <Tarjeta>
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </Tarjeta>
      )}
    </>
  );
}
