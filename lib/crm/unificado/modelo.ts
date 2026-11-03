// Modelo del Pipeline general (CRM Unificado). Las etapas y sus requisitos viven en la base (crm_etapas
// embudo 'general' y crm_requisitos); aquí solo están los tipos y las reglas puras que usa la interfaz.

export type ClaveArea = 'ventas' | 'legal' | 'proyectos' | 'finanzas';

export interface Area {
  clave: ClaveArea;
  nombre: string;
  /** Color de identidad, validado con dataviz sobre superficie blanca (todos los pares). */
  color: string;
}

export const AREAS: Record<ClaveArea, Area> = {
  ventas: { clave: 'ventas', nombre: 'Ventas', color: '#2a78d6' },
  legal: { clave: 'legal', nombre: 'Legal', color: '#c2457f' },
  proyectos: { clave: 'proyectos', nombre: 'Proyectos', color: '#d9741a' },
  // Finanzas nace inactiva; su color se valida cuando se active (P1).
  finanzas: { clave: 'finanzas', nombre: 'Finanzas', color: '#6b6560' },
};

export type TipoCard = 'franquiciatario' | 'sucursal';
export type TipoEtapa = 'abierta' | 'lateral' | 'ganada' | 'perdida';

export interface EtapaGeneral {
  id: string;
  clave: string;
  /** Número del documento de proceso (1–10); nulo en provisionales y finales. */
  numero: number | null;
  nombre: string;
  /** Área que mueve la card fuera de esta etapa. */
  area: ClaveArea;
  /** Rol funcional que mueve en lugar del área (p. ej. Aprobación de locales, P2). */
  funcion?: string;
  /** Tipo de card de la etapa; nulo = ambas (Standby). */
  card: TipoCard | null;
  tipo: TipoEtapa;
  opcional?: boolean;
  provisional?: boolean;
  orden: number;
}

export type TipoRequisito = 'documento' | 'fecha' | 'validacion' | 'firma' | 'dato';
export type EstadoRequisito = 'pendiente' | 'cumplido' | 'validado' | 'no_aplica';

export interface Requisito {
  id: string;
  nombre: string;
  tipo: TipoRequisito;
  cumple: ClaveArea;
  valida: ClaveArea;
  /** Candado de salida; si es falso solo avisa. */
  obligatorio: boolean;
  /** Qué pide y por qué (texto del pop-up). */
  ayuda: string;
  estado: EstadoRequisito;
  valor?: string | null;
  cumplidoPor?: string | null;
  cumplidoEn?: string | null;
  validadoPor?: string | null;
  validadoEn?: string | null;
  /** Nota visible cuando lo registra otra área en nombre de quien valida (P1). */
  nota?: string | null;
}

export interface Vencimiento {
  tipo: 'cof' | 'apertura_5_habiles' | 'limite_120' | 'pld_original';
  etiqueta: string;
  fecha: string;
  /** Días restantes; negativo = vencido. */
  dias: number;
}

export interface CardPipeline {
  id: string;
  tipo: TipoCard;
  /** Franquiciatario, o nombre de la sucursal. */
  nombre: string;
  /** En sucursales: su franquiciatario. */
  franquiciatario?: string | null;
  ciudad: string | null;
  etapaId: string;
  /** Versión para concurrencia optimista (crm_avanzar la exige). */
  version: number;
  etapaPreviaId: string | null;
  requisitos: { total: number; listos: number; faltante: { nombre: string; area: ClaveArea } | null };
  liberado: boolean;
  vencimiento: Vencimiento | null;
  archivos: number;
  notas: number;
  ultimo: { actor: string; fecha: string } | null;
  muestra: boolean;
}

/** Cards por columna antes de mandar al resto a la tabla (decisión Q4). */
export const POR_COLUMNA = 50;

export type EstadoCandado = 'bloqueada' | 'lista' | 'liberada' | 'sin-candado';

/** Un requisito no bloquea cuando ya se validó o no aplica (etapa omitida). */
export const requisitoListo = (r: Pick<Requisito, 'estado'>) =>
  r.estado === 'validado' || r.estado === 'no_aplica';

export function estadoCandado(
  c: Pick<CardPipeline, 'requisitos' | 'liberado'>,
  etapa?: EtapaGeneral,
): EstadoCandado {
  if (etapa && (etapa.tipo !== 'abierta' || etapa.provisional)) return 'sin-candado';
  if (c.liberado) return 'liberada';
  return c.requisitos.listos >= c.requisitos.total ? 'lista' : 'bloqueada';
}

/** Tramos del Pipeline: encabezados por área en el orden del proceso. */
export interface Tramo {
  clave: 'ventas' | 'locales' | 'proyectos' | 'legal' | 'cierre';
  nombre: string;
  area: ClaveArea | null;
  etapas: EtapaGeneral[];
}

export function tramos(etapas: EtapaGeneral[]): Tramo[] {
  const por = (f: (e: EtapaGeneral) => boolean) => etapas.filter(f).sort((a, b) => a.orden - b.orden);
  return [
    {
      clave: 'ventas',
      nombre: 'Ventas · franquiciatario',
      area: 'ventas',
      etapas: por((e) => e.tipo === 'abierta' && e.card === 'franquiciatario'),
    },
    {
      clave: 'locales',
      nombre: 'Locales y Legal · sucursal',
      area: 'legal',
      etapas: por(
        (e) => e.tipo === 'abierta' && e.card === 'sucursal' && (e.numero ?? 0) >= 6 && (e.numero ?? 0) <= 8,
      ),
    },
    {
      clave: 'proyectos',
      nombre: 'Proyectos (provisional)',
      area: 'proyectos',
      etapas: por((e) => !!e.provisional),
    },
    {
      clave: 'legal',
      nombre: 'COF, contrato y apertura',
      area: 'legal',
      etapas: por((e) => e.tipo === 'abierta' && (e.numero ?? 0) >= 9),
    },
    { clave: 'cierre', nombre: 'Laterales y finales', area: null, etapas: por((e) => e.tipo !== 'abierta') },
  ].filter((t) => t.etapas.length > 0) as Tramo[];
}

const fechaHora = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Mexico_City',
});
const soloHora = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Mexico_City',
});
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });

/** «hoy 10:42», «ayer 18:05» o «3 nov, 10:42», siempre en hora de México. */
export function cuando(iso: string, ahora = new Date()): string {
  const f = new Date(iso);
  const hoy = dia.format(ahora);
  const ayer = dia.format(new Date(ahora.getTime() - 86_400_000));
  const d = dia.format(f);
  if (d === hoy) return `hoy ${soloHora.format(f)}`;
  if (d === ayer) return `ayer ${soloHora.format(f)}`;
  return fechaHora.format(f);
}

export function textoVencimiento(v: Vencimiento): string {
  if (v.dias < 0) return `${v.etiqueta} · venció hace ${-v.dias} d`;
  if (v.dias === 0) return `${v.etiqueta} · vence hoy`;
  return `${v.etiqueta} · en ${v.dias} d`;
}

/** Nombre corto de cada tipo de vencimiento o aviso (crm_v_vencimientos.tipo). */
export const ETIQUETA_VENCIMIENTO: Record<string, string> = {
  cof: 'COF firmada',
  apertura_5_habiles: 'Fecha confirmada a Legal',
  limite_120: 'Límite de apertura',
  cof_tardia: 'COF tardía',
  pld_original: 'PLD original',
};

/** Primera área reconocible en `actor_area` de la bitácora (puede traer varias). */
export function areaDeTexto(texto: string | null | undefined): ClaveArea | null {
  const t = (texto ?? '').toLocaleLowerCase('es');
  return (Object.keys(AREAS) as ClaveArea[]).find((a) => t.includes(a)) ?? null;
}
