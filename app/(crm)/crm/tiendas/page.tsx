import { CircleCheck, CirclePause, CircleX, Store } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { tablero } from '@/lib/crm/consultas';
import { columnas, GRUPOS, resumenPorGrupo } from '@/lib/crm/kanban';
import { Encabezado, Kpi, Vacio, Tarjeta } from '@/components/portal/piezas';
import { TableroTiendas } from '@/components/crm/tablero-tiendas';
import { NuevaTienda } from '@/components/crm/nueva-tienda';

export default async function Tiendas() {
  const { db, accesos } = await sesionCrm();
  const editable = puedeEditarCrm(accesos);
  const { etapas, tarjetas } = await tablero(db);
  const grupos = resumenPorGrupo(columnas(etapas, tarjetas));
  const total = tarjetas.length || 1;
  const kpis = [
    { tipo: 'abierta', icono: Store, tono: 'neutro' },
    { tipo: 'ganada', icono: CircleCheck, tono: 'ok' },
    { tipo: 'lateral', icono: CirclePause, tono: 'bajo' },
    { tipo: 'perdida', icono: CircleX, tono: 'sin-precio' },
  ] as const;
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Tiendas"
        descripcion="Pipeline de apertura de tiendas, de la firma de contrato a la operación."
      >
        {editable && <NuevaTienda etapas={etapas.sort((a, b) => a.orden - b.orden)} />}
      </Encabezado>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Kpi
            key={k.tipo}
            etiqueta={GRUPOS[k.tipo]}
            valor={grupos[k.tipo]}
            icono={k.icono}
            tono={k.tono}
            nota={`${Math.round((grupos[k.tipo] / total) * 100)} % de ${tarjetas.length} tiendas`}
          />
        ))}
      </div>
      {tarjetas.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Aún no hay tiendas">
            Se cargarán con la importación de Zoho{editable ? ', o crea la primera con "Nueva tienda".' : '.'}
          </Vacio>
        </Tarjeta>
      ) : (
        <TableroTiendas etapas={etapas} tarjetas={tarjetas} editable={editable} />
      )}
    </>
  );
}
