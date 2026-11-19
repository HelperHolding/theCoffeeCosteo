import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';
import { configDe } from '../sucursales/config';
import type { DatosConsumo } from '../sucursales/consumo';
import { recetasServicio } from '../sucursales/consumo-mes-servidor';
import { catalogoServicio, rappiServicio } from '../sucursales/corte-servidor';
import { leerDias } from '../sucursales/datos';
import type { CatalogoNombres } from '../sucursales/metricas';
import { com, leerTodoCom } from './consultas';
import { enviarCorreoInterno, type ResultadoCorreo } from './correoServidor';
import { hoyCdmx, masDias } from './fechas';
import { pedidosAperturaLegado, pedidosPlanLegado } from './legado';
import { consumoVentana, type ConsumoTienda } from './ovConsumo';
import { correoOvs, type TiendaCorreo } from './ovCorreo';
import {
  CORREOS_OVS,
  DIAS_CONSUMO,
  DIAS_HISTORIA,
  cadencia,
  calcularLineas,
  correosOvs,
  diarioPorSku,
  lunesDe,
  medicion,
  pedidosResurtido,
  ultimoPedido,
  type FilaCatalogoOv,
  type InsumoSku,
  type LineaOv,
} from './ovSugerida';

/**
 * Corrida semanal del piloto de OV sugerida (spec §5): por cada tienda activa de com_ovs_tiendas lee pedidos (puente),
 * ventas del POS (28 días) y la corrida de la semana anterior, calcula, guarda (com_ovs_guardar) y manda un correo con
 * todas. Una tienda que falla no detiene a las demás. Solo escribe com_ovs_* y com_sync_log; nada en Shopify ni Zoho.
 */
export const PROCESO_OVS = 'com-ovs';

export interface TiendaOvs {
  company_id: number;
  apertura_id: string;
  nombre: string;
}
export interface ComunesOvs {
  catalogo: FilaCatalogoOv[];
  mapa: { shopify_nombre: string; sku: string }[];
  insumoSku: InsumoSku[];
  pedidosApertura: string[];
  correos: string[];
}
export interface CorridaAnterior {
  semana: string;
  lineas: { sku: string; sugerido: number; arrastre: number }[];
}
export interface CorridaGuardar {
  semana: string;
  company_id: number;
  cadencia: number | null;
  estado: 'ok' | 'error';
  error: string | null;
  lineas: LineaOv[];
}
export interface FilaBitacora {
  inicio: string;
  fin: string;
  ok: boolean;
  resumen: unknown;
  error: string | null;
}
export interface DepsOvs {
  ahora: () => Date;
  tiendas: () => Promise<TiendaOvs[]>;
  comunes: () => Promise<ComunesOvs>;
  /** Pedidos vigentes de una apertura con fecha_pedido ≥ desde. */
  pedidos: (aperturaId: string, desde: string) => Promise<PedidoPlan[]>;
  consumo: (companyId: number, desde: string, hasta: string) => Promise<ConsumoTienda>;
  /** La corrida 'ok' de la semana anterior (semana − 7) de la tienda, o null. */
  anterior: (companyId: number, semana: string) => Promise<CorridaAnterior | null>;
  /** ¿La tienda ya tiene una corrida 'ok' de esta semana? (revisión final: no se recalcula sin forzar). */
  yaCalculada: (companyId: number, semana: string) => Promise<boolean>;
  guardar: (c: CorridaGuardar) => Promise<void>;
  bitacora: (f: FilaBitacora) => Promise<void>;
  enviar: (para: string[], asunto: string, html: string) => Promise<ResultadoCorreo>;
}
export interface ResumenTiendaOvs {
  company_id: number;
  nombre: string;
  estado: 'ok' | 'error';
  error: string | null;
  guardada: boolean;
  /** Ya tenía corrida 'ok' esta semana y no se forzó: no se recalculó, no se guardó ni salió en el correo. */
  omitida?: boolean;
  lineas: number;
  sugeridas: number;
  monto: number;
}
export interface ResumenOvs {
  semana: string;
  hoy: string;
  tiendas: ResumenTiendaOvs[];
  correo: ResultadoCorreo | 'sin-tiendas';
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function calcularTienda(
  t: TiendaOvs,
  c: ComunesOvs,
  hoy: string,
  semana: string,
  deps: DepsOvs,
): Promise<{ correo: TiendaCorreo; corrida: CorridaGuardar }> {
  const [crudos, consumo, anterior] = await Promise.all([
    // Un día de más: fecha_pedido es timestamptz y el día que cuenta es el de CDMX (pedidosResurtido lo recorta).
    deps.pedidos(t.apertura_id, masDias(hoy, -(DIAS_HISTORIA + 1))),
    deps.consumo(t.company_id, masDias(hoy, -DIAS_CONSUMO), masDias(hoy, -1)),
    deps.anterior(t.company_id, semana),
  ]);
  if (!consumo.ok) throw new Error(`POS: ${consumo.motivo}`);
  const r = pedidosResurtido({
    pedidos: crudos,
    aperturaId: t.apertura_id,
    pedidosApertura: c.pedidosApertura,
    mapa: c.mapa,
    catalogo: c.catalogo,
  });
  const cad = cadencia(r.pedidos, hoy);
  const receta = diarioPorSku({ insumos: consumo.insumos, dias: consumo.dias, mapeo: c.insumoSku });
  const { lineas, inactivos } = calcularLineas({
    hoy,
    cadencia: cad.dias,
    recetaDiaria: receta.porSku,
    skusReceta: new Set(c.insumoSku.filter((m) => m.activo).map((m) => m.sku)),
    pedidos: r.pedidos,
    catalogo: c.catalogo,
    arrastrePrevio: new Map((anterior?.lineas ?? []).map((l) => [l.sku, l.arrastre])),
  });
  const avisos: string[] = [];
  if (!consumo.completa)
    avisos.push(`Lectura del POS incompleta (el consumo puede quedar bajo): ${consumo.avisos.join(' ')}`);
  if (!consumo.pedidos)
    avisos.push('Sin ventas del POS en los últimos 28 días: solo se sugiere lo de historial.');
  if (!cad.diasConPedido) avisos.push('Sin pedidos de resurtido en 90 días.');
  if (r.sinSku) avisos.push(`${r.sinSku} artículos de pedidos sin SKU (no se cuentan).`);
  if (r.fueraDeCatalogo.length)
    avisos.push(`SKUs pedidos que no están en el catálogo (no se cuentan): ${r.fueraDeCatalogo.join(', ')}.`);
  return {
    correo: {
      nombre: t.nombre,
      estado: 'ok',
      error: null,
      cadencia: cad.dias,
      cadenciaPorDefecto: cad.porDefecto,
      ultimoPedido: ultimoPedido(r.pedidos, hoy),
      cobertura: consumo.cobertura,
      lineas,
      medicion: anterior
        ? medicion({
            anteriores: anterior.lineas,
            desde: anterior.semana,
            hoy,
            pedidos: r.pedidos,
            catalogo: c.catalogo,
          })
        : null,
      inactivos,
      sinMapeo: receta.sinMapeo,
      avisos,
    },
    corrida: { semana, company_id: t.company_id, cadencia: cad.dias, estado: 'ok', error: null, lineas },
  };
}

function conError(
  t: TiendaOvs,
  semana: string,
  motivo: string,
): { correo: TiendaCorreo; corrida: CorridaGuardar } {
  return {
    correo: {
      nombre: t.nombre,
      estado: 'error',
      error: motivo,
      cadencia: null,
      cadenciaPorDefecto: false,
      ultimoPedido: null,
      cobertura: null,
      lineas: [],
      medicion: null,
      inactivos: [],
      sinMapeo: [],
      avisos: [],
    },
    corrida: { semana, company_id: t.company_id, cadencia: null, estado: 'error', error: motivo, lineas: [] },
  };
}

/**
 * `forzar`: recalcula aunque la semana ya tenga corrida 'ok'. Sin él (el cron y una corrida a mano normal), la tienda que ya
 * se calculó esta semana se omite: así la sugerencia que ya se mandó no se reemplaza a media semana (la medición de la
 * semana siguiente compara contra ella) y un reintento fallido no avisa "no se calculó" (revisión final).
 */
export async function correrOvs(deps: DepsOvs, opts: { forzar?: boolean } = {}): Promise<ResumenOvs> {
  const inicio = deps.ahora().toISOString();
  const hoy = hoyCdmx(deps.ahora());
  const semana = lunesDe(hoy);
  const anotar = async (f: Omit<FilaBitacora, 'inicio' | 'fin'>) => {
    try {
      await deps.bitacora({ inicio, fin: deps.ahora().toISOString(), ...f });
    } catch (e) {
      console.error('[comercializadora] ov-sugerida: no se pudo escribir la bitácora', mensaje(e));
    }
  };
  let tiendas: TiendaOvs[];
  try {
    tiendas = await deps.tiendas();
  } catch (e) {
    await anotar({ ok: false, resumen: { semana, hoy }, error: mensaje(e) });
    throw e;
  }
  let comunes: ComunesOvs | null = null;
  let errorComun = '';
  try {
    comunes = await deps.comunes();
  } catch (e) {
    errorComun = mensaje(e);
  }
  const resumen: ResumenOvs = { semana, hoy, tiendas: [], correo: 'sin-tiendas' };
  const paraCorreo: TiendaCorreo[] = [];
  const errores: string[] = [];
  for (const t of tiendas) {
    if (!opts.forzar) {
      let ya = false;
      try {
        ya = await deps.yaCalculada(t.company_id, semana);
      } catch (e) {
        console.error(
          '[comercializadora] ov-sugerida: no se pudo revisar la corrida de la semana',
          mensaje(e),
        );
      }
      if (ya) {
        resumen.tiendas.push({
          company_id: t.company_id,
          nombre: t.nombre,
          estado: 'ok',
          error: null,
          guardada: false,
          omitida: true,
          lineas: 0,
          sugeridas: 0,
          monto: 0,
        });
        continue;
      }
    }
    let r: { correo: TiendaCorreo; corrida: CorridaGuardar };
    try {
      if (!comunes) throw new Error(errorComun);
      r = await calcularTienda(t, comunes, hoy, semana, deps);
    } catch (e) {
      r = conError(t, semana, mensaje(e));
    }
    let guardada = true;
    try {
      await deps.guardar(r.corrida);
    } catch (e) {
      guardada = false;
      r.correo.avisos.push(`No se pudo guardar la corrida: ${mensaje(e)}`);
      errores.push(`${t.company_id}: no se guardó (${mensaje(e)})`);
    }
    if (r.corrida.estado === 'error') errores.push(`${t.company_id}: ${r.corrida.error}`);
    paraCorreo.push(r.correo);
    const sugeridas = r.corrida.lineas.filter((l) => l.sugerido > 0);
    resumen.tiendas.push({
      company_id: t.company_id,
      nombre: t.nombre,
      estado: r.corrida.estado,
      error: r.corrida.error,
      guardada,
      lineas: r.corrida.lineas.length,
      sugeridas: sugeridas.length,
      monto: Math.round(sugeridas.reduce((s, l) => s + (l.monto ?? 0), 0) * 100) / 100,
    });
  }
  if (paraCorreo.length) {
    const { asunto, html } = correoOvs(semana, paraCorreo);
    resumen.correo = await deps.enviar(comunes?.correos ?? CORREOS_OVS, asunto, html);
  }
  await anotar({
    ok: !errores.length && resumen.correo !== 'fallo',
    resumen: {
      ...resumen,
      correo: resumen.correo === 'no-configurado' ? 'correo no configurado' : resumen.correo,
    },
    error: errores.length ? errores.join(' · ') : null,
  });
  return resumen;
}

/** Dependencias de producción: llave de servicio (portal) y el puente al sitio viejo (legado.ts). */
export function depsReales(db: SupabaseClient): DepsOvs {
  let recetas: Promise<{ datos: DatosConsumo | null; catalogo: CatalogoNombres | undefined }> | null = null;
  return {
    ahora: () => new Date(),
    tiendas: async () => {
      const r = await com(db)
        .from('com_ovs_tiendas')
        .select('company_id,apertura_id,nombre')
        .eq('activo', true)
        .order('company_id');
      if (r.error) throw new Error('No se pudieron leer las tiendas del piloto.');
      return (r.data ?? []).map((x: { company_id: unknown; apertura_id: unknown; nombre: unknown }) => ({
        company_id: Number(x.company_id),
        apertura_id: String(x.apertura_id),
        nombre: String(x.nombre),
      }));
    },
    comunes: async () => {
      const [catalogo, mapa, insumoSku, cfg, apertura] = await Promise.all([
        leerTodoCom<FilaCatalogoOv>(db, 'com_catalogo', 'sku,nombre,estatus,costo_unitario', 'sku'),
        leerTodoCom<{ shopify_nombre: string; sku: string }>(
          db,
          'com_sku_mapping',
          'shopify_nombre,sku',
          'id',
        ),
        leerTodoCom<InsumoSku>(db, 'com_insumo_sku', 'insumo_id,sku,factor,activo', 'sku'),
        com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
        pedidosAperturaLegado(),
      ]);
      if (!apertura.ok) throw new Error(apertura.error);
      return {
        catalogo: catalogo.map((c) => ({
          ...c,
          costo_unitario: c.costo_unitario == null ? null : Number(c.costo_unitario),
        })),
        mapa,
        insumoSku: insumoSku.map((m) => ({ ...m, factor: Number(m.factor) })),
        pedidosApertura: apertura.datos.map((p) => p.pedido_id),
        correos: correosOvs(cfg.error ? null : cfg.data?.config),
      };
    },
    pedidos: async (aperturaId, desde) => {
      const r = await pedidosPlanLegado((q) => q.eq('apertura_id', aperturaId).gte('fecha_pedido', desde));
      if (!r.ok) throw new Error(r.error);
      return r.datos;
    },
    consumo: async (companyId, desde, hasta) => {
      const cfg = configDe(companyId);
      if (!cfg) return { ok: false, motivo: 'La sucursal no está configurada en Sucursales.' };
      recetas ??= (async () => ({
        datos: await recetasServicio(db),
        catalogo: await catalogoServicio(db),
      }))();
      const { datos, catalogo } = await recetas;
      if (!datos) return { ok: false, motivo: 'No se pudieron leer las recetas.' };
      // Sin catálogo POS el consumo saldría menor (productos sin código): mejor no calcular (como consumo-mes).
      if (!catalogo) return { ok: false, motivo: 'No se pudo leer el catálogo POS.' };
      return consumoVentana({
        cfg,
        desde,
        hasta,
        datos,
        catalogo,
        deps: { leer: leerDias, rappi: (c) => rappiServicio(db, c) },
      });
    },
    yaCalculada: async (companyId, semana) => {
      const c = await com(db)
        .from('com_ovs_corridas')
        .select('id')
        .eq('company_id', companyId)
        .eq('semana', semana)
        .eq('estado', 'ok')
        .maybeSingle();
      if (c.error) throw new Error('No se pudo leer la corrida de esta semana.');
      return !!c.data;
    },
    anterior: async (companyId, semana) => {
      const previa = masDias(semana, -7);
      const c = await com(db)
        .from('com_ovs_corridas')
        .select('id')
        .eq('company_id', companyId)
        .eq('semana', previa)
        .eq('estado', 'ok')
        .maybeSingle();
      if (c.error) throw new Error('No se pudo leer la corrida de la semana anterior.');
      if (!c.data) return null;
      const l = await com(db)
        .from('com_ovs_lineas')
        .select('sku,sugerido,arrastre')
        .eq('corrida_id', c.data.id);
      if (l.error) throw new Error('No se pudieron leer las líneas de la semana anterior.');
      return {
        semana: previa,
        lineas: (l.data ?? []).map((x: { sku: string; sugerido: unknown; arrastre: unknown }) => ({
          sku: x.sku,
          sugerido: Number(x.sugerido),
          arrastre: Number(x.arrastre),
        })),
      };
    },
    guardar: async (c) => {
      const r = await com(db).rpc('com_ovs_guardar', {
        p_semana: c.semana,
        p_company: c.company_id,
        p_cadencia: c.cadencia,
        p_estado: c.estado,
        p_error: c.error,
        p_lineas: c.lineas,
      });
      if (r.error) throw new Error(`com_ovs_guardar: ${r.error.message}`);
    },
    bitacora: async (f) => {
      const r = await com(db)
        .from('com_sync_log')
        .insert({ proceso: PROCESO_OVS, ...f });
      if (r.error) throw new Error(`com_sync_log: ${r.error.message}`);
    },
    enviar: (para, asunto, html) => enviarCorreoInterno(para, asunto, html),
  };
}
