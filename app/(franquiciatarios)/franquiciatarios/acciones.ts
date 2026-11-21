'use server';
import { cookies, headers } from 'next/headers';
import { refresh } from 'next/cache';
import {
  COOKIE_VER_COMO,
  ROLES_VISTA,
  sesionFranquiciatarios,
  esGestorFranq,
  type RolFranq,
} from '@/lib/supabase/sesion';
import { cookieBarista } from '@/lib/franquiciatarios/servidor';
import { configDe } from '@/lib/sucursales/config';
import { armarPedidos } from '@/lib/franquiciatarios/pedidos';
import { leerPedidosSucursal } from '@/lib/franquiciatarios/pedidos-servidor';
import type {
  MomentoArqueo,
  MomentoConteo,
  MotivoMerma,
  SeccionClave,
  TipoFirma,
} from '@/lib/franquiciatarios/tipos';

export type Resultado = { ok: true } | { error: string };

const SECCIONES: SeccionClave[] = ['apertura', 'durante', 'cambio', 'medio', 'cierre'];
const FIRMAS: TipoFirma[] = ['responsable', 'entrega', 'recibe', 'visto_bueno'];
const SIN_ACCESO = 'No tienes acceso a esta sucursal.';

/** Sesión del módulo y rol en la sucursal pedida; null si no la tiene (la base lo vuelve a exigir). */
async function contexto(companyId: number) {
  const s = await sesionFranquiciatarios(false).catch(() => null);
  if (!s) return null;
  const rol = Number.isSafeInteger(companyId) ? s.sucursales.get(companyId) : undefined;
  return rol ? { ...s, rol } : null;
}

const dispositivo = async () => (await headers()).get('user-agent')?.slice(0, 300) ?? null;

/** Barista declarado en este dispositivo (solo la cuenta de baristas lo necesita; la base valida que esté activo). */
async function barista(companyId: number, rol: RolFranq): Promise<number | null> {
  if (rol !== 'barista') return null;
  const v = Number((await cookies()).get(cookieBarista(companyId))?.value);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** Mensaje para la persona: los de la base ya vienen en español; cualquier otro, genérico. */
const fallo = (e: unknown): { error: string } => {
  const x = (e && typeof e === 'object' ? e : {}) as { message?: unknown; code?: unknown };
  const m = typeof x.message === 'string' ? x.message : '';
  // P0001: mensajes que escribimos en las funciones de las migraciones 75 y 79 (ya en español, para la persona).
  if (x.code === 'P0001' && m.length < 300) return { error: m };
  if (x.code === '42501') return { error: m.startsWith('Solo') ? m : SIN_ACCESO };
  // Dos dispositivos registraron lo mismo a la vez: lo otro ya quedó.
  if (x.code === '23505') return { error: 'Alguien más lo acaba de registrar. Actualiza la pantalla.' };
  if (x.code) return { error: 'No se pudo guardar. Intenta de nuevo o avisa al gerente.' };
  return { error: 'No se guardó. Revisa la conexión e intenta de nuevo.' };
};

async function ejecutar(fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<Resultado> {
  try {
    const r = await fn();
    if (r.error) return fallo(r.error);
    refresh();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Solo el admin del módulo: elige con qué rol ver las pantallas (vista previa). Sus permisos no cambian. */
export async function verComo(rol: RolFranq): Promise<Resultado> {
  const s = await sesionFranquiciatarios(false).catch(() => null);
  if (!s?.admin) return { error: 'Solo el administrador del módulo usa la vista previa.' };
  if (!ROLES_VISTA.includes(rol)) return { error: 'Rol inválido.' };
  const jar = await cookies();
  if (rol === 'admin') jar.delete(COOKIE_VER_COMO);
  else
    jar.set(COOKIE_VER_COMO, rol, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  refresh();
  return { ok: true };
}

/** La cuenta de baristas declara quién está usando el dispositivo. null = cambiar de persona. */
export async function elegirBarista(companyId: number, baristaId: number | null): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c) return { error: SIN_ACCESO };
  const jar = await cookies();
  if (baristaId === null) {
    jar.delete(cookieBarista(companyId));
    refresh();
    return { ok: true };
  }
  const r = await c.db
    .from('franq_baristas')
    .select('id')
    .eq('id', baristaId)
    .eq('company_id', companyId)
    .eq('activo', true)
    .maybeSingle();
  if (r.error || !r.data) return { error: 'Ese nombre ya no está activo. Elige otro.' };
  jar.set(cookieBarista(companyId), String(baristaId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 14, // un turno largo; al día siguiente se vuelve a elegir
  });
  refresh();
  return { ok: true };
}

export async function responder(datos: {
  companyId: number;
  seccion: SeccionClave;
  punto: number;
  cumple: boolean;
  observacion?: string | null;
  motivo?: string | null;
  dato?: string | null;
}): Promise<Resultado> {
  if (!SECCIONES.includes(datos.seccion) || typeof datos.cumple !== 'boolean')
    return { error: 'Datos inválidos.' };
  const c = await contexto(datos.companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(datos.companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_responder', {
      p_company: datos.companyId,
      p_seccion: datos.seccion,
      p_punto: datos.punto,
      p_cumple: datos.cumple,
      p_observacion: datos.observacion ?? null,
      p_barista: b,
      p_dispositivo: disp,
      p_motivo: datos.motivo ?? null,
      p_dato: datos.dato ?? null,
    }),
  );
}

export async function firmar(companyId: number, seccion: SeccionClave, tipo: TipoFirma): Promise<Resultado> {
  if (!SECCIONES.includes(seccion) || !FIRMAS.includes(tipo)) return { error: 'Datos inválidos.' };
  const c = await contexto(companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de firmar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_firmar', {
      p_company: companyId,
      p_seccion: seccion,
      p_tipo: tipo,
      p_barista: b,
      p_dispositivo: disp,
    }),
  );
}

export async function registrarIncidencia(companyId: number, texto: string): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_incidencia', {
      p_company: companyId,
      p_texto: String(texto ?? ''),
      p_barista: b,
      p_dispositivo: disp,
    }),
  );
}

export async function corregir(datos: {
  companyId: number;
  respuesta: number;
  cumple: boolean;
  observacion?: string | null;
  motivo: string;
  dato?: string | null;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario corrigen registros.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_corregir', {
      p_respuesta: datos.respuesta,
      p_cumple: datos.cumple,
      p_observacion: datos.observacion ?? null,
      p_motivo: String(datos.motivo ?? ''),
      p_dispositivo: disp,
      p_dato: datos.dato ?? null,
    }),
  );
}

export async function guardarBarista(datos: {
  companyId: number;
  id: number | null;
  nombre: string;
  activo: boolean;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario administran los nombres.' };
  return ejecutar(() =>
    c.db.rpc('franq_barista_guardar', {
      p_company: datos.companyId,
      p_id: datos.id,
      p_nombre: String(datos.nombre ?? ''),
      p_activo: datos.activo,
    }),
  );
}

/**
 * Recepción de un pedido a la Comercializadora. El servidor vuelve a leer el pedido de ESTA sucursal (candado de
 * apertura) y arma las diferencias contra sus cantidades: del navegador solo llega lo recibido por renglón.
 */
export async function recibirPedido(datos: {
  companyId: number;
  pedido: string;
  /** Cantidad recibida por renglón, en el orden en que se mostraron las líneas del pedido. */
  recibidos: number[];
  observacion?: string | null;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  // Pedidos y recepciones son de gerencia (la base también lo exige: migración 82).
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario registran recepciones.' };
  const cfg = configDe(datos.companyId);
  if (!cfg) return { error: SIN_ACCESO };
  const lectura = await leerPedidosSucursal(cfg);
  if (!lectura.ok) return { error: lectura.error };
  const recepciones = await c.db
    .from('franq_recepciones')
    .select('*')
    .eq('company_id', datos.companyId)
    .eq('pedido_id', String(datos.pedido));
  if (recepciones.error) return { error: 'No se pudo revisar el pedido. Intenta de nuevo.' };
  const pedido = armarPedidos(
    lectura.filas.filter((f) => f.id === datos.pedido),
    recepciones.data ?? [],
    { conMontos: false },
  )[0];
  if (!pedido) return { error: 'Ese pedido no es de esta sucursal.' };
  if (!pedido.recibible)
    return {
      error: pedido.recepcion
        ? 'Este pedido ya tiene su recepción registrada.'
        : 'Este pedido aún no se puede recibir.',
    };
  const rec = Array.isArray(datos.recibidos) ? datos.recibidos : [];
  if (
    rec.length !== pedido.lineas.length ||
    rec.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)
  )
    return { error: 'Revisa las cantidades recibidas.' };
  const diferencias = pedido.lineas
    .map((l, i) => ({ nombre: l.nombre, sku: l.sku, pedido: l.cantidad, recibido: rec[i] }))
    .filter((d) => d.pedido !== d.recibido);
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_recibir', {
      p_company: datos.companyId,
      p_pedido: pedido.id,
      p_folio: pedido.folio,
      p_diferencias: diferencias,
      p_observacion: datos.observacion ?? null,
      p_barista: null,
      p_dispositivo: disp,
    }),
  );
}

/** Conteo de insumos críticos de hoy (apertura o medio turno). Cualquier rol de la sucursal; la base exige completo. */
export async function contar(datos: {
  companyId: number;
  momento: MomentoConteo;
  conteos: { insumo: number; cantidad: number }[];
}): Promise<Resultado> {
  if (datos.momento !== 'apertura' && datos.momento !== 'medio') return { error: 'Datos inválidos.' };
  const lista = Array.isArray(datos.conteos) ? datos.conteos : [];
  if (
    lista.some(
      (c) =>
        !Number.isSafeInteger(c?.insumo) || typeof c?.cantidad !== 'number' || !Number.isFinite(c.cantidad),
    )
  )
    return { error: 'Revisa las cantidades.' };
  const c = await contexto(datos.companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(datos.companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_contar', {
      p_company: datos.companyId,
      p_momento: datos.momento,
      p_conteos: lista.map((x) => ({ insumo: x.insumo, cantidad: x.cantidad })),
      p_barista: b,
      p_dispositivo: disp,
    }),
  );
}

/** Arma la lista de insumos críticos sugerida por el consumo teórico (solo si la sucursal no tiene lista). */
export async function sugerirInsumos(companyId: number): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: 'Solo el gerente o el franquiciatario arman la lista.' };
  return ejecutar(() => c.db.rpc('franq_sugerir_insumos', { p_company: companyId }));
}

export async function guardarInsumo(datos: {
  companyId: number;
  id: number | null;
  nombre: string;
  unidad: string;
  orden: number | null;
  activo: boolean;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: 'Solo el gerente o el franquiciatario ajustan la lista.' };
  return ejecutar(() =>
    c.db.rpc('franq_insumo_guardar', {
      p_company: datos.companyId,
      p_id: datos.id,
      p_nombre: String(datos.nombre ?? ''),
      p_unidad: String(datos.unidad ?? ''),
      p_orden: datos.orden,
      p_activo: datos.activo,
    }),
  );
}

/** Arqueo ciego de hoy (medio turno o cierre). Cualquier rol; no devuelve nada de lo esperado. */
export async function arquear(datos: {
  companyId: number;
  momento: MomentoArqueo;
  contado: number;
  observacion?: string | null;
}): Promise<Resultado> {
  if ((datos.momento !== 'medio' && datos.momento !== 'cierre') || !Number.isFinite(datos.contado))
    return { error: 'Datos inválidos.' };
  const c = await contexto(datos.companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(datos.companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_arquear', {
      p_company: datos.companyId,
      p_momento: datos.momento,
      p_contado: datos.contado,
      p_observacion: datos.observacion ?? null,
      p_barista: b,
      p_dispositivo: disp,
    }),
  );
}

const SOLO_GERENCIA = 'Solo el gerente o el franquiciatario manejan la caja chica.';

export async function registrarGasto(datos: {
  companyId: number;
  concepto: string;
  categoria: string;
  monto: number;
  enEfectivo: boolean;
  comprobante: boolean;
  nota?: string | null;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GERENCIA };
  if (!Number.isFinite(datos.monto)) return { error: 'Escribe el monto del gasto.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_gasto', {
      p_company: datos.companyId,
      p_concepto: String(datos.concepto ?? ''),
      p_categoria: String(datos.categoria ?? ''),
      p_monto: datos.monto,
      p_en_efectivo: Boolean(datos.enEfectivo),
      p_comprobante: Boolean(datos.comprobante),
      p_nota: datos.nota ?? null,
      p_dispositivo: disp,
    }),
  );
}

export async function anularGasto(companyId: number, gasto: number, motivo: string): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GERENCIA };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_gasto_anular', { p_gasto: gasto, p_motivo: String(motivo ?? ''), p_dispositivo: disp }),
  );
}

export async function configurarCaja(
  companyId: number,
  fondo: number,
  tolerancia: number,
): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario configuran la caja.' };
  if (!Number.isFinite(fondo) || !Number.isFinite(tolerancia))
    return { error: 'Revisa el fondo y la tolerancia.' };
  return ejecutar(() =>
    c.db.rpc('franq_caja_configurar', { p_company: companyId, p_fondo: fondo, p_tolerancia: tolerancia }),
  );
}

/** Gasto fijo del mes (renta, nómina…): corrige o completa lo que vino de Zoho. Solo gerencia. */
export async function guardarGastoFijo(datos: {
  companyId: number;
  mes: string;
  concepto: string;
  monto: number;
  nota?: string | null;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario capturan los gastos fijos.' };
  if (!/^\d{4}-\d{2}$/.test(datos.mes) || !Number.isFinite(datos.monto)) return { error: 'Datos inválidos.' };
  return ejecutar(() =>
    c.db.rpc('franq_gasto_fijo', {
      p_company: datos.companyId,
      p_mes: `${datos.mes}-01`,
      p_concepto: String(datos.concepto ?? ''),
      p_monto: datos.monto,
      p_nota: datos.nota ?? null,
    }),
  );
}

// ── F6 · Matriz de roles por posición (migración 92) ─────────────────────────────────────────────────────────────
const SOLO_GESTOR_ROLES = 'Solo el gerente o el franquiciatario arman la matriz de roles.';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

/** Siembra la lista base de posiciones y turnos (solo si la sucursal no tiene ninguno). */
export async function rolesBase(companyId: number): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GESTOR_ROLES };
  return ejecutar(() => c.db.rpc('franq_roles_base', { p_company: companyId }));
}

export async function guardarPosicion(datos: {
  companyId: number;
  id: number | null;
  nombre: string;
  activo: boolean;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GESTOR_ROLES };
  return ejecutar(() =>
    c.db.rpc('franq_posicion_guardar', {
      p_company: datos.companyId,
      p_id: datos.id,
      p_nombre: String(datos.nombre ?? ''),
      p_orden: null,
      p_activo: datos.activo,
    }),
  );
}

export async function guardarTurno(datos: {
  companyId: number;
  id: number | null;
  nombre: string;
  entrada: string;
  salida: string;
  activo: boolean;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GESTOR_ROLES };
  if (!HORA.test(datos.entrada) || !HORA.test(datos.salida)) return { error: 'Escribe las horas como 07:00.' };
  return ejecutar(() =>
    c.db.rpc('franq_turno_guardar', {
      p_company: datos.companyId,
      p_id: datos.id,
      p_nombre: String(datos.nombre ?? ''),
      p_entrada: datos.entrada,
      p_salida: datos.salida,
      p_activo: datos.activo,
    }),
  );
}

/** Asigna (o quita) a un barista en un día, turno y posición. */
export async function asignar(datos: {
  companyId: number;
  dia: string;
  turno: number;
  posicion: number;
  barista: number;
  quitar: boolean;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GESTOR_ROLES };
  if (!FECHA.test(datos.dia)) return { error: 'Fecha inválida.' };
  return ejecutar(() =>
    c.db.rpc('franq_asignar', {
      p_company: datos.companyId,
      p_dia: datos.dia,
      p_turno: datos.turno,
      p_posicion: datos.posicion,
      p_barista: datos.barista,
      p_quitar: datos.quitar,
    }),
  );
}

/** Copia la semana anterior a los días vacíos de la semana que empieza en `lunes`. */
export async function copiarSemana(companyId: number, lunes: string): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: SOLO_GESTOR_ROLES };
  if (!FECHA.test(lunes)) return { error: 'Fecha inválida.' };
  return ejecutar(() => c.db.rpc('franq_copiar_semana', { p_company: companyId, p_lunes: lunes }));
}

// ── F6 · Mermas (migración 92) ───────────────────────────────────────────────────────────────────────────────────
const MOTIVOS_MERMA: MotivoMerma[] = ['caducidad', 'preparacion', 'caida', 'devolucion', 'otro'];

/** Registra una merma de hoy, o corrige / anula un registro vigente (`corrige`). Cualquier rol de la sucursal. */
export async function registrarMerma(datos: {
  companyId: number;
  insumo: number | null;
  cantidad: number | null;
  motivo: MotivoMerma | null;
  nota?: string | null;
  corrige?: number | null;
  anular?: boolean;
  motivoCorreccion?: string | null;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(datos.companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  if (!datos.anular) {
    if (!datos.insumo) return { error: 'Elige el insumo.' };
    if (!Number.isFinite(datos.cantidad) || (datos.cantidad ?? 0) <= 0) return { error: 'Escribe la cantidad.' };
    if (!datos.motivo || !MOTIVOS_MERMA.includes(datos.motivo)) return { error: 'Elige el motivo.' };
  }
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_registrar_merma', {
      p_company: datos.companyId,
      p_insumo: datos.insumo,
      p_cantidad: datos.cantidad,
      p_motivo: datos.motivo,
      p_nota: datos.nota ?? null,
      p_barista: b,
      p_dispositivo: disp,
      p_corrige: datos.corrige ?? null,
      p_anular: !!datos.anular,
      p_motivo_correccion: datos.motivoCorreccion ?? null,
    }),
  );
}

export async function cerrarMermas(companyId: number, dia: string): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: 'Solo el gerente o el franquiciatario cierran las mermas.' };
  if (!FECHA.test(dia)) return { error: 'Fecha inválida.' };
  return ejecutar(() => c.db.rpc('franq_cerrar_mermas', { p_company: companyId, p_dia: dia }));
}

export async function guardarTolerancia(companyId: number, insumo: number, pct: number): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c || !esGestorFranq(c.rol)) return { error: 'Solo el gerente o el franquiciatario ajustan la tolerancia.' };
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: 'La tolerancia va de 0 a 100 %.' };
  return ejecutar(() =>
    c.db.rpc('franq_tolerancia_guardar', { p_company: companyId, p_insumo: insumo, p_pct: pct }),
  );
}
