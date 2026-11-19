// Funciones puras que convierten el resultado de las RPC en bloques del tablero.
// Promedios y porcentajes siempre son cociente de sumas; nunca se promedian promedios.
import type { RpcOpciones, RpcTablero, RpcTendencias, TiendaBi } from './tipos';
import type { FiltrosUrl } from './url';

export const cociente = (a: number, b: number): number | null => (b > 0 ? a / b : null);
/** ¿Llega a la meta? Con el mismo redondeo que se ve (un decimal): 99.96 % se ve «100.0 %» y cuenta como meta. */
export const alcanza = (x: number | null): boolean => x !== null && Math.round(x * 1000) >= 1000;
const nombreDe = (tiendas: TiendaBi[], c: number) => tiendas.find((x) => x.company_id === c)?.nombre ?? `Tienda ${c}`;
const tipoDe = (tiendas: TiendaBi[], c: number) => tiendas.find((x) => x.company_id === c)?.tipo ?? 'Sin tipo';
const ORDEN_TIPO = ['Sucursales Propias', 'Franquicia', 'Sin tipo'];

export function numerosClave(t: RpcTablero) {
  const k = t.kpis;
  return {
    ventaCent: k.venta_cent, cobradoCent: k.venta_bruta_cent, tickets: k.tickets,
    ticketPromedioCent: cociente(k.venta_cent, k.tickets), upt: cociente(k.lineas, k.tickets), unidades: k.unidades,
  };
}

/**
 * Bloque 2. Cumplimiento = venta ÷ meta de los días con corte (como «Cumplimiento Meta» de Zoho); la meta del periodo
 * completo incluye los días que faltan. null = no hay meta (o P.E.) cargada para estas tiendas y fechas: nunca cero.
 */
export function contraMeta(t: RpcTablero) {
  const m = t.metas;
  if (!m) return { meta: null, pe: null, tiendas: 0, diasSinMeta: 0 };
  const meta =
    m.tiendas_con_meta > 0 && m.meta_cent > 0
      ? {
          metaCent: m.meta_cent,
          metaCorrienteCent: m.meta_corriente_cent,
          ventaCorrienteCent: m.venta_corriente_cent,
          diferenciaCent: m.venta_corriente_cent - m.meta_corriente_cent,
          cumplimiento: cociente(m.venta_corriente_cent, m.meta_corriente_cent),
          avance: cociente(m.venta_corriente_cent, m.meta_cent),
          metaTickets: m.meta_tickets,
          cumplimientoTickets: cociente(m.tickets_corriente, m.meta_tickets_corriente),
          ticketPromedioMetaCent: cociente(m.meta_corriente_cent, m.meta_tickets_corriente),
          ticketPromedioCent: cociente(m.venta_corriente_cent, m.tickets_corriente),
          tiendas: m.tiendas_con_meta,
        }
      : null;
  const pe =
    m.tiendas_con_pe > 0 && m.pe_cent > 0
      ? {
          peCent: m.pe_cent,
          peCorrienteCent: m.pe_corriente_cent,
          ventaCorrienteCent: m.venta_pe_corriente_cent,
          diferenciaCent: m.venta_pe_corriente_cent - m.pe_corriente_cent,
          cobertura: cociente(m.venta_pe_corriente_cent, m.pe_corriente_cent),
          tiendas: m.tiendas_con_pe,
        }
      : null;
  return { meta, pe, tiendas: m.tiendas, diasSinMeta: m.dias_sin_meta };
}

/** Filtros que recortan la venta por línea (producto, pago, hora, monto): con ellos la meta de la tienda no se compara. */
export function filtrosDeLinea(f: FiltrosUrl): string[] {
  return [
    f.categorias.length > 0 && 'categoría',
    f.grupos.length > 0 && 'grupo',
    f.cafe.length > 0 && 'café',
    f.productos.length > 0 && 'producto',
    f.pagos.length > 0 && 'método de pago',
    f.horas.length > 0 && 'hora',
    (f.montoMin !== undefined || f.montoMax !== undefined) && 'monto',
  ].filter((x): x is string => typeof x === 'string');
}

export function conShare<T extends { venta_cent: number }>(filas: T[]) {
  const total = filas.reduce((s, f) => s + f.venta_cent, 0);
  return filas.map((f) => ({ ...f, share: cociente(f.venta_cent, total) }));
}

export function kpiTiendas(t: RpcTablero, tiendas: TiendaBi[]) {
  const total = t.por_tienda_dia.reduce((s, f) => s + f.venta_cent, 0);
  const porTienda = new Map<number, { ventaCent: number; tickets: number }>();
  for (const f of t.por_tienda_dia) {
    const a = porTienda.get(f.company_id) ?? { ventaCent: 0, tickets: 0 };
    a.ventaCent += f.venta_cent;
    a.tickets += f.tickets; // un ticket es de un solo día: sumar días no duplica
    porTienda.set(f.company_id, a);
  }
  type Grupo = {
    tipo: string; ventaCent: number; tickets: number;
    metaCent: number | null; metaCorrienteCent: number; ventaCorrienteCent: number;
    tiendas: { companyId: number; nombre: string; ventaCent: number; tickets: number;
      ticketPromedioCent: number | null; share: number | null; metaCent: number | null;
      cumplimiento: number | null }[];
  };
  const metas = new Map((t.metas?.por_tienda ?? []).map((m) => [m.company_id, m]));
  const grupos = new Map<string, Grupo>();
  for (const [companyId, a] of porTienda) {
    const tipo = tipoDe(tiendas, companyId);
    const g = grupos.get(tipo) ?? { tipo, ventaCent: 0, tickets: 0, metaCent: null, metaCorrienteCent: 0,
      ventaCorrienteCent: 0, tiendas: [] };
    g.ventaCent += a.ventaCent;
    g.tickets += a.tickets;
    // Meta 0 en el periodo (la tienda aún no abre según la meta) se trata como «sin meta».
    const m = metas.get(companyId);
    const conMeta = m && m.meta_cent > 0 ? m : null;
    if (conMeta) {
      g.metaCent = (g.metaCent ?? 0) + conMeta.meta_cent;
      g.metaCorrienteCent += conMeta.meta_corriente_cent;
      g.ventaCorrienteCent += conMeta.venta_corriente_cent;
    }
    g.tiendas.push({ companyId, nombre: nombreDe(tiendas, companyId), ventaCent: a.ventaCent, tickets: a.tickets,
      ticketPromedioCent: cociente(a.ventaCent, a.tickets), share: cociente(a.ventaCent, total),
      metaCent: conMeta?.meta_cent ?? null,
      cumplimiento: conMeta ? cociente(conMeta.venta_corriente_cent, conMeta.meta_corriente_cent) : null });
    grupos.set(tipo, g);
  }
  for (const g of grupos.values()) g.tiendas.sort((x, y) => y.ventaCent - x.ventaCent);
  const conCumplimiento = (g: Grupo) => ({ ...g, cumplimiento: cociente(g.ventaCorrienteCent, g.metaCorrienteCent) });
  const orden = (tipo: string) => {
    const i = ORDEN_TIPO.indexOf(tipo);
    return i === -1 ? ORDEN_TIPO.length : i;
  };
  return [...grupos.values()].sort((x, y) => orden(x.tipo) - orden(y.tipo)).map(conCumplimiento);
}

export const META_PROMO = { 'Promoción alimentos y bebidas': 0.06, 'Promoción café': 0.01 } as const;
type NombrePromo = keyof typeof META_PROMO;
const NOMBRES_PROMO = Object.keys(META_PROMO) as NombrePromo[];

export function promociones(t: RpcTablero, tiendas: TiendaBi[]) {
  const red = NOMBRES_PROMO.map((promocion) => {
    const filas = t.promociones.filter((f) => f.promocion === promocion);
    const venta = filas.reduce((s, f) => s + f.venta_cent, 0);
    const unidades = filas.reduce((s, f) => s + f.unidades, 0);
    return { promocion, share: venta === 0 && t.kpis.venta_cent > 0 ? 0 : cociente(venta, t.kpis.venta_cent),
      meta: META_PROMO[promocion], unidades };
  });

  const ids = [...new Set(t.promociones.map((f) => f.company_id))];
  const porTienda = ids.map((companyId) => {
    const filas = t.promociones.filter((f) => f.company_id === companyId);
    const ventaCent = filas.reduce((s, f) => s + f.venta_cent, 0);
    const promos = {} as Record<NombrePromo, { share: number | null; unidades: number }>;
    for (const p of NOMBRES_PROMO) {
      const delaPromo = filas.filter((f) => f.promocion === p);
      promos[p] = {
        share: cociente(delaPromo.reduce((s, f) => s + f.venta_cent, 0), ventaCent),
        unidades: delaPromo.reduce((s, f) => s + f.unidades, 0),
      };
    }
    return { companyId, nombre: nombreDe(tiendas, companyId), ventaCent, promos };
  });
  porTienda.sort((a, b) => b.ventaCent - a.ventaCent);
  return { red, porTienda };
}

export function rankingPorMes(t: RpcTablero) {
  const meses = new Map<string, RpcTablero['ranking']>();
  for (const f of t.ranking) meses.set(f.mes, [...(meses.get(f.mes) ?? []), f]);
  return [...meses.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([mes, filas]) => ({ mes, productos: conShare([...filas].sort((a, b) => b.venta_cent - a.venta_cent)) }));
}

export function pagoPorTienda(t: RpcTablero, tiendas: TiendaBi[]) {
  const porTienda = new Map<number, RpcTablero['por_pago_tienda']>();
  for (const f of t.por_pago_tienda) porTienda.set(f.company_id, [...(porTienda.get(f.company_id) ?? []), f]);
  return [...porTienda.entries()]
    .map(([companyId, filas]) => {
      const pagos = conShare([...filas].sort((a, b) => b.venta_cent - a.venta_cent))
        .map((p) => ({ etiqueta: p.etiqueta, ventaCent: p.venta_cent, share: p.share }));
      return { companyId, nombre: nombreDe(tiendas, companyId), ventaCent: filas.reduce((s, f) => s + f.venta_cent, 0), pagos };
    })
    .sort((a, b) => b.ventaCent - a.ventaCent);
}

export function tendenciaAnual(r: RpcTendencias) {
  const anios = new Map<number, (number | null)[]>();
  for (const f of r.por_mes) {
    const meses = anios.get(f.anio) ?? Array<number | null>(12).fill(null);
    if (f.mes >= 1 && f.mes <= 12) meses[f.mes - 1] = f.venta_cent;
    anios.set(f.anio, meses);
  }
  return [...anios.entries()].sort(([a], [b]) => a - b).map(([anio, meses]) => ({ anio, meses }));
}

export function tendenciaSemanal(r: RpcTendencias) {
  const anios = new Map<number, (number | null)[]>();
  for (const f of r.por_semana) {
    const semanas = anios.get(f.anio) ?? Array<number | null>(53).fill(null);
    if (f.semana >= 1 && f.semana <= 53) semanas[f.semana - 1] = f.venta_cent;
    anios.set(f.anio, semanas);
  }
  return [...anios.entries()].sort(([a], [b]) => a - b).map(([anio, semanas]) => ({ anio, semanas }));
}

export function avisos(t: RpcTablero, o: RpcOpciones) {
  return {
    faltantes: t.cargas.esperados - t.cargas.con_carga,
    esperados: t.cargas.esperados,
    incompletos: t.cargas.incompletos,
    rappiPendiente: o.tiendas_sin_rappi > 0,
    ultimoCorte: o.ultimo_corte,
  };
}
