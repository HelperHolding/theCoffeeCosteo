import {
  ESTADOS_ACTIVIDAD,
  ESTATUS_CAFETERA,
  ESTATUS_CONTRATO,
  MARCAS_CAFETERA,
  PRIORIDADES,
  TIPOS_FRANQUICIA,
} from './tipos';

type Campo =
  | { tipo: 'texto'; requerido?: boolean; max?: number }
  | { tipo: 'fecha' }
  | { tipo: 'entero' }
  | { tipo: 'booleano' }
  | { tipo: 'url' }
  | { tipo: 'correo' }
  | { tipo: 'opcion'; opciones: readonly string[] };

const opcion = (opciones: readonly string[]): Campo => ({ tipo: 'opcion', opciones });

/** Campos editables de la tienda (los de sistema, Zoho y etapa no se editan aquí). */
export const camposTienda = {
  nombre: { tipo: 'texto', requerido: true, max: 200 },
  franquiciatario: { tipo: 'texto', max: 200 },
  tipo_franquicia: opcion(Object.keys(TIPOS_FRANQUICIA)),
  ciudad: { tipo: 'texto', max: 120 },
  direccion: { tipo: 'texto', max: 400 },
  numero_tienda_jestor: { tipo: 'entero' },
  arquitecto_asignado: { tipo: 'texto', max: 200 },
  fecha_entrega_proyecto: { tipo: 'fecha' },
  fecha_aprobacion_local: { tipo: 'fecha' },
  fecha_firma_contrato: { tipo: 'fecha' },
  fecha_firma_franquicia: { tipo: 'fecha' },
  estatus_contrato_franquicia: opcion(ESTATUS_CONTRATO),
  fecha_vencimiento_franquicia: { tipo: 'fecha' },
  fecha_programada_arranque: { tipo: 'fecha' },
  fecha_apertura: { tipo: 'fecha' },
  marca_cafetera: opcion(MARCAS_CAFETERA),
  estatus_cafetera: opcion(ESTATUS_CAFETERA),
  rappi: { tipo: 'booleano' },
  rollout: { tipo: 'booleano' },
  correo_tienda: { tipo: 'correo' },
  url_carpeta_contrato: { tipo: 'url' },
  url_dictamen_local: { tipo: 'url' },
} satisfies Record<string, Campo>;
export type CampoTienda = keyof typeof camposTienda;

export const camposActividad = {
  asunto: { tipo: 'texto', requerido: true, max: 300 },
  fecha_vencimiento: { tipo: 'fecha' },
  estado: opcion(Object.keys(ESTADOS_ACTIVIDAD)),
  prioridad: opcion(Object.keys(PRIORIDADES)),
  descripcion: { tipo: 'texto', max: 4000 },
} satisfies Record<string, Campo>;

function valor(nombre: string, c: Campo, v: unknown): unknown {
  const s = typeof v === 'string' ? v.trim() : v;
  const vacio = s === '' || s === null || s === undefined;
  switch (c.tipo) {
    case 'booleano':
      return v === true || v === 'true' || v === 'on';
    case 'texto':
      if (vacio) {
        if (c.requerido) throw new Error(`${nombre}: es obligatorio.`);
        return null;
      }
      if (c.max && String(s).length > c.max) throw new Error(`${nombre}: máximo ${c.max} caracteres.`);
      return String(s);
    case 'fecha':
      if (vacio) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s)) || Number.isNaN(Date.parse(String(s))))
        throw new Error(`${nombre}: usa una fecha válida.`);
      return String(s);
    case 'entero':
      if (vacio) return null;
      if (!/^-?\d+$/.test(String(s))) throw new Error(`${nombre}: usa un número entero.`);
      return Number(s);
    case 'url':
      if (vacio) return null;
      try {
        const u = new URL(String(s));
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw 0;
      } catch {
        throw new Error(`${nombre}: usa una liga que empiece con https://`);
      }
      return String(s);
    case 'correo':
      if (vacio) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s))) throw new Error(`${nombre}: usa un correo válido.`);
      return String(s).toLowerCase();
    case 'opcion':
      if (vacio) return null;
      if (!c.opciones.includes(String(s))) throw new Error(`${nombre}: opción no válida.`);
      return String(s);
  }
}

/** Valida solo las claves presentes que pertenecen al contrato; ignora todo lo demás. */
export function validar<K extends string>(campos: Record<K, Campo>, datos: Record<string, unknown>) {
  const salida: Partial<Record<K, unknown>> = {};
  for (const [k, c] of Object.entries(campos) as [K, Campo][]) {
    if (Object.hasOwn(datos, k)) salida[k] = valor(k, c, datos[k]);
  }
  return salida;
}

export const TIPOS_ARCHIVO: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
  'application/xml': 'XML',
  'text/xml': 'XML',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
};
/** Mismo límite que el bucket crm-archivos. */
export const TAMANO_MAXIMO = 25 * 1024 * 1024;
export function validarArchivo(nombre: string, mime: string, tamano: number) {
  if (!nombre.trim() || nombre.length > 200)
    throw new Error('El archivo necesita un nombre de hasta 200 caracteres.');
  if (!TIPOS_ARCHIVO[mime])
    throw new Error('Tipo de archivo no permitido. Usa PDF, imagen, XML, Word o Excel.');
  if (!(tamano > 0) || tamano > TAMANO_MAXIMO) throw new Error('El archivo debe pesar menos de 25 MB.');
}
