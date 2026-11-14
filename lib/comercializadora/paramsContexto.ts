import 'server-only';
// Lo que el servidor prepara para los editores de parámetros de Importaciones y Café (plan 3e), con lo guardado.
import { impSkuKey, impVentasPlat, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import type { CorridaCafe } from '../../supabase/functions/_shared/planCafe.ts';
import { comSaldoCedis, type DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import type { CandidatoImp, ContextoParamsCafe, ContextoParamsImp, MetaItemImp } from './paramsImpCafe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/** El contexto del editor: la red de _impParamRed, la plataforma por artículo y los candidatos (máximo 80, como el viejo). */
export function contextoParamsImp(c: CorridaImp, R: DatosPlan): ContextoParamsImp {
  const m = c.ent.meta,
    ci = c.cfg.imp,
    cfg = c.cfg;
  const meta: Record<string, MetaItemImp> = {};
  Object.keys(m.items).forEach((sku) => {
    const it = m.items[sku],
      pd = it.cat;
    meta[sku] = {
      vPlat: it.vPlat ?? null,
      kPlat: it.kPlat ?? null,
      ocN: it.ocN || 0,
      ocQ: it.ocQ || 0,
      cat: pd
        ? { estatus: pd.estatus, origen: pd.origen, lt: pd.lt, costo: pd.costo, multiplo: pd.multiplo }
        : null,
    };
  });
  const enPlan: Record<string, 1> = {};
  ci.orden.forEach((k: string) => (enPlan[impSkuKey(k)] = 1));
  const lt: Record<string, number> = {};
  R.lt.forEach((l) => (lt[l.sku] = Number(l.dias || 0)));
  const vp = impVentasPlat(R, cfg);
  const cerr = ci.prov.find((p: X) => !p.contenedor) || ci.prov[0];
  const candidatos: CandidatoImp[] = [];
  R.cat.forEach((r) => {
    if (enPlan[impSkuKey(r.sku)]) return;
    const imp = String(r.origen || '').toUpperCase() === 'IMPORTADO' || lt[r.sku] > cfg.compra.entrega_max;
    if (!imp || r.estatus === 'Inactivo' || r.estatus === 'Compra Unica') return;
    let v = 0;
    if (vp.por[r.sku] > 0 && vp.suc > 0)
      v = Math.round((((vp.por[r.sku] / vp.W) * 30) / vp.suc) * 10000) / 10000;
    const pv = ci.prov.find(
      (p: X) =>
        String(r.proveedor_preferido || '')
          .toLowerCase()
          .indexOf(p.clave.toLowerCase()) >= 0,
    );
    candidatos.push({
      sku: r.sku,
      nombre: r.nombre || '',
      estatus: r.estatus || '',
      proveedor: r.proveedor_preferido || '',
      inventario: comSaldoCedis(r),
      item: {
        nombre: r.nombre || r.sku,
        familia: 'General',
        prov: (pv || cerr).clave,
        unidad: 'piezas',
        venta: v,
        kit: Math.round(Number(r.cantidad_por_apertura || 0) * 10000) / 10000,
        empaque: Math.max(1, Number(r.multiplo_compra || 1)),
        minimo: Number(r.minimo_compra_pzas || 0),
        costo: Number(r.costo_unitario || 0),
        cbm: 0,
        cbm_fuente: '',
        alias: '',
        activo: true,
        camino_qty: 0,
        camino_fecha: '',
      },
    });
  });
  const pl = m.red.pl;
  return {
    claves: m.red.filas.map((f: X) => f.key),
    pipeline: m.red.filas.map((f: X) => f.pipeline),
    pl: { total: pl.total, vencidas: pl.vencidas, sinFecha: pl.sinFecha, despues: pl.despues },
    sucHoyAuto: R.aperturas.filter((a) => a.estatus === 'activa').length,
    aperIncluir: cfg.aper.incluir !== false,
    entregaMax: cfg.compra.entrega_max,
    meta,
    candidatos: candidatos.slice(0, 80),
  };
}

/** _cafeParamEsc/_cafeParamAper: arranque del año y pipeline por mes que salen de la plataforma, para el año guardado. */
export function contextoParamsCafe(c: CorridaCafe): ContextoParamsCafe {
  return {
    anio: c.cfg.cafe.anio,
    ini: c.ent.red.ini,
    a0: c.ent.red.a0,
    pipeAnio: c.ent.red.pipeAnio.slice(),
  };
}
