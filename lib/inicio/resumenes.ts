import 'server-only';
import type { Json } from '../supabase/database.types';
import {
  accesoBi,
  accesoFranquiciatarios,
  sesion,
  sesionComercializadora,
  sesionCrm,
} from '../supabase/sesion';
import { todas } from '../portal/consultas';
import { indicadores, margenPor, menorMargen, saludMenu, type Salud } from '../portal/tablero';
import { candadosTodos, etapasGenerales, vencimientos } from '../crm/unificado/consultas';
import { aJsonRpc } from '../bi/filtros';
import { horaCorte, periodoAnterior } from '../bi/comparacion';
import { aFiltrosBi, hoyMexico, leerUrl, resolverPeriodo } from '../bi/url';
import { cociente } from '../bi/bloques';
import type { RpcKpis, RpcOpciones } from '../bi/tipos';
import { cierresVigentes, com, ultimaProyeccion } from '../comercializadora/consultas';
import { hoyCdmx } from '../comercializadora/fechas';
import { leerDia } from '../franquiciatarios/servidor';
import { diaOperacion } from '../franquiciatarios/dia';
import { configDe } from '../sucursales/config';
import type { SeccionClave } from '../franquiciatarios/tipos';

/**
 * Resúmenes de Inicio (dashboard del portal). Cada uno exige el acceso de su módulo con la sesión del usuario (RLS o
 * su función de acceso o de sesión), igual que las páginas del módulo, y nunca usa la llave de servicio: un usuario sin el
 * módulo no llega aquí (la página solo monta los bloques de `modulosVisibles`) y, si llegara, el acceso lo rechaza.
 * Nunca lanzan: un error se devuelve como { ok: false } para que ese bloque muestre su aviso sin tirar la página.
 */
export type Lectura<T> = { ok: true; datos: T } | { ok: false; error: string };

const fallo = (e: unknown, modulo: string): { ok: false; error: string } => {
  console.error(`[inicio] ${modulo}`, e);
  return { ok: false, error: `No se pudo leer ${modulo}. Intenta de nuevo.` };
};

// ── Costeo ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface ResumenCosteo {
  productos: number;
  foodCost: number | null;
  objetivo: number;
  salud: Record<Salud, number>;
  canales: { nombre: string; margen: number }[];
  peores: { producto: string; tamano: string; margen: number }[];
}

export async function resumenCosteo(): Promise<Lectura<ResumenCosteo>> {
  try {
    const { db } = await sesion(undefined, false);
    const filas = await todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id');
    const k = indicadores(filas);
    return {
      ok: true,
      datos: {
        productos: k.productos,
        foodCost: k.foodCost,
        objetivo: filas[0]?.margen_objetivo ?? 0.55,
        salud: saludMenu(filas),
        canales: margenPor(filas, 'canal', false).map((c) => ({ nombre: c.nombre, margen: c.margen })),
        peores: menorMargen(filas, 3).map((f) => ({
          producto: f.producto,
          tamano: f.tamano,
          margen: f.margen_pct!,
        })),
      },
    };
  } catch (e) {
    return fallo(e, 'Costeo');
  }
}

// ── CRM ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ResumenCrm {
  total: number;
  etapas: { nombre: string; cards: number }[];
  bloqueadas: number;
  listas: number;
  vencen14: number;
  vencidas: number;
  proximas: { tienda: string; titulo: string; dias: number }[];
}

export async function resumenCrm(): Promise<Lectura<ResumenCrm>> {
  try {
    const { db } = await sesionCrm(false);
    const [etapas, cs, v] = await Promise.all([
      etapasGenerales(db),
      candadosTodos(db, ['etapa_id', 'total', 'listos', 'liberado'] as const),
      vencimientos(db),
    ]);
    const porEtapa = new Map<string, number>();
    for (const c of cs) porEtapa.set(c.etapa_id, (porEtapa.get(c.etapa_id) ?? 0) + 1);
    const abiertas = new Set(etapas.filter((e) => e.tipo === 'abierta' && !e.provisional).map((e) => e.id));
    const enProceso = cs.filter((c) => abiertas.has(c.etapa_id) && !c.liberado);
    const venc = v.vencimientos;
    return {
      ok: true,
      datos: {
        total: cs.length,
        etapas: etapas
          .filter((e) => abiertas.has(e.id) && !e.carril)
          .map((e) => ({ nombre: e.nombre, cards: porEtapa.get(e.id) ?? 0 })),
        bloqueadas: enProceso.filter((c) => c.listos < c.total).length,
        listas: enProceso.filter((c) => c.listos >= c.total).length,
        vencen14: venc.filter((x) => x.dias >= 0 && x.dias <= 14).length,
        vencidas: venc.filter((x) => x.dias < 0).length,
        proximas: venc
          .filter((x) => x.dias >= 0)
          .slice(0, 3)
          .map((x) => ({ tienda: x.nombre, titulo: x.mensaje, dias: x.dias })),
      },
    };
  } catch (e) {
    return fallo(e, 'el CRM');
  }
}

// ── BI ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Kpis {
  ventaCent: number;
  tickets: number;
  ticketCent: number | null;
  upt: number | null;
}
export interface ResumenBi {
  desde: string;
  hasta: string;
  tiendas: number;
  /** Esta semana (lunes a hoy), como abre el tablero de BI. */
  actual: Kpis;
  /** Mismo tramo de la semana anterior (recortado a la hora del corte, como el BI). null sin carga completa o si falló. */
  anterior: Kpis | null;
}
const kpisDe = (k: RpcKpis['kpis']): Kpis => ({
  ventaCent: k.venta_cent,
  tickets: k.tickets,
  ticketCent: cociente(k.venta_cent, k.tickets),
  upt: cociente(k.lineas, k.tickets),
});

export async function resumenBi(): Promise<Lectura<ResumenBi>> {
  try {
    const a = await accesoBi();
    if (!a.ok) return { ok: false, error: a.mensaje };
    const hoy = hoyMexico(new Date());
    // Esta semana, como abre el tablero de BI: el mes completo de toda la red pasa del tiempo límite de la base para
    // un usuario (bi_kpis > 8 s, medido el 2026-11-23) y el bloque fallaba a veces.
    const f = { ...leerUrl(new URLSearchParams()), fr: 'esta-semana' };
    const p = resolverPeriodo(f, hoy);
    if (!p.ok) return { ok: false, error: p.error };
    const actual = { desde: p.desde, hasta: p.hasta };
    const o = await a.db.rpc('bi_opciones', { p: actual });
    if (o.error || !o.data) throw o.error ?? new Error('sin opciones');
    const opciones = o.data as unknown as RpcOpciones;
    const companias = opciones.tiendas.map((t) => t.company_id);
    if (!companias.length)
      return {
        ok: true,
        datos: {
          ...actual,
          tiendas: 0,
          actual: { ventaCent: 0, tickets: 0, ticketCent: null, upt: null },
          anterior: null,
        },
      };
    // Una después de la otra (juntas compiten por la base) y la comparación es opcional: si falla, se muestra la semana.
    const k = await a.db.rpc('bi_kpis', {
      p: aJsonRpc(aFiltrosBi(f, actual, companias, hoy)) as Json,
      p_hora_corte: null,
    });
    if (k.error || !k.data) throw k.error ?? new Error('sin kpis');
    const r = k.data as unknown as RpcKpis;
    const previo = periodoAnterior('esta-semana', actual);
    const kp = await a.db.rpc('bi_kpis', {
      p: aJsonRpc(aFiltrosBi(f, previo, companias, hoy)) as Json,
      p_hora_corte: horaCorte(opciones.ultimo_corte, actual.hasta, hoy),
    });
    const rp = kp.error ? null : (kp.data as unknown as RpcKpis | null);
    const completa = rp?.cargas && rp.cargas.con_carga >= rp.cargas.esperados && rp.cargas.incompletos === 0;
    return {
      ok: true,
      datos: {
        ...actual,
        tiendas: companias.length,
        actual: kpisDe(r.kpis),
        anterior: completa && rp?.kpis ? kpisDe(rp.kpis) : null,
      },
    };
  } catch (e) {
    return fallo(e, 'el BI');
  }
}

// ── Comercializadora ─────────────────────────────────────────────────────────────────────────────────────────
export interface ResumenComercializadora {
  proyeccion: { calculado: string; sinCosto: number; sinProveedor: number } | null;
  cierres: { proveedor: string; fin: string; ultimoDia: string | null }[];
  ov: { semana: string; tiendas: number; errores: number; piezas: number; montoCent: number } | null;
}

export async function resumenComercializadora(): Promise<Lectura<ResumenComercializadora>> {
  try {
    const { db } = await sesionComercializadora(false);
    const hoy = hoyCdmx();
    const p = await ultimaProyeccion(db);
    const [cierres, corridas] = await Promise.all([
      cierresVigentes(db, hoy, p?.resumen ?? null),
      com(db)
        .from('com_ovs_corridas')
        .select('id,semana,estado')
        .order('semana', { ascending: false })
        .limit(300),
    ]);
    let ov: ResumenComercializadora['ov'] = null;
    const cs = (corridas.data ?? []) as { id: number; semana: string; estado: string }[];
    if (cs.length) {
      const semana = cs[0].semana;
      const deSemana = cs.filter((c) => c.semana === semana);
      const ok = deSemana.filter((c) => c.estado === 'ok').map((c) => c.id);
      const l = ok.length
        ? await com(db).from('com_ovs_lineas').select('sugerido,monto').in('corrida_id', ok).gt('sugerido', 0)
        : { data: [], error: null };
      const lineas = (l.data ?? []) as { sugerido: number; monto: number | null }[];
      ov = {
        semana,
        tiendas: ok.length,
        errores: deSemana.length - ok.length,
        piezas: lineas.reduce((s, x) => s + Number(x.sugerido), 0),
        montoCent: Math.round(lineas.reduce((s, x) => s + Number(x.monto ?? 0), 0) * 100),
      };
    }
    return {
      ok: true,
      datos: {
        proyeccion: p
          ? {
              calculado: p.resumen.calculado_at ?? p.inicio,
              sinCosto: p.resumen.sinCosto?.length ?? 0,
              sinProveedor: p.resumen.sinProveedor?.length ?? 0,
            }
          : null,
        cierres: cierres.map((c) => ({ proveedor: c.vendor_name, fin: c.fin, ultimoDia: c.u })),
        ov,
      },
    };
  } catch (e) {
    return fallo(e, 'Comercializadora');
  }
}

// ── Franquiciatarios ─────────────────────────────────────────────────────────────────────────────────────────
export interface ResumenFranquicia {
  dia: string;
  sucursales: {
    companyId: number;
    nombre: string;
    secciones: { clave: SeccionClave; nombre: string; avance: number; estado: string; noes: number }[];
    incidencias: number;
  }[];
  /** Sucursales con acceso que no se muestran (se leen hasta 5). */
  mas: number;
}
const MAX_FRANQ = 5;

export async function resumenFranquiciatarios(): Promise<Lectura<ResumenFranquicia>> {
  try {
    const a = await accesoFranquiciatarios();
    if (!a.ok) return { ok: false, error: a.mensaje };
    const dia = diaOperacion();
    const ids = [...a.sucursales.keys()].filter((id) => configDe(id));
    const lista = ids.slice(0, MAX_FRANQ);
    const dias = await Promise.all(lista.map((id) => leerDia(a.db, id, dia)));
    return {
      ok: true,
      datos: {
        dia,
        mas: ids.length - lista.length,
        sucursales: lista.map((id, i) => ({
          companyId: id,
          nombre: configDe(id)!.nombre,
          incidencias: dias[i].incidencias.length,
          secciones: dias[i].secciones.map((s) => ({
            clave: s.clave,
            nombre: s.nombre,
            avance: s.puntos.length ? Math.min(1, s.respondidos / s.puntos.length) : 0,
            estado: s.estado,
            noes: s.noes,
          })),
        })),
      },
    };
  } catch (e) {
    return fallo(e, 'Franquiciatarios');
  }
}
