import { sesionCrm } from '@/lib/supabase/sesion';
import { diasHasta, etapasGenerales } from '@/lib/crm/unificado/consultas';
import { Encabezado } from '@/components/portal/piezas';
import {
  VistaCarrilLegal,
  estadoCarril,
  type FilaCarril,
} from '@/components/crm/unificado/vistas/carril-legal';

const CLAVES = ['cof_enviada', 'cof_firmada', 'contrato_firmado', 'liberacion_apertura'];
/** Fecha − 2 meses (plazo de la COF, LFPPI). */
const menosDosMeses = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 2);
  return d.toISOString().slice(0, 10);
};

/** Tablero de Legal: COF y contrato de cada sucursal, de la transferencia a la apertura (carril paralelo). */
export default async function CarrilLegal() {
  const { db } = await sesionCrm();
  const etapas = await etapasGenerales(db);
  const transferencia = etapas.find((e) => e.clave === 'transferencia');
  const enCarril = etapas.filter(
    (e) =>
      e.tipo === 'abierta' && !e.carril && e.card === 'sucursal' && e.orden >= (transferencia?.orden ?? 0),
  );
  const [tiendas, requisitos] = await Promise.all([
    db
      .from('crm_tiendas')
      .select('id,nombre,franquiciatario,etapa_id,fecha_estimada_apertura,fecha_confirmada_apertura')
      .eq('embudo', 'general')
      .is('archivado_en', null)
      .in(
        'etapa_id',
        enCarril.map((e) => e.id),
      ),
    db.from('crm_requisitos').select('id,clave').in('clave', CLAVES),
  ]);
  const ts = (tiendas.data ?? []) as {
    id: string;
    nombre: string;
    franquiciatario: string | null;
    etapa_id: string;
    fecha_estimada_apertura: string | null;
    fecha_confirmada_apertura: string | null;
  }[];
  const claveDe = new Map(
    ((requisitos.data ?? []) as { id: string; clave: string }[]).map((r) => [r.id, r.clave]),
  );
  const cumplidos = ts.length
    ? (((
        await db
          .from('crm_cumplimientos')
          .select('tienda_id,requisito_id')
          .in(
            'tienda_id',
            ts.map((t) => t.id),
          )
          .in('requisito_id', [...claveDe.keys()])
          .in('estado', ['validado', 'no_aplica'])
      ).data ?? []) as { tienda_id: string; requisito_id: string }[])
    : [];
  const validadas = new Map<string, Set<string>>();
  for (const c of cumplidos)
    validadas.set(c.tienda_id, (validadas.get(c.tienda_id) ?? new Set()).add(claveDe.get(c.requisito_id)!));
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  const filas: FilaCarril[] = ts.map((t) => {
    const estado = estadoCarril(validadas.get(t.id) ?? new Set());
    const cof = estado === 'por_enviar' || estado === 'cof_enviada';
    const apertura = t.fecha_confirmada_apertura ?? t.fecha_estimada_apertura;
    const fecha = cof
      ? t.fecha_estimada_apertura
        ? menosDosMeses(t.fecha_estimada_apertura)
        : null
      : apertura;
    return {
      id: t.id,
      nombre: t.nombre,
      franquiciatario: t.franquiciatario,
      etapa: etapaDe.get(t.etapa_id)!,
      estado,
      fecha,
      fechaTexto: cof
        ? 'COF firmada a más tardar'
        : t.fecha_confirmada_apertura
          ? 'Apertura confirmada'
          : 'Apertura estimada',
      dias: fecha ? diasHasta(fecha) : null,
    };
  });
  // Lo más urgente arriba en cada columna; sin fecha al final.
  filas.sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9));
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="COF y contrato"
        descripcion="El carril Legal de cada sucursal, en paralelo a Proyectos. Ninguna abre sin los cinco hitos."
      />
      <VistaCarrilLegal filas={filas} />
    </>
  );
}
