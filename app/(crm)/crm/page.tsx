import { sesionCrm } from '@/lib/supabase/sesion';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';

export default async function PanelCrm() {
  // Cada página exige el acceso por sí misma: el layout no se vuelve a ejecutar al navegar.
  await sesionCrm();
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Panel"
        descripcion="Pipeline de tiendas, prospectos, contactos y actividades."
      />
      <Tarjeta cuerpo={false}>
        <Vacio titulo="El CRM se está preparando">
          Las pantallas de tiendas, prospectos, contactos y actividades llegan con la importación de Zoho.
        </Vacio>
      </Tarjeta>
    </>
  );
}
