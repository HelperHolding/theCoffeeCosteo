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
  visto_bueno: 'Visto bueno del gerente',
};

/** Nombre de la firma según la fase (rutina v2: turno de mañana, turno de tarde / cierre y gerente). */
export function nombreFirma(clave: SeccionClave, tipo: TipoFirma): string {
  if (clave === 'apertura' && tipo === 'responsable') return 'Barista turno mañana';
  if (clave === 'cierre' && tipo === 'responsable') return 'Barista tarde / cierre';
  if (clave === 'medio' && tipo === 'entrega') return 'Entrega · turno mañana';
  if (clave === 'medio' && tipo === 'recibe') return 'Recibe · turno tarde';
  return NOMBRE_FIRMA[tipo];
}

/** Orden de las fases en el día (la v1 «cambio» ocupa el lugar de «medio»). */
const ORDEN_FASE: Record<SeccionClave, number> = { apertura: 1, durante: 2, cambio: 3, medio: 3, cierre: 4 };

export type EstadoSeccion = 'pendiente' | 'en-curso' | 'completa';

export type Registro = Pick<
  FranqRespuesta,
  'id' | 'cumple' | 'observacion' | 'dato' | 'nombre' | 'registrado_en' | 'motivo' | 'corrige_id'
>;

export interface PuntoDia extends Pick<
  FranqPunto,
  'id' | 'orden' | 'actividad' | 'estandar' | 'tipo' | 'cada_min' | 'margen_min' | 'dato' | 'corte'
> {
  /** Registro vigente: en un punto único, el más reciente; en una ronda, la última ronda. */
  respuesta: Registro | null;
  /** Punto único: renglones anteriores (correcciones), del más reciente al más antiguo. */
  anteriores: Pick<FranqRespuesta, 'id' | 'cumple' | 'observacion' | 'dato' | 'nombre' | 'registrado_en'>[];
  /** Ronda: registros vigentes del día, del más antiguo al más reciente. */
  rondas: Registro[];
  /** Ronda con frecuencia: cuándo toca la siguiente (ISO) y si ya pasó su tolerancia. Solo el día en curso. */
  proxima: string | null;
  atrasada: boolean;
}

export interface SeccionDia {
  clave: SeccionClave;
  nombre: string;
  orden: number;
  firmasRequeridas: TipoFirma[];
  firmas: Pick<FranqFirma, 'tipo' | 'nombre' | 'registrado_en'>[];
  puntos: PuntoDia[];
  respondidos: number;
  /** «No» vigentes (en las rondas, cada ronda en «No» cuenta). */
  noes: number;
  /** Rondas atrasadas en este momento. */
  atrasos: number;
  estado: EstadoSeccion;
  /** Con al menos una firma, el barista ya no cambia respuestas. */
  firmada: boolean;
}

export interface Dia {
  dia: string;
  secciones: SeccionDia[];
  incidencias: Pick<FranqIncidencia, 'id' | 'texto' | 'nombre' | 'registrado_en'>[];
}

const MIN = 60_000;
const aRegistro = (r: FranqRespuesta): Registro => ({
  id: r.id,
  cumple: r.cumple,
  observacion: r.observacion,
  dato: r.dato ?? null,
  nombre: r.nombre,
  registrado_en: r.registrado_en,
  motivo: r.motivo,
  corrige_id: r.corrige_id,
});

/**
 * Arma el estado del día (puro, sin base). Por fase, la plantilla con que se empezó (o la vigente si aún no se
 * empieza): así conviven la v1 y la v2 el día del cambio. Un registro vale mientras ningún otro lo corrija (igual que
 * en la base). Las rondas con frecuencia cuentan desde la última ronda o, si no hay, desde la firma de apertura; con
 * `ahora` (solo el día en curso) se marcan atrasadas al pasar frecuencia + tolerancia, hasta que firma el cierre.
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
  /** Momento actual; solo se pasa para el día en curso (activa próxima ronda y atrasos). */
  ahora?: Date;
}): Dia {
  const porClave = new Map(entrada.checklists.map((c) => [c.seccion, c]));
  // Un día anterior que se llenó con otra versión muestra solo sus fases (no las vacías de la vigente). El día en curso
  // muestra la vigente completa más lo que ya se empezó con la anterior.
  const plantillasDelDia = new Set(
    entrada.checklists.map((c) => entrada.secciones.find((x) => x.id === c.seccion_id)?.plantilla_id),
  );
  const conVigente =
    entrada.ahora !== undefined || plantillasDelDia.size === 0 || plantillasDelDia.has(entrada.vigente ?? -1);
  const claves = new Set<SeccionClave>([
    ...(conVigente
      ? entrada.secciones.filter((x) => x.plantilla_id === entrada.vigente).map((x) => x.clave)
      : []),
    ...entrada.checklists.map((c) => c.seccion),
  ]);
  // «cambio» (v1) y «medio» (v2) son la misma fase: si el día empezó con «cambio», no se muestra también «medio».
  if (porClave.has('cambio') && !porClave.has('medio')) claves.delete('medio');
  const corregidos = new Set(entrada.respuestas.map((r) => r.corrige_id).filter((x) => x !== null));
  const firmaDe = (clave: SeccionClave, tipo: TipoFirma) => {
    const c = porClave.get(clave);
    return c ? entrada.firmas.find((f) => f.checklist_id === c.id && f.tipo === tipo) : undefined;
  };
  const inicioRondas = firmaDe('apertura', 'responsable')?.registrado_en ?? null;
  const cerrado = Boolean(firmaDe('cierre', 'responsable'));
  const ahora = entrada.ahora && !cerrado ? entrada.ahora : null;

  const secciones: SeccionDia[] = [];
  for (const clave of claves) {
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
        const tipo = p.tipo ?? 'unico';
        const hist = resp.filter((r) => r.punto_id === p.id).sort((a, b) => b.id - a.id);
        const vigentes = hist.filter((r) => !corregidos.has(r.id));
        const base = {
          id: p.id,
          orden: p.orden,
          actividad: p.actividad,
          estandar: p.estandar,
          tipo,
          cada_min: p.cada_min ?? null,
          margen_min: p.margen_min ?? null,
          dato: p.dato ?? null,
          corte: p.corte ?? null,
        };
        if (tipo === 'recurrente') {
          const rondas = [...vigentes].reverse().map(aRegistro);
          const desde = rondas.at(-1)?.registrado_en ?? inicioRondas;
          const proximaMs = ahora && p.cada_min && desde ? Date.parse(desde) + p.cada_min * MIN : null;
          return {
            ...base,
            respuesta: rondas.at(-1) ?? null,
            anteriores: [],
            rondas,
            proxima: proximaMs === null ? null : new Date(proximaMs).toISOString(),
            atrasada:
              proximaMs !== null && ahora !== null && ahora.getTime() > proximaMs + (p.margen_min ?? 0) * MIN,
          };
        }
        const vig = vigentes[0];
        return {
          ...base,
          respuesta: vig ? aRegistro(vig) : null,
          anteriores: hist
            .filter((r) => r.id !== vig?.id)
            .map((a) => ({
              id: a.id,
              cumple: a.cumple,
              observacion: a.observacion,
              dato: a.dato ?? null,
              nombre: a.nombre,
              registrado_en: a.registrado_en,
            })),
          rondas: [],
          proxima: null,
          atrasada: false,
        };
      });
    const firmas = c
      ? entrada.firmas
          .filter((f) => f.checklist_id === c.id)
          .map((f) => ({ tipo: f.tipo, nombre: f.nombre, registrado_en: f.registrado_en }))
      : [];
    const respondidos = puntos.filter((p) => p.respuesta).length;
    const completa = s.firmas.length > 0 && s.firmas.every((t) => firmas.some((f) => f.tipo === t));
    secciones.push({
      clave,
      nombre: s.nombre,
      orden: ORDEN_FASE[clave],
      firmasRequeridas: s.firmas,
      firmas,
      puntos,
      respondidos,
      noes: puntos.reduce(
        (n, p) =>
          n +
          (p.tipo === 'recurrente'
            ? p.rondas.filter((r) => !r.cumple).length
            : p.respuesta && !p.respuesta.cumple
              ? 1
              : 0),
        0,
      ),
      atrasos: puntos.filter((p) => p.atrasada).length,
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
