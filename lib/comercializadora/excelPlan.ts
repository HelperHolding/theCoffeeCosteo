import type { Hoja, LibroExcel } from './excelImpCafe';
import { fechaCorta } from '../../supabase/functions/_shared/planHoy.ts';
import { cfgConImp } from '../../supabase/functions/_shared/planImp.ts';
import { cfgConCafe } from '../../supabase/functions/_shared/planCafe.ts';
import type { PlanProv } from '../../supabase/functions/_shared/planProv.ts';
import { PSEM_CATS, type Inc, type Pasadas, type Sem } from '../../supabase/functions/_shared/planSem.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * _planCfgPlanaFilas (34072): la configuración del cálculo, una fila por parámetro ordenada por clave y los eventos al
 * final. Las listas de números van por índice y las de objetos como JSON (el viejo pasaba el arreglo a SheetJS). Imp y café
 * van normalizados, como los tenía el viejo en c.cfg. La carga de Zoho de la configuración (zoho_oc) no es un parámetro y
 * puede pasar del límite de una celda de Excel: no se exporta.
 */
export function filasConfigPlan(cfg: X): Hoja['filas'] {
  const c = cfgConCafe(cfgConImp(cfg)),
    out: Record<string, unknown> = {};
  const aplanar = (o: X, pre: string) => {
    Object.keys(o || {}).forEach((k) => {
      const v = o[k],
        p = pre ? pre + '.' + k : k;
      if (!pre && k === 'zoho_oc') return;
      if (Array.isArray(v)) {
        if (v.every((x) => x === null || typeof x !== 'object')) v.forEach((x, i) => (out[p + '.' + i] = x));
        else out[p] = JSON.stringify(v);
      } else if (v && typeof v === 'object') aplanar(v, p);
      else out[p] = v;
    });
  };
  aplanar(c, '');
  const filas: Hoja['filas'] = Object.keys(out)
    .sort()
    .filter((k) => k.indexOf('eventos') !== 0)
    .map((k) => ({ Parámetro: k, Valor: out[k] }));
  (c.eventos || []).forEach((e: X) =>
    filas.push({
      Parámetro: 'evento: ' + e.nombre,
      Valor:
        e.ini +
        ' a ' +
        e.fin +
        ' × ' +
        e.factor +
        ' (' +
        e.alcance +
        (e.valores.length ? ': ' + e.valores.join(', ') : '') +
        ')' +
        (e.activo === false ? ' [inactivo]' : ''),
    }),
  );
  return filas;
}

/**
 * window._planSemExportar (40230): las seis hojas del viejo con todas las semanas del plan (no solo las que se ven). Por
 * proveedor y por artículo llevan solo las categorías incluidas; el resumen, las tres con "Incluida".
 */
export function libroPlanAbastos(S: Sem, c: PlanProv, pas: Pasadas, inc: Inc): LibroExcel {
  const W = c.W;
  const et = (k: number) => (k === 0 ? 'Hoy ' : '') + fechaCorta(c.semIni[k]);
  const nomCat = (id: string) => PSEM_CATS.find((x) => x.id === id)?.nombre;
  const cats = PSEM_CATS.map((d) => {
    const C = S.cat[d.id],
      o: Record<string, unknown> = { Categoría: d.nombre, Incluida: inc[d.id] ? 'sí' : 'no' };
    let t = 0;
    for (let k = 0; k < W; k++) {
      o[et(k)] = r2(C.monto[k]);
      t += C.monto[k];
    }
    o['Total $'] = r2(t);
    return o;
  });
  const provs = S.provs.map((g) => {
    const o: Record<string, unknown> = {
      Categoría: nomCat(g.cat),
      Proveedor: g.nombre,
      'Mínimo capturado': g.minimo || '',
    };
    let t = 0,
      sc = 0;
    for (let k = 0; k < W; k++) {
      o[et(k)] = r2(g.monto[k]);
      t += g.monto[k];
      sc += g.sinCosto[k];
    }
    o['Total $ (sin artículos sin costo)'] = r2(t);
    o['Líneas sin costo (suma de semanas)'] = sc;
    return o;
  });
  const arts: Hoja['filas'] = [],
    artsM: Hoja['filas'] = [];
  S.provs.forEach((g) =>
    g.rows.forEach((r: X) => {
      const o: Record<string, unknown> = {
        Categoría: nomCat(g.cat),
        SKU: r.sku,
        Artículo: r.nombre,
        Proveedor: r.provNombre,
        'Lead time (días)': r.s.lt || '',
        'Disponible (inv.+OC)': r.imp ? '' : r.calc.disponible,
        'Consumo diario': r.imp ? '' : r2(r.calc.consumo),
        'Costo unitario': r.costo || '',
      };
      const m = { ...o };
      let tq = 0,
        tm = 0;
      for (let k = 0; k < W; k++) {
        o[et(k)] = r.sem[k];
        m[et(k)] = r.costo > 0 ? r2(r.sem[k] * r.costo) : r.sem[k] > 0 ? 'sin costo' : '';
        tq += r.sem[k];
        if (r.costo > 0) tm += r.sem[k] * r.costo;
      }
      o['Total piezas'] = tq;
      m['Total $'] = r2(tm);
      if (tq > 0) {
        arts.push(o);
        artsM.push(m);
      }
    }),
  );
  const emit: Hoja['filas'] = [];
  for (let j = pas.np - 1; j >= 0; j--)
    emit.push({
      'Semana (inicio)': pas.ini[j],
      'Todo lo demás $': r2(pas.local[j]),
      'Café $': r2(pas.cafe[j]),
      'Importaciones $': r2(pas.imp[j]),
    });
  return {
    archivo: `Plan_de_abastos_${c.hoyIso}.xlsx`,
    hojas: [
      { nombre: 'Resumen por categoría ($)', filas: cats },
      { nombre: 'Por proveedor ($)', filas: provs },
      { nombre: 'Por artículo (piezas)', filas: arts },
      { nombre: 'Por artículo ($)', filas: artsM },
      { nombre: 'Compras ya emitidas', filas: emit },
      { nombre: 'Configuración', filas: filasConfigPlan(c.cfg) },
    ],
  };
}
