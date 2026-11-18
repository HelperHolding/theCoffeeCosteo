// Modo ?grabar&flujo del arnés visual: un lead sintético (Gabriela Méndez → sucursal Aguascalientes Altaria)
// que avanza de verdad con los clics del video. El estado vive en sessionStorage de la pestaña grabada:
// las acciones lo modifican y la página se recarga, como haría router.refresh() con la base real.
// ?flujo=nuevo empieza de cero.

const PARAMS = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
export const GRABANDO = PARAMS.has('grabar');
export const FLUJO = GRABANDO && PARAMS.has('flujo');
const CLAVE = 'crm-video-flujo';
export const AHORA_FLUJO = new Date('2026-11-03T18:30:00Z');

export const LEAD = { id: 'fr-lead', nombre: 'Gabriela Méndez', ciudad: 'Aguascalientes' };
export const SUC = { id: 'suc-lead' };

export type Registro = {
  fecha: string | null;
  valor: string | null;
  nota: string | null;
  archivo: string | null;
  por: string;
  en: string;
};
export type ArchivoFlujo = {
  id: string;
  nombre: string;
  tipo: string;
  por: string;
  en: string;
  card: string;
};
export type EventoFlujo = {
  id: number;
  accion: string;
  resumen: string;
  actor: string;
  area: string;
  fecha: string;
  card: string;
  motivo?: string | null;
};
export type EstadoFlujo = {
  creado: boolean;
  etapaF: string;
  etapaS: string | null;
  sucursal: string | null;
  campos: Record<string, string>;
  camposS: Record<string, string>;
  quienCampo: Record<string, string>;
  req: Record<string, Registro>;
  archivos: ArchivoFlujo[];
  historial: EventoFlujo[];
  atendidos: string[];
  minuto: number;
};

const vacio = (): EstadoFlujo => ({
  creado: false,
  etapaF: 'recepcion',
  etapaS: null,
  sucursal: null,
  campos: {},
  camposS: {},
  quienCampo: {},
  req: {},
  archivos: [],
  historial: [],
  atendidos: [],
  minuto: 0,
});

if (FLUJO && PARAMS.get('flujo') === 'nuevo') sessionStorage.removeItem(CLAVE);

export function leer(): EstadoFlujo {
  if (!FLUJO) return vacio();
  try {
    return { ...vacio(), ...JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}') };
  } catch {
    return vacio();
  }
}
function guardar(e: EstadoFlujo) {
  sessionStorage.setItem(CLAVE, JSON.stringify(e));
}

/** Usuario con el que se graba (?rol=). */
export const USUARIOS: Record<string, { id: string; nombre: string; area: string }> = {
  ventas: { id: 'u-luis', nombre: 'Luis', area: 'ventas' },
  locales: { id: 'u-sebastian', nombre: 'Sebastián', area: 'ventas' },
  finanzas: { id: 'u-fernanda', nombre: 'Fernanda', area: 'finanzas' },
  legal: { id: 'u-andres', nombre: 'Andrés', area: 'legal' },
  proyectos: { id: 'u-diego', nombre: 'Diego', area: 'proyectos' },
  head: { id: 'u-regina', nombre: 'Regina', area: 'ventas' },
};
export const yo = () => USUARIOS[PARAMS.get('rol') ?? 'legal'] ?? USUARIOS.legal;

/** Cada acción avanza un par de minutos el reloj del video, para que la bitácora quede en orden. */
function marca(e: EstadoFlujo) {
  e.minuto += 2;
  return new Date(AHORA_FLUJO.getTime() + e.minuto * 60_000).toISOString();
}
function evento(e: EstadoFlujo, card: string, accion: string, resumen: string, motivo?: string | null) {
  const u = yo();
  e.historial.unshift({
    id: 5000 + e.historial.length,
    accion,
    resumen,
    actor: u.nombre,
    area: u.area,
    fecha: marca(e),
    card,
    motivo: motivo ?? null,
  });
}

const ETAPA_TXT: Record<string, string> = {
  contacto: '2 · Contacto inicial y seguimiento',
  revision_contrato: '3 · Revisión de contrato',
  pld: '4 · Perfilamiento, PLD y formalización',
  bienvenida: '5 · Bienvenida, carta de intención y facturación',
  constancia: '7 · Constancia de arrendamiento',
  transferencia: '8 · Transferencia a Proyectos',
  levantamiento: '26.1 · Levantamiento arquitectónico',
  boceto: '26.2 · Elaboración de boceto',
  envio_brasil: '26.3 · Envío a Brasil',
  proyecto_3d: '26.4 · Recepción del proyecto 3D',
  proyecto_ejecutivo: '26.5 · Proyecto ejecutivo',
  obra: '26.6 · Obra',
  capacitacion: '26.7 · Capacitación y evidencia de apertura',
  operando: '26.8 · Tienda en operación',
};
const CAMPO_TXT: Record<string, string> = {
  fecha_limite_apertura: 'fecha límite de apertura',
  fecha_estimada_apertura: 'fecha estimada de apertura',
  fecha_confirmada_apertura: 'fecha confirmada de apertura',
  fecha_apertura: 'fecha real de apertura',
  numero_tienda_jestor: 'ID de Jestor',
  firmante: 'firmante',
  obligado_solidario: 'obligado solidario',
  rfc: 'RFC',
  regimen_fiscal: 'régimen fiscal',
  codigo_postal_fiscal: 'C.P. fiscal',
  tipo_persona: 'tipo de persona',
};

// ── Acciones (las llaman los mocks de server actions) ──────────────────────────────────────────────────
export function crearLead(datos: Record<string, unknown>) {
  const e = vacio();
  e.creado = true;
  for (const [k, v] of Object.entries(datos)) if (String(v ?? '').trim()) e.campos[k] = String(v).trim();
  e.campos.responsable_id = yo().id;
  for (const k of Object.keys(e.campos)) e.quienCampo[k] = yo().id;
  evento(e, LEAD.id, 'creado', `Alta del lead ${e.campos.nombre ?? LEAD.nombre} en 1 · Recepción`);
  guardar(e);
  return { id: LEAD.id };
}

export function cumplir(card: string, requisito: string, d: Record<string, unknown>) {
  const e = leer();
  const en = marca(e);
  e.req[requisito] = {
    fecha: (d.fecha as string) || null,
    valor: (d.valor as string) || null,
    nota: (d.nota as string) || null,
    archivo: (d.archivo as string) || null,
    por: yo().id,
    en,
  };
  evento(e, card, 'requisito_validado', `Validado: ${requisito}`);
  guardar(e);
  return {};
}

export function prepararArchivo(card: string, nombre: string, tipo: string) {
  const e = leer();
  const id = `doc-${e.archivos.length + 1}`;
  e.archivos.push({ id, nombre, tipo, por: yo().id, en: marca(e), card });
  evento(e, card, 'archivo', `Documento subido: ${nombre}`);
  guardar(e);
  return { id, ruta: `video/${id}` };
}

export function mover(
  tipo: string,
  card: string,
  etapa: string,
  motivo: string | null,
  sucursal: string | null,
) {
  const e = leer();
  if (tipo === 'franquiciatario') {
    e.etapaF = etapa;
    if (etapa === 'formalizado') {
      e.sucursal = sucursal || 'Aguascalientes Altaria';
      e.etapaS = 'locales';
      evento(
        e,
        LEAD.id,
        'etapa',
        `Formalizado. Se creó la sucursal ${e.sucursal} en 6 · Aprobación de locales`,
      );
      guardar(e);
      return { sucursal: SUC.id };
    }
  } else e.etapaS = etapa;
  evento(e, card, 'etapa', `Etapa: → ${ETAPA_TXT[etapa] ?? etapa}`, motivo);
  guardar(e);
  return {};
}

export function guardarDatos(tipo: string, form: Record<string, unknown>) {
  const e = leer();
  const destino = tipo === 'franquiciatario' ? e.campos : e.camposS;
  const cambios: string[] = [];
  for (const [k, v] of Object.entries(form)) {
    const s = String(v ?? '').trim();
    if (s && destino[k] !== s) {
      destino[k] = s;
      e.quienCampo[k] = yo().id;
      cambios.push(k);
    }
  }
  if (cambios.length)
    evento(
      e,
      tipo === 'franquiciatario' ? LEAD.id : SUC.id,
      'editado',
      `Capturó: ${cambios.map((k) => CAMPO_TXT[k] ?? k).join(', ')}`,
    );
  guardar(e);
  return {};
}

export function atender(id: string) {
  const e = leer();
  e.atendidos.push(id);
  guardar(e);
  return {};
}

// ── Navegación dentro del arnés: las rutas del CRM se traducen a vistas de prueba ───────────────────────
const VISTAS: Record<string, string> = {
  '/crm': 'panel',
  '/crm/pendientes': 'pendientes',
  '/crm/vencimientos': 'vencimientos',
  '/crm/bitacora': 'bitacora',
  '/crm/carril-legal': 'carril-legal',
  '/crm/proceso': 'proceso',
  '/crm/admin': 'admin',
  '/crm/franquiciatarios': 'franquiciatarios',
  '/crm/contactos': 'contactos',
  '/crm/actividades': 'actividades',
};
const CASO_DE: Record<string, string> = {
  'fr-lead': 'lead',
  'suc-lead': 'lead-suc',
  'fr-mariana': 'mariana',
  'fr-hector': 'hector',
  'fr-paola': 'paola',
  'fr-jorge': 'jorge',
  'suc-morelia': 'morelia',
  'suc-saltillo': 'saltillo',
  'suc-leon': 'leon',
};
export function mapear(href: string): string {
  const u = new URL(href, 'http://x');
  const base = new URLSearchParams();
  base.set('grabar', '');
  if (PARAMS.has('flujo')) base.set('flujo', '');
  base.set('rol', PARAMS.get('rol') ?? 'legal');
  base.set('ruta', u.pathname);
  const ficha = u.pathname.match(/^\/crm\/(franquiciatarios|sucursales)\/([^/]+)/);
  let q: string;
  if (ficha) q = `expediente-unificado&caso=${CASO_DE[ficha[2]] ?? ficha[2]}`;
  else if (u.pathname.startsWith('/crm/pipeline')) q = 'pipeline';
  else q = `vista-crm=${VISTAS[u.pathname] ?? 'pendientes'}`;
  u.searchParams.forEach((v, k) => base.set(k, v));
  return `/?${q}&${base.toString().replace(/=(&|$)/g, '$1')}`;
}
