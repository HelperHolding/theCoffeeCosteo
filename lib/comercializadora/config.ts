// Una sola normalización para el portal y el servidor: planEngine.ts ya tiene prueba de paridad con el HTML viejo.
import { mergeCfg, planCfgDef } from '../../supabase/functions/_shared/planEngine.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Config = Record<string, any>;

export const configPorDefecto = (): Config => planCfgDef();
export const normalizarConfig = (x: unknown): Config => mergeCfg(x ?? {});

export type CampoConfig = {
  seccion: string;
  ruta: string;
  etiqueta: string;
  ayuda?: string;
} & (
  | { tipo: 'num'; min: number; max: number; entero?: boolean }
  | { tipo: 'sel'; opciones: [string, string][] }
  | { tipo: 'chk' }
);

const n = (
  seccion: string,
  ruta: string,
  etiqueta: string,
  min: number,
  max: number,
  entero = false,
  ayuda?: string,
): CampoConfig => ({ seccion, ruta, etiqueta, tipo: 'num', min, max, entero, ayuda });
const s = (
  seccion: string,
  ruta: string,
  etiqueta: string,
  opciones: [string, string][],
  ayuda?: string,
): CampoConfig => ({ seccion, ruta, etiqueta, tipo: 'sel', opciones, ayuda });
const b = (seccion: string, ruta: string, etiqueta: string, ayuda?: string): CampoConfig => ({
  seccion,
  ruta,
  etiqueta,
  tipo: 'chk',
  ayuda,
});

/** Campos editables (plan 3b, decisión 8), con los rangos y opciones de _PLAN_CFG_RANGOS/_PLAN_CFG_OPC. */
export const CAMPOS_CONFIG: CampoConfig[] = [
  s('Inventario', 'inv.base', 'Inventario base', [
    ['disponible', 'Disponible'],
    ['fisico', 'Físico'],
  ]),
  b('Inventario', 'inv.yulius', 'Sumar el 3PL al disponible'),
  n('Inventario', 'inv.comp_dias', 'Días de pedidos comprometidos', 0, 365, true),
  n('Consumo', 'consumo.ventana', 'Ventana de consumo (días)', 7, 180, true),
  s('Consumo', 'consumo.metodo', 'Método', [
    ['promedio', 'Promedio'],
    ['mediana', 'Mediana'],
    ['percentil', 'Percentil'],
    ['ponderado', 'Ponderado'],
  ]),
  n('Consumo', 'consumo.pctl', 'Percentil', 50, 99, true, 'Solo con método percentil'),
  s('Consumo', 'consumo.divisor', 'Dividir entre', [
    ['ventana', 'La ventana'],
    ['vida', 'Días de vida del artículo'],
  ]),
  b('Consumo', 'consumo.alinear', 'Alinear a semanas completas'),
  n('Consumo', 'consumo.crecimiento', 'Crecimiento (%)', 0, 20),
  s('Consumo', 'consumo.items', 'Artículos de los pedidos', [
    ['editados', 'Editados'],
    ['originales', 'Originales'],
  ]),
  b('Consumo', 'consumo.tipos.resurtido', 'Contar pedidos de resurtido'),
  b('Consumo', 'consumo.tipos.sin_vincular', 'Contar pedidos sin vincular'),
  b('Consumo', 'consumo.tipos.apertura', 'Contar pedidos de apertura'),
  b('Consumo', 'consumo.tipos.marketing', 'Contar pedidos de marketing'),
  b('Consumo', 'consumo.tipos.corporativo', 'Contar pedidos corporativos'),
  b('Consumo', 'consumo.tipos.llenado', 'Contar llenado de canal'),
  n('Seguridad', 'seg.dias', 'Días de seguridad', 0, 120),
  s('Seguridad', 'seg.metodo', 'Método', [
    ['dias', 'Días fijos'],
    ['estadistico', 'Estadístico'],
  ]),
  s('Seguridad', 'seg.servicio', 'Nivel de servicio', [
    ['0.9', '90%'],
    ['0.95', '95%'],
    ['0.975', '97.5%'],
    ['0.99', '99%'],
  ]),
  n('Seguridad', 'seg.revision', 'Días de revisión', 1, 30, true),
  n('Seguridad', 'seg.lt_cv', 'Variabilidad del lead time (CV)', 0, 1),
  b('Aperturas', 'aper.incluir', 'Incluir aperturas en el cálculo'),
  s('Aperturas', 'aper.modo', 'Modo', [
    ['calendario', 'Calendario'],
    ['tasa', 'Tasa mensual'],
    ['mayor', 'El mayor de los dos'],
  ]),
  n('Aperturas', 'aper.por_mes', 'Aperturas por mes', 0, 60),
  n('Aperturas', 'aper.horizonte', 'Horizonte (días)', 1, 90, true),
  b('Aperturas', 'aper.horizonte_auto', 'Horizonte automático'),
  n('Aperturas', 'aper.antelacion', 'Antelación del kit (días)', 0, 180, true),
  n('Aperturas', 'aper.peso_sin_fecha', 'Peso de aperturas sin fecha', 0, 1),
  n('Aperturas', 'aper.vencida_max', 'Días máximos de apertura vencida', 0, 365, true),
  n('Aperturas', 'aper.gracia_dias', 'Días de gracia', 0, 60, true),
  n('Compras', 'compra.lt_default', 'Lead time por omisión (días)', 1, 365, true),
  n('Compras', 'compra.entrega_max', 'Entrega máxima (días)', 1, 365, true),
  n('Compras', 'compra.prox_dias', 'Próximos días a revisar', 1, 30, true),
  n('Compras', 'compra.oc_vencida', 'Días para dar una OC por vencida', 0, 365, true),
  s('Compras', 'compra.min_prov', 'Mínimo del proveedor', [
    ['consolidar', 'Consolidar compras'],
    ['avisar', 'Solo avisar'],
  ]),
  n('Compras', 'compra.min_ventana_dias', 'Ventana para consolidar (días)', 1, 60, true),
  s('Compras', 'compra.bloqueo_oc', 'Bloquear recompra con OC abierta', [
    ['siempre', 'Siempre'],
    ['si_cubre', 'Si la OC cubre'],
    ['nunca', 'Nunca'],
  ]),
  n('Compras', 'compra.bloqueo_umbral', 'Umbral de cobertura del bloqueo', 0, 1),
  n('Compras', 'compra.h_max', 'Horizonte máximo (días)', 30, 365, true),
  n('Compras', 'compra.ciclo_nac', 'Ciclo de compra nacional (días)', 1, 120, true),
  n('Compras', 'compra.semanas', 'Semanas del plan', 4, 26, true),
  n('Compras', 'compra.bt_semanas', 'Semanas de prueba retrospectiva', 0, 12, true),
  b('Compras', 'compra.excluir_cafe', 'Excluir café del plan general'),
  s('Compras', 'compra.fuente_oc', 'Fuente de las OCs abiertas', [
    ['plataforma', 'Plataforma'],
    ['zoho', 'Zoho'],
  ]),
  n('OCs automáticas', 'auto.cobertura_dias', 'Cobertura de la OC automática (días)', 0, 120),
  n('OCs automáticas', 'auto.yulius_alerta_dias', 'Alerta de 3PL sin actualizar (días)', 1, 90),
  n('Pagos', 'auto.pagos_horizonte', 'Horizonte de pagos (días)', 30, 180),
  s('Pagos', 'auto.pagos_base', 'Fecha base del pago', [
    ['llegada', 'Llegada'],
    ['oc', 'Fecha de la OC'],
  ]),
  s('Avanzado', 'picos.manejo', 'Picos de venta', [
    ['incluir', 'Incluir'],
    ['recortar', 'Recortar'],
  ]),
  n('Avanzado', 'picos.z', 'Umbral z de pico', 1.5, 6),
  n('Avanzado', 'picos.ratio', 'Razón de pico', 1, 5),
  n('Avanzado', 'picos.min_uds', 'Unidades mínimas de pico', 0, 100),
  b('Avanzado', 'temp.activa', 'Usar temporalidad mensual'),
];

export const SECCIONES = [...new Set(CAMPOS_CONFIG.map((c) => c.seccion))];

export function leerRuta(cfg: Config, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Config)[k]), cfg);
}

export function ponerRuta(cfg: Config, ruta: string, valor: unknown): Config {
  const [k, ...resto] = ruta.split('.');
  const copia: Config = Array.isArray(cfg) ? [...cfg] : { ...cfg };
  copia[k] = resto.length ? ponerRuta((cfg?.[k] as Config) ?? {}, resto.join('.'), valor) : valor;
  return copia;
}

function aplanar(x: unknown, pre: string, out: Map<string, unknown>) {
  if (x !== null && typeof x === 'object') {
    for (const [k, v] of Object.entries(x as Config)) aplanar(v, pre ? `${pre}.${k}` : k, out);
  } else out.set(pre, x);
}

/** _planCfgDiff: rutas aplanadas que cambiaron; zoho_oc no cuenta (lo maneja la conciliación). */
export function difConfig(antes: Config, despues: Config) {
  const a = new Map<string, unknown>();
  const d = new Map<string, unknown>();
  aplanar(antes, '', a);
  aplanar(despues, '', d);
  const claves = [...new Set([...a.keys(), ...d.keys()])]
    .filter((k) => !/^zoho_oc(\.|$)/.test(k))
    .sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  return claves
    .filter((k) => JSON.stringify(a.get(k)) !== JSON.stringify(d.get(k)))
    .map((k) => ({ clave: k, antes: a.get(k) ?? null, despues: d.get(k) ?? null }));
}

/** _planCfgClaveServidor: todo lo que no es imp, cafe ni kpi cambia el cálculo del servidor. */
export const claveServidor = (clave: string) => !/^(imp|cafe|kpi)\./.test(clave);

/** _planCfgAutoCorreos. */
export function validarCorreos(txt: string): { correos: string[] } | { error: string } {
  const partes = String(txt ?? '')
    .split(/[,;\s]+/)
    .filter(Boolean);
  for (const p of partes)
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(p))
      return { error: `Correo no válido: ${p}. Debe tener la forma nombre@dominio.com` };
  return { correos: [...new Set(partes.map((p) => p.toLowerCase()))].slice(0, 20) };
}
