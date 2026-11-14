import { planEngDia } from '../../supabase/functions/_shared/planEngine.ts';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import type { PlanProv } from '../../supabase/functions/_shared/planProv.ts';
import { fechaCorta } from '../../supabase/functions/_shared/planHoy.ts';
import type { CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import type { PlanCafe } from '../../supabase/functions/_shared/planCafe.ts';
import {
  planSemCalc,
  planSemW,
  PSEM_CATS,
  psemFamDe,
  psemHoyMonto,
  psemPasadas,
  psemSum,
  type CatDef,
  type CatId,
  type GrupoSem,
  type Inc,
  type Pasadas,
  type Sem,
} from '../../supabase/functions/_shared/planSem.ts';
import { fechaHora } from './cafe';
import { dinero, nf } from './importaciones';

export type { CatId, GrupoSem, Inc, PlanProv, Sem };
export { fechaCorta, planSemCalc, planSemW, PSEM_CATS, psemPasadas };
/** Café e Importaciones tal como se calcularon para el plan (se llenan dentro de planSemCalc; null si no se pudo). */
export interface FuentesPlan {
  cafe: PlanCafe | null;
  imp: CorridaImp | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/**
 * Color de cada categoría en la gráfica y las etiquetas (decisión 9): el gris, el café y el morado del viejo (#374151,
 * #92400E, #7C3AED) fallan el piso de croma y luminosidad del validador de paletas; estos tres pasan claro y oscuro
 * (CVD ΔE ≥ 16.9) y conservan la idea: azul para lo local, café para el café, morado para Importaciones.
 */
export const COLOR_CAT: Record<CatId, string> = {
  local: '#1f74a6',
  cafe: '#b0703c',
  imp: '#7c3aed',
};

/** _planMoneyCorto: '$12 k', '$1.3 M'. */
export const dineroCorto = (x: number) => {
  const v = Number(x || 0);
  return v >= 1e6
    ? '$' + Math.round(v / 1e5) / 10 + ' M'
    : v >= 1e3
      ? '$' + Math.round(v / 1e3) + ' k'
      : '$' + Math.round(v);
};

// ── Parámetros de la URL ──
/** ?sin=cafe,imp: categorías fuera del dinero a disponer (el viejo lo guardaba en localStorage 'plan_sem_inc'). */
export function incDe(sin: string | undefined): Inc {
  const fuera = new Set(String(sin || '').split(','));
  return { local: !fuera.has('local'), cafe: !fuera.has('cafe'), imp: !fuera.has('imp') };
}
/** ?sin= con la categoría `id` cambiada (undefined si todas quedan incluidas). */
export function sinCon(inc: Inc, id: CatId): string | undefined {
  const n = { ...inc, [id]: !inc[id] };
  const fuera = PSEM_CATS.filter((d) => !n[d.id]).map((d) => d.id);
  return fuera.length ? fuera.join(',') : undefined;
}
/** ?vista=: matriz por proveedor (por omisión) o por artículo. */
export const vistaSemDe = (v: string | undefined): 'proveedor' | 'articulo' =>
  v === 'articulo' ? 'articulo' : 'proveedor';
/** Semanas que se pueden elegir: 4, 8 y 12 si caben, y las del plan (_planSemToolbarHtml). */
export function opcionesSemanas(c: { W: number }): number[] {
  const o = [4, 8, 12].filter((n) => n <= c.W);
  if (o.indexOf(c.W) < 0) o.push(c.W);
  return o;
}
/** _planSemEtiqueta: 'Hoy' / '20 nov', o el rango 'Hoy – 19 nov' / '20 nov – 26 nov'. */
export function etiquetaSem(c: { semIni: string[]; P: number }, k: number, larga?: boolean): string {
  if (k === 0) return larga ? 'Hoy – ' + fechaCorta(planEngDia(c.semIni[0], c.P - 1)) : 'Hoy';
  return larga
    ? fechaCorta(c.semIni[k]) + ' – ' + fechaCorta(planEngDia(c.semIni[k], c.P - 1))
    : fechaCorta(c.semIni[k]);
}

// ── Aviso de la fuente de las cantidades ──
const diaCdmx = (t: number | string) => {
  const d = new Date(t);
  return isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
};
/**
 * De dónde salen las cantidades de lo local (_planSrvChipTxt 38584 y la caja de _planBannersHtml 33747): la simulación del
 * servidor (avisa si no es de hoy) o el cálculo local con el motivo. Sin simulación leída, null.
 */
export function fuenteCant(
  c: Pick<PlanProv, 'fuenteCant' | 'srvSinPlan' | 'srvSinDatos'>,
  R: Pick<DatosPlan, 'srv'>,
  ahora: number,
): { tono: 'ok' | 'warn'; texto: string; extra: string[] } | null {
  if (c.fuenteCant === 'servidor') {
    const calc = R.srv?.calc ?? null,
      d = calc ? diaCdmx(calc) : null,
      h = diaCdmx(ahora);
    let cuando = '';
    if (d && h && d !== h) {
      const ayer = diaCdmx(Date.parse(h + 'T12:00:00Z') - 864e5);
      cuando = d === ayer ? 'de ayer ' : 'del ';
    }
    const extra: string[] = [];
    if (c.srvSinPlan > 0)
      extra.push(
        `${nf(c.srvSinPlan)} ${c.srvSinPlan === 1 ? 'artículo' : 'artículos'} de la simulación no ${c.srvSinPlan === 1 ? 'aparece' : 'aparecen'} en el Plan.`,
      );
    if (c.srvSinDatos > 0)
      extra.push(
        `${nf(c.srvSinDatos)} ${c.srvSinDatos === 1 ? 'artículo' : 'artículos'} sin proveedor o costo en Zoho: se muestran con el cálculo local.`,
      );
    return {
      tono: 'ok',
      texto: `Cantidades: simulación del servidor ${cuando}${fechaHora(calc)} (la misma de la OC automática, Qué pedir y Pagos).`,
      extra,
    };
  }
  if (!R.srv) return null;
  return {
    tono: 'warn',
    texto: `Usando el cálculo local del Plan: la simulación del servidor no está disponible (${R.srv.motivo || 'sin datos'}). Los números pueden no coincidir con Qué pedir ni con la OC automática.`,
    extra: [],
  };
}

// ── Tarjetas, cifras y familias ──
/** _planSemCategoriasHtml: una tarjeta por categoría con su dinero y si entra al plan. */
export function tarjetasCat(S: Sem, inc: Inc, Wv: number) {
  const k4 = Math.min(4, Wv);
  return PSEM_CATS.map((d) => {
    const C = S.cat[d.id];
    return {
      def: d,
      on: !!inc[d.id],
      total: psemSum(C.monto, 0, Wv),
      esta: C.monto[0] || 0,
      prox4: psemSum(C.monto, 0, k4),
      k4,
      arts: C.arts,
      provs: C.provs.length,
      // Revisión 3f: el viejo solo mostraba el error en la vista detallada; aquí siempre (el total no incluye esa categoría).
      aviso: C.err || C.aviso,
      error: !!C.err,
    };
  });
}
/** _planSemKpisHtml: dinero de esta semana, de las próximas 4 y del horizonte, con su desglose por categoría. */
export function kpisSem(S: Sem, inc: Inc, Wv: number) {
  const k4 = Math.min(4, Wv),
    incl = PSEM_CATS.filter((d) => inc[d.id]);
  const des = (a: number, b: number) =>
    incl.length > 1 ? incl.map((d) => ({ def: d, monto: psemSum(S.cat[d.id].monto, a, b) })) : [];
  let pico = 0,
    kp = 0;
  for (let i = 0; i < Wv; i++)
    if (S.tot.monto[i] > pico) {
      pico = S.tot.monto[i];
      kp = i;
    }
  return {
    ninguna: !incl.length,
    k4,
    esta: {
      monto: S.tot.monto[0] || 0,
      n: S.tot.n[0] || 0,
      sinCosto: S.tot.sinCosto[0] || 0,
      des: des(0, 1),
    },
    prox: { monto: psemSum(S.tot.monto, 0, k4), sinCosto: psemSum(S.tot.sinCosto, 0, k4), des: des(0, k4) },
    total: { monto: psemSum(S.tot.monto, 0, Wv), pico, kp, des: des(0, Wv) },
    rot: incl.reduce((t, d) => t + S.cat[d.id].rot, 0),
  };
}
/** _psemFamiliasHtml: dónde se va el dinero de las semanas que se ven, por familia, con sus dos proveedores principales. */
export function familiasSem(S: Sem, Wv: number, cat: Pick<DatosPlan, 'cat'>['cat']) {
  const por: Record<string, X> = {};
  (cat || []).forEach((x) => (por[x.sku] = x));
  const fam: Record<string, { n: string; m: number; p: Record<string, number> }> = {};
  let tot = 0;
  S.provs.forEach((g) =>
    g.rows.forEach((r: X) => {
      let m = 0;
      for (let k = 0; k < Wv; k++)
        m += r.m ? r.m[k] || 0 : r.sem[k] > 0 && r.costo > 0 ? r.sem[k] * r.costo : 0;
      if (!(m > 0)) return;
      const c = por[r.sku],
        f = psemFamDe(r.sku, r.nombre, c && c.clasificacion_detallada, g.cat);
      const F = fam[f] || (fam[f] = { n: f, m: 0, p: {} });
      F.m += m;
      F.p[g.nombre] = (F.p[g.nombre] || 0) + m;
      tot += m;
    }),
  );
  if (!(tot > 0)) return null;
  const lista = Object.values(fam).sort(
    (a, b) => Number(a.n === 'Otros') - Number(b.n === 'Otros') || b.m - a.m,
  );
  const max = Math.max(...lista.map((x) => x.m));
  const cinco = lista.filter((x) => x.n !== 'Otros').reduce((s, x) => s + x.m, 0);
  return {
    tot,
    cinco: Math.round((cinco / tot) * 100),
    lista: lista.map((F) => ({
      nombre: F.n,
      monto: F.m,
      pct: Math.round((F.m / tot) * 100),
      ancho: Math.max(1.5, (F.m / max) * 100),
      provs: Object.entries(F.p)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([n, v]) => `${n} ${Math.round((v / F.m) * 100)}%`)
        .join(' · '),
    })),
  };
}
/** _psemHoyTxt: con la simulación del servidor, lo que ordena hoy (igual a la OC automática). */
export const hoyTxt = (S: Sem, c: Pick<PlanProv, 'fuenteCant'>) =>
  c.fuenteCant === 'servidor' ? 'Hoy (igual a la OC automática): ' + dinero(psemHoyMonto(S.provs)) : '';

// ── Gráfica "Compras por semana" (decisión 2: el modo "Pagos por viernes" no se porta) ──
export interface BarraSem {
  tipo: 'pas' | 'plan';
  etiqueta: string;
  tip: string;
  k?: number;
  seg: { def: CatDef; v: number }[];
  tot: number;
}
/** _planSemGraficaComprasHtml: 6 semanas de OCs emitidas (claras) y las semanas del plan (fuertes), apiladas por categoría. */
export function graficaSem(S: Sem, pas: Pasadas, inc: Inc, Wv: number, c: PlanProv, hoy: string) {
  const cats = PSEM_CATS.filter((d) => inc[d.id]);
  const mk = (
    tipo: BarraSem['tipo'],
    fn: (d: CatDef) => number,
    etiqueta: string,
    tip: string,
    k?: number,
  ) => {
    const seg = cats.map((d) => ({ def: d, v: fn(d) }));
    return { tipo, etiqueta, tip, k, seg, tot: seg.reduce((t, s) => t + s.v, 0) };
  };
  const barras: BarraSem[] = [];
  for (let j = pas.np - 1; j >= 0; j--)
    barras.push(
      mk(
        'pas',
        (d) => pas[d.id][j],
        fechaCorta(pas.ini[j]),
        'Compras emitidas desde el ' + fechaCorta(pas.ini[j]),
      ),
    );
  for (let k = 0; k < Wv; k++)
    barras.push(
      mk(
        'plan',
        (d) => S.cat[d.id].monto[k],
        k === 0 ? 'Esta semana' : fechaCorta(c.semIni[k]),
        'Plan ' + etiquetaSem(c, k, true),
        k,
      ),
    );
  // La primera barra del plan es toda la semana; la OC automática ordena solo lo de hoy.
  const tips = barras.map(
    (b, i) =>
      `${b.tip}: ${dinero(b.tot)}` +
      b.seg
        .filter((s) => s.v > 0)
        .map((s) => `\n${s.def.nombre}: ${dinero(s.v)}`)
        .join('') +
      (i === pas.np && hoy ? '\n' + hoy : ''),
  );
  let max = 0;
  barras.forEach((b) => (max = Math.max(max, b.tot)));
  const cn: number[] = [];
  S.provs.forEach((g) => g.rows.forEach((r: X) => r.contenedor && r.costo > 0 && cn.push(r.costo)));
  return {
    barras: barras.map((b, i) => ({ ...b, tip: tips[i] })),
    np: pas.np,
    max,
    vacio: max <= 0,
    contenedor: cn.length ? cn.reduce((a, b) => a + b, 0) / cn.length : null,
    sinMonto: pas.sinMonto,
  };
}
/** _psemQueTrae: la semana de hoy y hasta tres barras altas (≥ 50% de la más alta), con lo que más pesa en cada una. */
export function queTrae(S: Sem, Wv: number, simple: boolean, c: PlanProv, hoy: string) {
  const tot = S.tot.monto;
  let max = 0;
  for (let k = 0; k < Wv; k++) if (tot[k] > max) max = tot[k];
  if (!(max > 0)) return [];
  const cand: number[] = [];
  for (let k = 1; k < Wv; k++) if (tot[k] >= max * 0.5) cand.push(k);
  cand.sort((a, b) => tot[b] - tot[a]);
  const ks = (tot[0] > 0 ? [0] : []).concat(cand.slice(0, 3)).sort((a, b) => a - b);
  const nT = simple ? 3 : 4;
  return ks.map((kk) => {
    const arr: { nombre: string; monto: number; urg: boolean }[] = [];
    let t = 0,
      urg = 0;
    S.provs.forEach((g) =>
      g.rows.forEach((r: X) => {
        const m = r.m ? r.m[kk] || 0 : r.sem[kk] > 0 && r.costo > 0 ? r.sem[kk] * r.costo : 0;
        if (!(m > 0)) return;
        arr.push({ nombre: r.nombre, monto: m, urg: !!r.urg });
        t += m;
        if (r.urg) urg += m;
      }),
    );
    arr.sort((a, b) => b.monto - a.monto);
    const top = arr.slice(0, nT);
    return {
      k: kk,
      titulo: kk === 0 ? 'Esta semana' : etiquetaSem(c, kk, true),
      total: t,
      urgente: urg,
      hoy: kk === 0 ? hoy : '',
      top,
      mas: arr.length > nT ? { n: arr.length - nT, monto: top.reduce((s, x) => s - x.monto, t) } : null,
    };
  });
}

// ── Matrices por proveedor y por artículo ──
/** _planSemFiltrarProvs. */
export function filtrarProvs(S: Sem, q: string, prov: string): GrupoSem[] {
  const t = q.trim().toLowerCase();
  return S.provs.filter((g) => {
    if (prov && g.key !== prov) return false;
    return (
      !t ||
      g.nombre.toLowerCase().includes(t) ||
      g.rows.some((r: X) => r.nombre.toLowerCase().includes(t) || String(r.sku).toLowerCase().includes(t))
    );
  });
}
/** ?prov= que ya no existe se ignora (el viejo lo limpiaba en _planSemCalc). */
export const provValido = (S: Sem, prov: string | undefined) =>
  prov && S.provs.some((g) => g.key === prov) ? prov : '';
/** Opciones del filtro de proveedor: los incluidos, por nombre; lo que no es local lleva su categoría. */
export const provOpciones = (S: Sem): [string, string][] =>
  S.provs
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((g) => [
      g.key,
      g.nombre + (g.cat !== 'local' ? ` (${PSEM_CATS.find((d) => d.id === g.cat)!.nombre})` : ''),
    ]);
/** _planSemTablaProvsHtml: por categoría incluida, sus proveedores con el dinero de cada semana y los totales. */
export function tablaProvs(S: Sem, inc: Inc, Wv: number, q: string, prov: string) {
  const filtrados = filtrarProvs(S, q, prov),
    tot = new Array(Wv).fill(0),
    totSC = new Array(Wv).fill(0);
  let gran = 0,
    nProv = 0;
  const cats = PSEM_CATS.filter((d) => inc[d.id])
    .map((d) => {
      const provs = filtrados.filter((g) => g.cat === d.id);
      const sub = new Array(Wv).fill(0);
      const filas = provs.map((g) => {
        nProv++;
        let tg = 0,
          sc = 0;
        for (let k = 0; k < Wv; k++) {
          tg += g.monto[k];
          sc += g.sinCosto[k];
          tot[k] += g.monto[k];
          totSC[k] += g.sinCosto[k];
          sub[k] += g.monto[k];
        }
        gran += tg;
        const conCompra = g.rows
          .filter((r: X) => r.sem.slice(0, Wv).some((x: number) => x > 0))
          .sort(
            (a: X, b: X) =>
              (a.fechaLimite || '9').localeCompare(b.fechaLimite || '9') || a.nombre.localeCompare(b.nombre),
          );
        return { g, total: tg, sinCosto: sc, conCompra };
      });
      return { def: d, filas, sub, subT: sub.reduce((a, b) => a + b, 0) };
    })
    .filter((x) => x.filas.length);
  return { cats, tot, totSC, gran, nProv };
}
/** _planSemTablaArtsHtml: artículos con compra en las semanas que se ven, del primer pedido al último. */
export function tablaArts(S: Sem, Wv: number, q: string, prov: string) {
  const t = q.trim().toLowerCase(),
    out: { r: X; g: GrupoSem; llega: string | null }[] = [];
  filtrarProvs(S, q, prov).forEach((g) =>
    g.rows.forEach((r: X) => {
      if (!r.sem.slice(0, Wv).some((x: number) => x > 0)) return;
      if (
        t &&
        !(
          r.nombre.toLowerCase().includes(t) ||
          String(r.sku).toLowerCase().includes(t) ||
          g.nombre.toLowerCase().includes(t)
        )
      )
        return;
      const llega = r.llega
        ? r.llega
        : r.fechaLimite === null || r.fechaLimite === undefined
          ? null
          : planEngDia(r.fechaLimite, r.s.lt);
      out.push({ r, g, llega });
    }),
  );
  return out.sort(
    (a, b) =>
      (a.r.fechaLimite || '9').localeCompare(b.r.fechaLimite || '9') || a.r.nombre.localeCompare(b.r.nombre),
  );
}

// ── Seguimiento de ventas (_planSemSeguimientoHtml 35183) ──
export function seguimientoSem(bt: X) {
  if (!bt || !bt.n) return { estado: 'apagado' as const };
  const sem = bt.semanas.filter((s: X) => s.n > 0);
  if (!sem.length) return { estado: 'sin-historia' as const };
  let mx = 1;
  sem.forEach((s: X) => (mx = Math.max(mx, s.proy, s.real)));
  // Alerta: las 2 semanas COMPLETAS más recientes con proyección (la semana en curso incluye hoy, todavía incompleto)
  const rec = sem.filter((s: X) => s.j >= 2).slice(0, 2);
  let alerta: { dir: 'arriba' | 'abajo'; pct: number } | null = null;
  if (rec.length === 2 && rec[0].desv !== null && rec[1].desv !== null) {
    const m = (rec[0].desv + rec[1].desv) / 2;
    if (m > 0.15) alerta = { dir: 'arriba', pct: m * 100 };
    else if (m < -0.15) alerta = { dir: 'abajo', pct: -m * 100 };
  }
  const arts = bt.arts
    .filter((a: X) => a.valor !== null && a.n >= 2)
    .sort((a: X, b: X) => Math.abs(b.valor) - Math.abs(a.valor))
    .slice(0, 8);
  return {
    estado: 'ok' as const,
    semanas: sem as X[],
    mx,
    alerta,
    arts: arts as X[],
    sinMonto: bt.comprasSinMonto as number,
    mostradas: sem.length,
    configuradas: bt.n as number,
  };
}
/** Diferencia en porcentaje con signo ('+12%', '−'): pct de _planSemSeguimientoHtml. */
export const pctSeg = (x: number | null) => (x === null ? '—' : (x > 0 ? '+' : '') + nf(x * 100) + '%');
