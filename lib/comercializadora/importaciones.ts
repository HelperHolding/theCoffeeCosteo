import type { Tono } from './inicio';
import { impAhoraDatos, impDif, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import { planEngDia } from '../../supabase/functions/_shared/planEngine.ts';
import { IMP_ESCS } from '../../supabase/functions/_shared/impCafeCfg.ts';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';

export type { CorridaImp };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NF = [0, 1, 2, 3, 4].map(
  (d) => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: d }),
);
/** _planN: número con hasta `d` decimales. */
export const nf = (x: number, d = 0) => NF[d].format(Number(x));
/** _impU: '—' si no es un número. */
export const nu = (x: number | null | undefined, d = 0) => (x == null || !isFinite(x) ? '—' : nf(x, d));
/** _planMoney: pesos sin centavos. */
export const dinero = (x: number) => {
  const v = Number(x || 0);
  return (v < 0 ? '-' : '') + '$' + NF[0].format(Math.abs(v));
};
/** _impPct. */
export const pct = (x: number | null | undefined, d = 0) =>
  x == null || !isFinite(x) ? '—' : Math.round(x * 10 ** (2 + d)) / 10 ** d + '%';
/** _impF: '13 nov 26'. */
export function fImp(iso: string | null | undefined): string {
  const p = String(iso || '').split('-');
  return p.length < 3 || !(+p[1] >= 1 && +p[1] <= 12)
    ? iso
      ? String(iso)
      : '—'
    : `${+p[2]} ${MESES[+p[1] - 1]} ${p[0].slice(2)}`;
}
/** _impMes: 'nov 26'. */
export function mesImp(iso: string | null | undefined): string {
  const p = String(iso || '').split('-');
  return p.length < 3 || !(+p[1] >= 1 && +p[1] <= 12) ? '' : `${MESES[+p[1] - 1]} ${p[0].slice(2)}`;
}

/** Vistas de la pantalla (_IMP_VISTAS_S en la vista simple; _IMP_VISTAS con "Ver todo"). */
export const VISTAS_IMP_SIMPLE: [string, string][] = [
  ['ahora', 'Qué pedir'],
  ['embarques', 'Contenedores'],
  ['proyeccion', 'Proyección mensual'],
  ['params', 'Parámetros'],
];
export const VISTAS_IMP: [string, string][] = [
  ['ahora', 'Qué pedir'],
  ['pedir', 'Detalle por artículo'],
  ['embarques', 'Contenedores'],
  ['proyeccion', 'Proyección mensual'],
  ['puente', 'Compra puente'],
  ['resumen', 'Resumen'],
  ['params', 'Parámetros'],
];
/** ?vista= válida (con "Ver todo" se aceptan las siete); si no, Qué pedir. */
export const vistaImp = (v: string | undefined, det: boolean) =>
  (det ? VISTAS_IMP : VISTAS_IMP_SIMPLE).some((x) => x[0] === v) ? (v as string) : 'ahora';
/** ?esc= válido (solo cambia lo que se ve); si no, null = el escenario guardado. */
export const escImp = (v: string | undefined) => (IMP_ESCS.includes(v ?? '') ? (v as string) : null);

/** _impEstadoHtml: color del estado del motor. */
export function tonoEstadoImp(e: string): Tono {
  if (/^URGENTE/.test(e)) return 'pierde';
  if (/^Pedir este mes/.test(e)) return 'bajo';
  if (/^Programado/.test(e)) return 'ok';
  return 'neutro';
}

/** _impKpisHtml. */
export function kpisImp(c: CorridaImp) {
  const S = c.S,
    k = S.kpis,
    cont = S.plan.contenedores[0];
  let pq: X = null;
  S.productos.forEach((p: X) => {
    if (p.quiebre.seAcaba && (!pq || p.quiebre.seAcaba < pq.quiebre.seAcaba)) pq = p;
  });
  return {
    pedir30: { n: k.productosAPedir30d as number, inversion: k.inversion30d as number },
    tarde: S.productos.filter((p: X) => /^URGENTE/.test(p.quiebre.estado)).length as number,
    riesgo: k.productosRiesgo as number,
    quiebre: pq ? { producto: pq.quiebre.producto as string, fecha: pq.quiebre.seAcaba as string } : null,
    contenedor:
      cont && cont.colocar && cont.cbm > 0
        ? { colocar: cont.colocar as string, llega: cont.llega as string, estado: String(cont.estado) }
        : null,
    proveedorContenedor: c.ent.P.constantes.proveedorContenedor as string,
    sucursales: {
      hoy: S.meses[0].sucursalesInicio as number,
      fin: S.meses[14].sucursalesCierre as number,
      mesFin: mesImp(S.meses[14].inicio),
    },
  };
}

const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p);
/** _impAvisosHtml, en texto. `R` son los datos del plan (avisos de lectura). */
export function avisosImp(c: CorridaImp, R: Pick<DatosPlan, 'avisos'>): string[] {
  const av: string[] = [],
    S = c.S,
    m = c.ent.meta,
    cfg = c.cfg;
  if (R.avisos && R.avisos.indexOf('aperturas') >= 0)
    av.push(
      'No se pudieron leer las aperturas: el pipeline y las sucursales de hoy pueden estar incompletos.',
    );
  const pl = m.red.pl;
  if (m.red.sucHoy === 0 && cfg.imp.red.suc_hoy_modo === 'auto')
    av.push(
      'No hay sucursales activas visibles para tu usuario: el plan parte de 0 sucursales. Revisa tus permisos de Aperturas o captura las sucursales de hoy en Parámetros.',
    );
  if (pl.vencidas > 0)
    av.push(
      `${pl.vencidas} ${plural(pl.vencidas, 'apertura')} en proceso con fecha ya vencida (sigue sin abrir): se ${plural(pl.vencidas, 'cuenta', 'cuentan')} en el mes en curso.`,
    );
  if (pl.vencidasFuera > 0)
    av.push(
      `${pl.vencidasFuera} ${plural(pl.vencidasFuera, 'apertura')} ${plural(pl.vencidasFuera, 'vencida')} hace más de ${cfg.aper.vencida_max} días no se ${plural(pl.vencidasFuera, 'cuenta', 'cuentan')}: revisa su fecha en Aperturas.`,
    );
  if (pl.sinFecha > 0)
    av.push(
      `${pl.sinFecha} ${plural(pl.sinFecha, 'apertura')} en proceso sin fecha: no se ${plural(pl.sinFecha, 'cuenta', 'cuentan')} en ningún mes.`,
    );
  const items = Object.keys(m.items);
  const lista = (xs: string[]) => xs.slice(0, 4).join(', ') + (xs.length > 4 ? '…' : '');
  const sinCat = items.filter((k) => m.items[k].activo && !m.items[k].cat);
  if (sinCat.length)
    av.push(
      `${sinCat.length} ${plural(sinCat.length, 'artículo')} del plan no ${plural(sinCat.length, 'está', 'están')} en el catálogo (${lista(sinCat)}): se usa inventario 0.`,
    );
  const pf = items.filter(
    (k) =>
      m.items[k].activo &&
      m.items[k].aviso.some((a: string) => a.indexOf('proveedor') >= 0 || a.indexOf('familia') >= 0),
  );
  if (pf.length)
    av.push(
      `${pf.length} ${plural(pf.length, 'artículo')} con proveedor o familia inexistente (ver Parámetros).`,
    );
  const sinVenta = c.ent.items.filter((it: X) => it.ventaSucursalMes <= 0 && it.kitApertura <= 0);
  if (sinVenta.length)
    av.push(
      `${sinVenta.length} ${plural(sinVenta.length, 'artículo')} sin venta por sucursal ni kit por apertura: no tienen demanda en el cálculo (${lista(sinVenta.map((x: X) => x.sku))}).`,
    );
  const inact = items.filter((k) => {
    const it = m.items[k];
    return (
      it.activo &&
      it.cat &&
      ['Inactivo', 'Hasta Agotar Existencias', 'Compra Unica', 'Prueba'].includes(it.cat.estatus)
    );
  });
  if (inact.length)
    av.push(
      `${inact.length} ${plural(inact.length, 'artículo')} del plan ${plural(inact.length, 'figura', 'figuran')} en Zoho como Inactivo, Hasta agotar, Compra única o Prueba (${lista(inact)}): se siguen planeando; desmárcalos en Parámetros si ya no se compran.`,
    );
  const camV = Object.keys(cfg.imp.items).filter((k) => {
    const it = cfg.imp.items[k];
    return it.activo && it.camino_qty > 0 && it.camino_fecha && it.camino_fecha < c.ent.P.fechaCorte;
  });
  if (camV.length)
    av.push(
      `"En camino manual" con fecha ya vencida en ${camV.join(', ')}: quítalo o registra la OC para no contarlo como llegado este mes.`,
    );
  const vieja = items.filter((k) => m.items[k].ocVieja);
  if (vieja.length)
    av.push(
      `${vieja.length} ${plural(vieja.length, 'artículo')} con OC cuya fecha de arribo ya pasó y sigue abierta: confirma si ya llegó y regístrala en Órdenes de compra para no contarla dos veces.`,
    );
  const est = items.filter((k) => m.items[k].ocEst);
  if (est.length)
    av.push(
      `En ${est.length} ${plural(est.length, 'artículo')} la OC no trae fecha de arribo: se estimó con la fecha de la OC más el lead time del proveedor.`,
    );
  if (S && S.advertencias)
    S.advertencias.forEach((a: string) => {
      if (/^Aperturas consideradas con valores fijos|^Q1:/i.test(a)) return;
      av.push(a);
    });
  return av;
}

/** _impPorQue, en texto: cuánto se vende, cuánto cubre el pedido, cuánto habrá y cuánto falta. */
export function porQueImp(q: X, c: CorridaImp): string {
  const P = c.cfg.imp.politica,
    fin = mesImp(c.S.meses[14].inicio),
    mes = q.ventaMes3;
  const vta =
    isFinite(mes) && mes > 0
      ? `Vendes ${nu(mes, mes < 10 ? 1 : 0)} ${q.unidad} al mes (${nu((mes * 7) / 30, 1)} a la semana, ${nu(mes / 30, 1)} al día)`
      : 'Sin ventas registradas';
  if (q.sinQuiebre)
    return `${vta}. Con lo que tienes y lo que viene alcanza más allá de ${fin}: aún no toca pedir.`;
  if (q.cantidadPedir > 0 && q.colocarPedido) {
    const tarde = q.pedirATardar && q.pedirATardar < c.ent.P.fechaCorte;
    let t =
      `${vta}. El proveedor tarda ${q.leadTime} días: un pedido del ${fImp(q.colocarPedido)} llega el ${fImp(q.llegaCedis)}. ` +
      `Cubrir ${P.meses_cobertura} meses desde esa fecha (más ${P.meses_respaldo} de respaldo) pide ${nu(q.ventaCobertura + q.respaldo)}; ` +
      `para entonces tendrás ${nu(q.stockAlLlegar)}` +
      (q.llegadasCobertura > 0 ? ` y llegarán ${nu(q.llegadasCobertura)}` : '') +
      `: faltan ${nu(q.necesidad)}` +
      (Math.abs(q.cantidadPedir - q.necesidad) > 0.5
        ? `, que con los mínimos y múltiplos del proveedor son ${nu(q.cantidadPedir)}`
        : '') +
      '.';
    t += tarde
      ? ` Se acaba el ${fImp(q.seAcaba)} y ya va tarde` +
        (q.diasSinProducto > 0 ? `: quedarías ${nf(q.diasSinProducto)} días sin producto` : '') +
        '.'
      : ` Hay que pedirlo a más tardar el ${fImp(q.pedirATardar)}.`;
    if (q.yaComprado > 0) t += ` Ya hay ${nu(q.yaComprado)} en camino.`;
    return t;
  }
  return `${vta}. Alcanza hasta el ${fImp(q.seAcaba)}; aún no toca pedir.`;
}

/** _impLineaHtml: anchos (%) de la línea de tiempo con producto, sin producto y ya repuesto, y las marcas. */
export function lineaImp(q: X, hoy: string, escala: number) {
  if (q.sinQuiebre || !q.seAcaba) return null;
  const dA = Math.max(0, impDif(hoy, q.seAcaba) || 0),
    dL = q.llegaCedis ? impDif(hoy, q.llegaCedis) : null,
    dC = q.colocarPedido ? impDif(hoy, q.colocarPedido) : null;
  const pc = (x: number) => Math.max(0, Math.min(100, Math.round((x / escala) * 1000) / 10));
  const ok = pc(dA);
  let gap = 0,
    resp = 0;
  if (dL !== null) {
    if (dL > dA) {
      gap = Math.max(0, pc(dL) - ok);
      resp = Math.max(0, 100 - ok - gap);
    } else resp = Math.max(0, 100 - ok);
  }
  return {
    ok,
    gap,
    resp,
    pedir: dC !== null && q.cantidadPedir > 0 ? pc(dC) : null,
    llega: dL !== null && q.cantidadPedir > 0 ? pc(dL) : null,
  };
}

export type Cuando = '' | 'esta' | 'prox';
/** ?cuando= válido. */
export const cuandoDe = (v: string | undefined): Cuando => (v === 'esta' || v === 'prox' ? v : '');

/** _impVistaAhora: conteos, montos y los grupos por proveedor con las filas visibles, en el orden del viejo. */
export function ahoraImp(c: CorridaImp, f: { cuando: Cuando; soloAcc: boolean }) {
  const D = impAhoraDatos(c),
    S = c.S,
    hoy = c.ent.P.fechaCorte;
  let nE = 0,
    nP = 0,
    mE = 0,
    mP = 0,
    espera = 0,
    ok = 0;
  D.orden.forEach((k) => {
    const gr = D.g[k];
    nE += gr.esta.length;
    nP += gr.prox.length;
    gr.esta.forEach((o: X) => (mE += o.q.inversion || 0));
    gr.prox.forEach((o: X) => (mP += o.q.inversion || 0));
    gr.rows.forEach((o: X) => {
      if (o.tipo) return;
      if (o.q.cantidadPedir > 0 && o.q.colocarPedido) espera++;
      else ok++;
    });
  });
  const urg = S.productos.filter((p: X) => /^URGENTE/.test(p.quiebre.estado)).length;
  const visible = (o: X) =>
    f.cuando === 'esta'
      ? o.tipo === 'esta'
      : f.cuando === 'prox'
        ? o.tipo === 'prox'
        : !f.soloAcc || o.tipo || /^URGENTE/.test(o.q.estado) || o.q.compraPuente > 0;
  // Escala común de las líneas de tiempo (así se pueden comparar entre artículos)
  let escala = 90;
  D.orden.forEach((k) =>
    D.g[k].rows.forEach((o: X) => {
      if (!visible(o)) return;
      const q = o.q;
      if (q.sinQuiebre || !q.seAcaba) return;
      const a = impDif(hoy, q.seAcaba) || 0,
        l = q.llegaCedis ? impDif(hoy, q.llegaCedis) || 0 : 0;
      escala = Math.max(escala, Math.max(a, l) + 20);
    }),
  );
  escala = Math.min(escala, 330);
  const grupos = D.orden
    .slice()
    .sort((a, b) => {
      const A = D.g[a],
        B = D.g[b];
      return (
        Number(B.esta.length > 0) - Number(A.esta.length > 0) ||
        Number(B.prox.length > 0) - Number(A.prox.length > 0) ||
        String(A.prov.nombre).localeCompare(String(B.prov.nombre))
      );
    })
    .map((k) => {
      const gr = D.g[k];
      const filas = gr.rows.filter(visible).sort((a: X, b: X) => {
        const x = a.q.colocarPedido || '9999',
          y = b.q.colocarPedido || '9999';
        return x < y ? -1 : x > y ? 1 : String(a.q.producto).localeCompare(String(b.q.producto));
      });
      const suma = (l: X[]) => l.reduce((s, o) => s + (o.q.inversion || 0), 0);
      return {
        clave: k,
        nombre: gr.prov.nombre as string,
        esta: gr.esta.length as number,
        prox: gr.prox.length as number,
        montoEsta: suma(gr.esta),
        montoProx: suma(gr.prox),
        filas: (filas as X[]).map((o: X) => {
          const q = o.q;
          const queda =
            q.cantidadPedir > 0
              ? Math.max(0, q.stockAlLlegar || 0) + Math.max(0, q.llegadasCobertura || 0) + q.cantidadPedir
              : null;
          return {
            sku: o.it.sku as string,
            tipo: o.tipo as 'esta' | 'prox' | null,
            q,
            borrador: (c.ent.meta.items[o.it.sku] || {}).ocBorr || 0,
            urgente: /^URGENTE/.test(q.estado),
            queda,
            mesesQueda:
              queda !== null && isFinite(q.ventaMes3) && q.ventaMes3 > 0 ? queda / q.ventaMes3 : null,
            nota: [q.nota, q.compraPuente > 0 ? `Compra puente: ${nf(q.compraPuente)} ${q.unidad}` : '']
              .filter(Boolean)
              .join(' · '),
            linea: lineaImp(q, hoy, escala),
          };
        }),
      };
    })
    .filter((g) => g.filas.length);
  return {
    nE,
    nP,
    mE,
    mP,
    urg,
    espera,
    ok,
    fin: mesImp(S.meses[14].inicio),
    grupos,
    hoy,
    limite7: planEngDia(hoy, 7),
  };
}

/** _impVistaPedir: productos por proveedor (en el orden del motor) con filtro de texto, proveedor y solo con acción. */
export function detalleImp(c: CorridaImp, f: { q: string; prov: string; soloAcc: boolean }) {
  const S = c.S,
    q = f.q.trim().toLowerCase();
  const provNombres: Record<string, string> = {};
  c.ent.P.proveedores.forEach((p: X) => (provNombres[p.nombre] = p.clave));
  const grupos: Record<string, X[]> = {},
    orden: string[] = [];
  S.productos.forEach((p: X) => {
    const qq = p.quiebre;
    if (f.prov && provNombres[qq.proveedorNombre] !== f.prov) return;
    if (f.soloAcc && !(qq.cantidadPedir > 0 || /^URGENTE/.test(qq.estado) || qq.compraPuente > 0)) return;
    if (q && String(qq.producto).toLowerCase().indexOf(q) < 0 && String(p.sku).toLowerCase().indexOf(q) < 0)
      return;
    if (!grupos[qq.proveedorNombre]) {
      grupos[qq.proveedorNombre] = [];
      orden.push(qq.proveedorNombre);
    }
    grupos[qq.proveedorNombre].push(p);
  });
  const resumen: Record<string, X> = {};
  S.proveedoresResumen.forEach((r: X) => (resumen[r.proveedorNombre] = r));
  return orden.map((nom) => ({
    nombre: nom,
    resumen: resumen[nom] && resumen[nom].productos > 0 ? resumen[nom] : null,
    productos: grupos[nom].slice().sort((a, b) => {
      const x = a.quiebre.colocarPedido || '9999',
        y = b.quiebre.colocarPedido || '9999';
      return x < y ? -1 : x > y ? 1 : String(a.quiebre.producto).localeCompare(String(b.quiebre.producto));
    }),
  }));
}

/** Texto de los contenedores del Resumen (textoCont de _impVistaResumen). */
export function textoContenedores(S: X): string {
  const cs = S.plan.contenedores;
  if (!cs.length) return '';
  let t = `Pedido de hoy: ${nf(cs[0].cbm)} CBM, colocar ${fImp(cs[0].colocar)}, llega ${fImp(cs[0].llega)} y alcanza hasta ${fImp(cs[0].alcanzaHasta)}.`;
  cs.slice(1, 4).forEach((x: X, i: number) => {
    t += ` Contenedor ${i + 2}: colocar ${fImp(x.colocar)} (llega ${fImp(x.llega)}).`;
  });
  return t;
}
