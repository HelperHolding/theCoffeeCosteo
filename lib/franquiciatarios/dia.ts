import type {
  FranqFirma,
  FranqIncidencia,
  FranqPunto,
  FranqRespuesta,
  FranqSeccion,
  SeccionClave,
  TipoFirma,
} from './tipos';

/** Hora de corte del día de operación (Ciudad de México). Igual que franq_dia_operacion en la base. */
export const CORTE_DIA_HORAS = 4;
export const ZONA_OPERACION = 'America/Mexico_City';

/** Día de operación (AAAA-MM-DD): antes de las 4:00 de CDMX sigue siendo el día anterior. */
export function diaOperacion(ahora: Date = new Date()): string {
  const corrido = new Date(ahora.getTime() - CORTE_DIA_HORAS * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_OPERACION,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(corrido);
}

export const esFecha = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

export const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const NOMBRE_FIRMA: Record<TipoFirma, string> = {
  responsable: 'Responsable',
  entrega: 'Entrega',
  recibe: 'Recibe',
};

export type EstadoSeccion = 'pendiente' | 'en-curso' | 'completa';

export interface PuntoDia extends Pick<FranqPunto, 'id' | 'orden' | 'actividad' | 'estandar'> {
  /** Respuesta vigente (la más reciente). */
  respuesta: Pick<
    FranqRespuesta,
    'id' | 'cumple' | 'observacion' | 'nombre' | 'registrado_en' | 'motivo' | 'corrige_id'
  > | null;
  /** Renglones anteriores del mismo punto (correcciones), del más reciente al más antiguo. */
  anteriores: Pick<FranqRespuesta, 'id' | 'cumple' | 'observacion' | 'nombre' | 'registrado_en'>[];
}

export interface SeccionDia {
  clave: SeccionClave;
  nombre: string;
  orden: number;
  firmasRequeridas: TipoFirma[];
  firmas: Pick<FranqFirma, 'tipo' | 'nombre' | 'registrado_en'>[];
  puntos: PuntoDia[];
  respondidos: number;
  noes: number;
  estado: EstadoSeccion;
  /** Con al menos una firma, el barista ya no cambia respuestas. */
  firmada: boolean;
}

export interface Dia {
  dia: string;
  secciones: SeccionDia[];
  incidencias: Pick<FranqIncidencia, 'id' | 'texto' | 'nombre' | 'registrado_en'>[];
}

/**
 * Arma el estado del día (puro, sin base): por sección, la plantilla con que se llenó (o la vigente si aún no se
 * empieza), la respuesta vigente de cada punto, sus correcciones, firmas e incidencias.
 */
export function armarDia(entrada: {
  dia: string;
  secciones: FranqSeccion[];
  puntos: FranqPunto[];
  checklists: { id: number; seccion: SeccionClave; seccion_id: number }[];
  respuestas: FranqRespuesta[];
  firmas: FranqFirma[];
  incidencias: FranqIncidencia[];
  /** id de la plantilla vigente (para las secciones sin checklist ese día). */
  vigente: number | null;
}): Dia {
  const porClave = new Map(entrada.checklists.map((c) => [c.seccion, c]));
  const secciones: SeccionDia[] = [];
  for (const clave of ['apertura', 'cambio', 'cierre'] as const) {
    const c = porClave.get(clave);
    const s = entrada.secciones.find((x) =>
      c ? x.id === c.seccion_id : x.plantilla_id === entrada.vigente && x.clave === clave,
    );
    if (!s) continue;
    const resp = c ? entrada.respuestas.filter((r) => r.checklist_id === c.id) : [];
    const puntos: PuntoDia[] = entrada.puntos
      .filter((p) => p.seccion_id === s.id)
      .sort((a, b) => a.orden - b.orden)
      .map((p) => {
        const hist = resp.filter((r) => r.punto_id === p.id).sort((a, b) => b.id - a.id);
        const [vig, ...ant] = hist;
        return {
          id: p.id,
          orden: p.orden,
          actividad: p.actividad,
          estandar: p.estandar,
          respuesta: vig
            ? {
                id: vig.id,
                cumple: vig.cumple,
                observacion: vig.observacion,
                nombre: vig.nombre,
                registrado_en: vig.registrado_en,
                motivo: vig.motivo,
                corrige_id: vig.corrige_id,
              }
            : null,
          anteriores: ant.map((a) => ({
            id: a.id,
            cumple: a.cumple,
            observacion: a.observacion,
            nombre: a.nombre,
            registrado_en: a.registrado_en,
          })),
        };
      });
    const firmas = c
      ? entrada.firmas
          .filter((f) => f.checklist_id === c.id)
          .map((f) => ({ tipo: f.tipo, nombre: f.nombre, registrado_en: f.registrado_en }))
      : [];
    const respondidos = puntos.filter((p) => p.respuesta).length;
    const completa = s.firmas.every((t) => firmas.some((f) => f.tipo === t));
    secciones.push({
      clave,
      nombre: s.nombre,
      orden: s.orden,
      firmasRequeridas: s.firmas,
      firmas,
      puntos,
      respondidos,
      noes: puntos.filter((p) => p.respuesta && !p.respuesta.cumple).length,
      estado: completa ? 'completa' : respondidos > 0 || firmas.length > 0 ? 'en-curso' : 'pendiente',
      firmada: firmas.length > 0,
    });
  }
  return {
    dia: entrada.dia,
    secciones: secciones.sort((a, b) => a.orden - b.orden),
    incidencias: entrada.incidencias
      .filter((i) => i.dia === entrada.dia)
      .sort((a, b) => b.registrado_en.localeCompare(a.registrado_en))
      .map((i) => ({ id: i.id, texto: i.texto, nombre: i.nombre, registrado_en: i.registrado_en })),
  };
}

/** Plantilla vigente: la propia más reciente; si no hay, la general más reciente (igual que en la base). */
export function plantillaVigente(
  plantillas: { id: number; company_id: number | null; version: number; vigente: boolean }[],
  companyId: number,
): number | null {
  const candidatas = plantillas
    .filter((p) => p.vigente && (p.company_id === companyId || p.company_id === null))
    .sort((a, b) => Number(a.company_id === null) - Number(b.company_id === null) || b.version - a.version);
  return candidatas[0]?.id ?? null;
}
