import 'server-only';
import { z } from 'zod';
import { semaforo } from './cache';
import { diasEntre, fechaValida } from './tiempo';

/**
 * Cliente de solo lectura de la API The Coffee (Brasil). Base fija, solo GET, token de servidor.
 * Contrato observado (docs/sucursales/02): envelope {currentPage,totalItems,totalPages,perPage,from,to,data},
 * orden createdAt descendente, fechas inclusivas. `from`/`to` no son confiables y no se usan.
 */
const BASE = 'https://api.thecoffee.jp';
export const POR_PAGINA = 500;
export const LIMITES = {
  paginas: 20,
  filas: 10_000,
  presupuestoMs: 25_000,
  timeoutMs: 10_000,
  reintentos: 2,
  diasMaximos: 62,
};

export type CodigoError =
  | 'sin-configuracion'
  | 'credenciales-proveedor'
  | 'sucursal-no-encontrada'
  | 'limite-proveedor'
  | 'proveedor-no-disponible'
  | 'tiempo-agotado'
  | 'respuesta-invalida'
  | 'registros-invalidos'
  | 'identidad-discrepante'
  | 'tope-alcanzado'
  | 'total-cambiante'
  | 'pagina-repetida'
  | 'pagina-vacia-inesperada';

/** Mensajes seguros para el navegador (sin detalles del proveedor, headers ni trazas). */
export const mensajeError: Record<CodigoError, string> = {
  'sin-configuracion': 'La integración con la API The Coffee no está configurada en el servidor.',
  'credenciales-proveedor': 'La API The Coffee rechazó las credenciales del portal. Avisa al administrador.',
  'sucursal-no-encontrada': 'La API The Coffee no reconoce esta sucursal.',
  'limite-proveedor': 'La API The Coffee pidió esperar antes de consultar de nuevo.',
  'proveedor-no-disponible': 'La API The Coffee no respondió correctamente.',
  'tiempo-agotado': 'La API The Coffee tardó demasiado en responder.',
  'respuesta-invalida': 'La API The Coffee devolvió una respuesta con formato inesperado.',
  'registros-invalidos': 'Algunos pedidos llegaron con datos inválidos y se excluyeron.',
  'identidad-discrepante': 'La identidad de la sucursal en la API no coincide con la configurada.',
  'tope-alcanzado': 'El periodo excede el máximo de lectura; se leyó solo una parte.',
  'total-cambiante': 'Los pedidos cambiaron durante la lectura; vuelve a intentar.',
  'pagina-repetida': 'La API repitió una página; la lectura quedó incompleta.',
  'pagina-vacia-inesperada':
    'La API devolvió una página vacía antes de terminar; la lectura quedó incompleta.',
};

export interface ErrorLectura {
  codigo: CodigoError;
  detalle?: string; // solo para registros del servidor
}

export interface LecturaCruda {
  companyId: number;
  desde: string;
  hasta: string;
  leidoEn: number;
  totalDeclarado: number | null;
  paginas: number;
  completo: boolean;
  errores: ErrorLectura[];
  /** Registros crudos deduplicados por id. Nunca salen del servidor. */
  registros: Record<string, unknown>[];
}

export interface Dependencias {
  fetch: typeof fetch;
  esperar: (ms: number) => Promise<void>;
  ahora: () => number;
  token: () => string | undefined;
}

export const dependenciasReales: Dependencias = {
  fetch: (...a) => fetch(...a),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  ahora: Date.now,
  token: () => process.env.THECOFFEE_API_TOKEN || undefined,
};

const limitar = semaforo(4);

const Envelope = z.object({
  currentPage: z.number(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  data: z.array(z.record(z.string(), z.unknown())),
});
const Catalogo = z.array(
  z.object({ id: z.number().int(), name: z.string(), lookerStoreId: z.number().int().nullable() }),
);
export type SucursalApi = z.infer<typeof Catalogo>[number];

type Respuesta = { ok: true; cuerpo: unknown } | { ok: false; error: ErrorLectura };

function esperaReintento(res: Response, intento: number) {
  const ra = res.headers.get('retry-after');
  const s = ra === null ? NaN : Number(ra);
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const fecha = ra ? Date.parse(ra) : NaN;
  if (Number.isFinite(fecha)) return Math.max(0, fecha - Date.now());
  return 500 * 2 ** intento;
}

/** Un GET con timeout, presupuesto total y reintentos acotados solo para 429/5xx/red/timeout. */
async function pedir(ruta: string, deps: Dependencias, limite: number): Promise<Respuesta> {
  const token = deps.token();
  if (!token) return { ok: false, error: { codigo: 'sin-configuracion' } };
  let ultimo: ErrorLectura = { codigo: 'proveedor-no-disponible' };
  for (let intento = 0; intento <= LIMITES.reintentos; intento++) {
    const restante = limite - deps.ahora();
    if (restante <= 0) return { ok: false, error: { codigo: 'tiempo-agotado' } };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(LIMITES.timeoutMs, restante));
    let res: Response;
    try {
      res = await limitar(() =>
        deps.fetch(BASE + ruta, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: ctrl.signal,
          cache: 'no-store',
        }),
      );
    } catch (e) {
      clearTimeout(timer);
      ultimo = {
        codigo: ctrl.signal.aborted ? 'tiempo-agotado' : 'proveedor-no-disponible',
        detalle: e instanceof Error ? e.name : 'error de red',
      };
      if (intento < LIMITES.reintentos) await deps.esperar(500 * 2 ** intento);
      continue;
    }
    clearTimeout(timer);
    if (res.ok) {
      try {
        return { ok: true, cuerpo: await res.json() };
      } catch {
        return { ok: false, error: { codigo: 'respuesta-invalida', detalle: 'json' } };
      }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: { codigo: 'credenciales-proveedor', detalle: String(res.status) } };
    if (res.status === 404) return { ok: false, error: { codigo: 'sucursal-no-encontrada' } };
    if (res.status === 429 || res.status >= 500) {
      ultimo = {
        codigo: res.status === 429 ? 'limite-proveedor' : 'proveedor-no-disponible',
        detalle: String(res.status),
      };
      const espera = esperaReintento(res, intento);
      if (intento < LIMITES.reintentos && espera < limite - deps.ahora()) {
        await deps.esperar(espera);
        continue;
      }
      return { ok: false, error: ultimo };
    }
    return { ok: false, error: { codigo: 'respuesta-invalida', detalle: String(res.status) } };
  }
  return { ok: false, error: ultimo };
}

export function validarVentana(companyId: number, desde: string, hasta: string) {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) return 'company_id inválido';
  if (!fechaValida(desde) || !fechaValida(hasta)) return 'fecha inválida';
  const dias = diasEntre(desde, hasta);
  if (dias < 0) return 'desde es posterior a hasta';
  if (dias >= LIMITES.diasMaximos) return `el periodo excede ${LIMITES.diasMaximos} días`;
  return null;
}

/**
 * Lee todos los pedidos de una ventana cerrada o abierta. Recorre hasta `totalPages`, deduplica por id y
 * verifica que cada registro sea de la company pedida. Si el total cambia durante el recorrido, repite
 * la lectura una vez; si vuelve a cambiar, la marca incompleta. Nunca declara completa una lectura parcial.
 */
export async function leerPedidos(
  companyId: number,
  desde: string,
  hasta: string,
  deps: Dependencias = dependenciasReales,
): Promise<LecturaCruda> {
  const invalida = validarVentana(companyId, desde, hasta);
  if (invalida) throw new Error(invalida);
  const limite = deps.ahora() + LIMITES.presupuestoMs;
  let r = await recorrer(companyId, desde, hasta, deps, limite);
  if (r.errores.some((e) => e.codigo === 'total-cambiante') && r.errores.length === 1)
    r = await recorrer(companyId, desde, hasta, deps, limite);
  return r;
}

async function recorrer(
  companyId: number,
  desde: string,
  hasta: string,
  deps: Dependencias,
  limite: number,
): Promise<LecturaCruda> {
  const vistos = new Map<number, Record<string, unknown>>();
  const errores: ErrorLectura[] = [];
  let total: number | null = null;
  let paginas = 0;
  let invalidos = 0;
  let ajenos = 0;
  let firmaAnterior = '';
  for (let pagina = 1; ; pagina++) {
    if (pagina > LIMITES.paginas) {
      errores.push({ codigo: 'tope-alcanzado', detalle: 'paginas' });
      break;
    }
    const q = new URLSearchParams({
      dateStart: desde,
      dateEnd: hasta,
      perPage: String(POR_PAGINA),
      page: String(pagina),
    });
    const r = await pedir(`/order/company/${companyId}?${q}`, deps, limite);
    if (!r.ok) {
      errores.push(r.error);
      break;
    }
    const env = Envelope.safeParse(r.cuerpo);
    if (!env.success) {
      errores.push({ codigo: 'respuesta-invalida', detalle: 'envelope' });
      break;
    }
    paginas++;
    const { totalItems, totalPages, data } = env.data;
    if (total !== null && totalItems !== total) {
      errores.push({ codigo: 'total-cambiante' });
      break;
    }
    total = totalItems;
    if (data.length === 0) {
      if (totalItems > 0) errores.push({ codigo: 'pagina-vacia-inesperada' });
      break;
    }
    const firma = data.map((p) => String(p.id)).join(',');
    if (firma === firmaAnterior) {
      errores.push({ codigo: 'pagina-repetida' });
      break;
    }
    firmaAnterior = firma;
    for (const p of data) {
      if (typeof p.id !== 'number' || !Number.isSafeInteger(p.id)) invalidos++;
      else if (p.companyId !== companyId) ajenos++;
      else vistos.set(p.id, p);
    }
    if (vistos.size > LIMITES.filas) {
      errores.push({ codigo: 'tope-alcanzado', detalle: 'filas' });
      break;
    }
    if (pagina >= totalPages) break;
  }
  if (invalidos) errores.push({ codigo: 'registros-invalidos', detalle: `${invalidos} sin id` });
  if (ajenos) errores.push({ codigo: 'identidad-discrepante', detalle: `${ajenos} de otra company` });
  const completo = errores.length === 0 && total !== null && vistos.size === total;
  if (!completo && errores.length === 0)
    errores.push({ codigo: 'respuesta-invalida', detalle: `unicos ${vistos.size} ≠ total ${total}` });
  return {
    companyId,
    desde,
    hasta,
    leidoEn: deps.ahora(),
    totalDeclarado: total,
    paginas,
    completo,
    errores,
    registros: [...vistos.values()],
  };
}

/** Catálogo de sucursales de la API (para verificar identidad; no se usa para habilitar sucursales). */
export async function leerCatalogo(
  deps: Dependencias = dependenciasReales,
): Promise<{ ok: true; sucursales: SucursalApi[] } | { ok: false; error: ErrorLectura }> {
  const r = await pedir('/company/list/all', deps, deps.ahora() + LIMITES.presupuestoMs);
  if (!r.ok) return r;
  const c = Catalogo.safeParse(r.cuerpo);
  if (!c.success) return { ok: false, error: { codigo: 'respuesta-invalida', detalle: 'catalogo' } };
  return { ok: true, sucursales: c.data };
}
