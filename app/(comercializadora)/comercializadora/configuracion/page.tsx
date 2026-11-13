import { Encabezado, Vacio } from '@/components/portal/piezas';
import { Configuracion } from '@/components/comercializadora/configuracion';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { normalizarConfig } from '@/lib/comercializadora/config';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export interface HistorialFila {
  id: number;
  ambito: string;
  clave: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  modificado_por: string | null;
  username: string | null;
  created_at: string;
}

export default async function ConfiguracionPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [cfg, hist, credito] = await Promise.all([
    com(db)
      .from('com_plan_config')
      .select('config,version,actualizado_por,updated_at')
      .eq('id', 1)
      .maybeSingle(),
    com(db).from('com_plan_config_historial').select('*').order('id', { ascending: false }).limit(60),
    leerTodoCom<{ vendor_id: string; nombre: string | null; dias_credito: number }>(
      db,
      'com_zoho_proveedor',
      'vendor_id,nombre,dias_credito',
      'vendor_id',
    ),
  ]);
  if (cfg.error || hist.error) throw new Error('No se pudo leer la configuración. Intenta de nuevo.');
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Configuración del cálculo"
      descripcion="Parámetros del mín/máx, la proyección y las OCs automáticas."
    />
  );
  if (!cfg.data)
    return (
      <>
        {encabezado}
        <Vacio titulo="Todavía no hay configuración guardada" />
      </>
    );
  return (
    <>
      {encabezado}
      <Configuracion
        // Tras guardar, la versión cambia y el borrador vuelve a salir de lo guardado (ya normalizado).
        key={Number(cfg.data.version)}
        hoy={hoyCdmx()}
        config={normalizarConfig(cfg.data.config)}
        version={Number(cfg.data.version)}
        actualizadoPor={cfg.data.actualizado_por}
        actualizadoEn={cfg.data.updated_at}
        historial={hist.data as HistorialFila[]}
        credito={credito
          .filter((c) => c.dias_credito > 0)
          .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}
