import { Marco } from '../../../components/portal/marco';
import { Encabezado, Tarjeta, Vacio } from '../../../components/portal/piezas';
import { TarjetasModulos } from '../../../components/portal/tarjetas-modulos';
import { modulos } from '../../../lib/portal/modulos';

/** Inicio y CRM con datos sintéticos: ?modulos (Inicio) o ?crm (panel del CRM). */
export function VistaModulos({ seccion }: { seccion: 'inicio' | 'crm' }) {
  return (
    <Marco perfil={{ nombre: 'Usuario Prueba', rol: 'admin' }} seccion={seccion} visibles={['costeo', 'crm']}>
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      {seccion === 'inicio' ? (
        <>
          <Encabezado
            area="Hola, Usuario"
            titulo="Módulos"
            descripcion="Elige el área en la que vas a trabajar."
          />
          <TarjetasModulos modulos={modulos} />
        </>
      ) : (
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
      )}
    </Marco>
  );
}
