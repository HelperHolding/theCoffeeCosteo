import {
  cafeKgDe,
  planResumen,
  type CorridaCafe,
  type PlanCafe,
} from '../../supabase/functions/_shared/planCafe.ts';
import { CAFE_ESCS } from '../../supabase/functions/_shared/impCafeCfg.ts';
import { planEngDifDias } from '../../supabase/functions/_shared/planEngine.ts';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import { dinero, fImp, nf, type Cuando } from './importaciones';

export type { CorridaCafe, PlanCafe };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/** Vistas de la pantalla (_CAFE_VISTAS_S en la vista simple; _CAFE_VISTAS con "Ver todo"). */
export const VISTAS_CAFE_SIMPLE: [string, string][] = [
  ['pedir', 'Qué pedir'],
  ['resumen', 'Proyección del año'],
  ['params', 'Parámetros'],
];
export const VISTAS_CAFE: [string, string][] = [
  ['pedir', 'Qué pedir'],
  ['resumen', 'Proyección del año'],
  ['mensual', 'Mes por mes'],
  ['precios', 'Presentaciones y precios'],
  ['params', 'Parámetros'],
];
export const vistaCafe = (v: string | undefined, det: boolean) =>
  (det ? VISTAS_CAFE : VISTAS_CAFE_SIMPLE).some((x) => x[0] === v) ? (v as string) : 'pedir';
export const escCafe = (v: string | undefined) => (CAFE_ESCS.includes(v ?? '') ? (v as string) : null);
/** _cafeKg. */
export const kg = (x: number | null | undefined) => (x == null || !isFinite(x) ? '—' : `${nf(x)} kg`);
const fmtFH = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
/** _planFmtFH: fecha y hora de CDMX de un timestamp de la base. */
export const fechaHora = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 16).replace('T', ' ') : fmtFH.format(d);
};

/** _cafeAvisosHtml, en texto. */
export function avisosCafe(c: CorridaCafe, R: Pick<DatosPlan, 'avisos'>): string[] {
  const av: string[] = [],
    cc = c.cfg.cafe,
    red = c.ent.red;
  if (red.activas === 0 && cc.q4_modo === 'auto')
    av.push(
      'No hay sucursales activas visibles para tu usuario: el arranque del año sale en 0. Revisa tus permisos de Aperturas o captura el arranque a mano en Parámetros.',
    );
  const sum = Object.keys(cc.prod).reduce((s, k) => s + cc.prod[k].mezcla, 0);
  if (Math.abs(sum - 1) > 0.0005)
    av.push(
      `La mezcla de presentaciones suma ${Math.round(sum * 1000) / 10}% y no 100%: los kg por presentación no suman el total.`,
    );
  const e = cc.escenarios,
    s = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (s(e.Optimista.aper) < s(e.Base.aper))
    av.push(
      `El escenario Optimista abre menos sucursales en el año (${s(e.Optimista.aper)}) que el Base (${s(e.Base.aper)}): así venía en tu hoja, revísalo.`,
    );
  if (cc.q4_modo === 'auto' && red.ini - 3 * red.a0 < 0)
    av.push(
      'Con el arranque calculado hay menos sucursales maduras que aperturas del último trimestre: revisa las fechas de apertura.',
    );
  if (R.avisos && R.avisos.indexOf('aperturas') >= 0)
    av.push('No se pudieron leer las aperturas: el arranque del año puede estar incompleto.');
  return av;
}

/** _cafeKpisHtml. */
export function kpisCafe(c: CorridaCafe) {
  const R = c.R,
    cr = R.calculadora.resumen,
    dm = R.detalleMensual.kgComprar.mes;
  let pico = 0,
    ip = 0;
  for (let i = 0; i < 12; i++)
    if (dm[i] > pico) {
      pico = dm[i];
      ip = i;
    }
  return {
    kgComprar: cr.kgComprar as number,
    crecimiento: cr.crecimientoVs2026 as number,
    rango: String(R.timeline.rangoTexto),
    comprometer: cr.volumenComprometerKg as number,
    pico,
    mesPico: R.etiquetasMes[ip] as string,
    ahorro: cr.ahorro as number,
    ahorroPct: cr.ahorroPct as number,
    sucursalesCierre: cr.sucursalesCierre as number,
  };
}

// ── "Qué pedir" de café (_ordVistaHtml con fuente 'cafe' y kilos) ──

/** _ordDias. */
export const ordDias = (x: number | null | undefined) =>
  x === null || x === undefined || !isFinite(x)
    ? null
    : x > 365
      ? 'más de un año'
      : `${nf(x)} ${Math.round(x) === 1 ? 'día' : 'días'}`;
/** _ordEsperaOC: "ESPERAR OC" es una regla del cálculo local. */
export const ordEsperaOC = (k: X) => !!(k && k.bloqueado && k.fuente !== 'servidor');
/** _ordRevisar: parece cubierto pero solo por OCs viejas o por inventario negativo. */
export function ordRevisar(r: X): string {
  const k = r.calc,
    s = r.s;
  if (k.pedirEsta > 0 || k.pedirProx > 0 || k.bloqueado) return '';
  const m: string[] = [];
  if (r.stale > 0 && k.disponible - r.stale < k.necesito - 1e-9)
    m.push(`depende de ${nf(r.stale)} uds. de OCs viejas que nunca se marcaron como recibidas`);
  if (s.inv < 0)
    m.push(`el inventario de la plataforma está en negativo (${nf(s.inv)}): el real está en Zoho`);
  return m.join(' y ');
}
function ordRevisarCorto(r: X): string {
  const k = r.calc,
    s = r.s,
    m: string[] = [];
  if (r.stale > 0 && k.disponible - r.stale < k.necesito - 1e-9) m.push('OCs viejas');
  if (s.inv < 0) m.push('inventario negativo');
  return m.join(' e ');
}
type MinMaxSrv = Record<string, { minimo: number | null; maximo: number | null }> | null;
function ordPorQueSrv(r: X, mm: MinMaxSrv, calc: string | null): string {
  const m = mm && mm[r.sku];
  if (!m)
    return 'Este artículo no está en la simulación del servidor (no es Compra Recurrente o le falta proveedor o costo en Zoho).';
  return `Regla de compra: cuando lo que tienes más lo que viene en camino llega al mínimo (${nf(Number(m.minimo))}), se pide hasta el máximo (${nf(Number(m.maximo))}). Simulación del servidor del ${fechaHora(calc)}.`;
}
const d1 = (x: number) => nf(x, x < 10 ? 1 : 0);
/** _ordPorQue (la frase corta de la tabla). */
export function ordPorQue(r: X, mm: MinMaxSrv, calc: string | null): string {
  if (r.calc && r.calc.fuente === 'servidor') return ordPorQueSrv(r, mm, calc);
  const k = r.calc;
  const vta = k.consumo > 0 ? `Vende ${d1(k.consumo)}/día` : 'Sin ventas recientes';
  const ap = k.paraAper > 0 ? ` + ${nf(k.paraAper)} por aperturas` : '';
  if (k.pedirEsta <= 0 && k.pedirProx <= 0 && !k.bloqueado) {
    const rc = ordRevisarCorto(r);
    if (rc) return `Revisar datos: depende de ${rc}`;
  }
  if (k.bloqueado) return `${vta}${ap} · ya viene una OC`;
  return `${vta}${ap} · cubre ${nf(k.diasCubrir)} días`;
}
/** _ordPorQueLargo (el globo de ayuda), con kilos aproximados. */
export function ordPorQueLargo(r: X, mm: MinMaxSrv, calc: string | null): string {
  if (r.calc && r.calc.fuente === 'servidor') return ordPorQueSrv(r, mm, calc);
  const k = r.calc,
    s = r.s,
    falta = Math.max(0, k.necesito - k.disponible);
  const hoy = ordDias(k.diasHoy),
    conOC = ordDias(k.diasAlcanza),
    kgm = cafeKgDe(r.nombre);
  const vta =
    k.consumo > 0
      ? `Vendes ${d1(k.consumo)} al día (${d1(k.consumo * 7)} a la semana, ${d1(k.consumo * 30)} al mes${kgm ? ` ≈ ${nf(k.consumo * 30 * kgm)} kg` : ''})`
      : 'Sin ventas recientes';
  const ap = k.paraAper > 0 ? ` y las próximas aperturas suman ${nf(k.paraAper)}` : '';
  const form = `Cubrir ${nf(k.diasCubrir)} días (proveedor ${s.lt} + ${nf(s.dm)} de seguridad) pide ${nf(k.necesito)}; hay ${nf(k.disponible, 1)}${falta > 0 ? `: faltan ${nf(falta)}.` : ': alcanza.'}`;
  const rev = ordRevisar(r);
  let t: string;
  if (k.pedirEsta > 0)
    t = `${vta}${ap}. ${form}${k.diasHoy === null ? '' : k.diasHoy < 1 ? ' Hoy ya no alcanza.' : ` Hoy alcanza para ${hoy}.`}`;
  else if (k.pedirProx > 0)
    t = `${vta}${ap}. ${form} ${s.enOC > 0 && conOC ? `Con lo que tienes y lo que viene alcanza para ${conOC}` : hoy && k.diasHoy >= 1 ? `Hoy alcanza para ${hoy}` : 'Hoy casi no alcanza'}, pero la próxima semana ya no: entonces pedir ${nf(k.pedirProx)}.`;
  else if (k.bloqueado)
    t = `${vta}${ap}. ${form} Ya viene una OC con ${nf(s.enOC, 1)}: esperar a que llegue.`;
  else if (rev)
    t = `${vta}${ap}. ${form} Revisar datos: ${rev}. Pon al día las OCs y el inventario con Zoho para saber si de verdad hay que pedir.`;
  else t = `${vta}${ap}. ${form}${conOC ? ` Alcanza para ${conOC}.` : ''}`;
  if (s.inv < 0 && !rev) t += ` Inventario negativo en la plataforma (${nf(s.inv)}): el real está en Zoho.`;
  return t;
}

/** _ordVistaHtml (café): KPIs, semáforo y los grupos por proveedor con sus filas, en el orden del viejo. */
export function ordenesCafe(c: PlanCafe, f: { cuando: Cuando; soloAcc: boolean }) {
  const d = planResumen(c);
  let kgE = 0,
    kgP = 0;
  d.esta.forEach((r: X) => {
    const k = cafeKgDe(r.nombre);
    if (k) kgE += r.calc.pedirEsta * k;
  });
  d.prox.forEach((r: X) => {
    const k = cafeKgDe(r.nombre);
    if (k) kgP += r.calc.pedirProx * k;
  });
  const n = { esta: 0, prox: 0, wait: 0, ok: 0, rev: 0 };
  c.rows
    .filter((r) => !r.sinMov && !r.importacion)
    .forEach((r) => {
      const k = r.calc;
      if (k.pedirEsta > 0) n.esta++;
      else if (k.pedirProx > 0) n.prox++;
      else if (ordEsperaOC(k)) n.wait++;
      else if (ordRevisar(r)) n.rev++;
      else n.ok++;
    });
  const filt = (r: X) => {
    const k = r.calc;
    if (r.sinMov) return false;
    if (f.cuando === 'esta') return k.pedirEsta > 0;
    if (f.cuando === 'prox') return k.pedirProx > 0;
    return (
      !f.soloAcc ||
      k.pedirEsta > 0 ||
      k.pedirProx > 0 ||
      k.urgencia !== 'Normal' ||
      k.bloqueado ||
      !!ordRevisar(r)
    );
  };
  const rango = (r: X) => (r.calc.pedirEsta > 0 ? 0 : r.calc.pedirProx > 0 ? 1 : ordEsperaOC(r.calc) ? 2 : 3);
  const grupos = c.provs
    .slice()
    .sort(
      (a, b) =>
        Number(b.nEsta > 0) - Number(a.nEsta > 0) ||
        b.montoEsta - a.montoEsta ||
        Number(b.nProx > 0) - Number(a.nProx > 0) ||
        String(a.nombre).localeCompare(String(b.nombre)),
    )
    .map((g) => ({
      g,
      filas: g.rows
        .filter(filt)
        .sort(
          (a: X, b: X) =>
            rango(a) - rango(b) ||
            (a.calc.diasHoy === null ? 1e9 : a.calc.diasHoy) -
              (b.calc.diasHoy === null ? 1e9 : b.calc.diasHoy),
        )
        .map((r: X) => {
          const k = r.calc,
            s = r.s,
            kgu = cafeKgDe(r.nombre);
          const qp = k.pedirEsta > 0 ? k.pedirEsta : k.pedirProx > 0 ? k.pedirProx : 0;
          const tot = qp > 0 ? k.disponible + qp : null;
          const dH = k.diasHoy,
            dL = r.llegaOC ? planEngDifDias(r.llegaOC, c.hoyIso) : null;
          return {
            r,
            kgu,
            estado: (k.pedirEsta > 0
              ? 'esta'
              : k.pedirProx > 0
                ? 'prox'
                : ordEsperaOC(k)
                  ? 'espera'
                  : ordRevisar(r)
                    ? 'revisar'
                    : 'cubierto') as 'esta' | 'prox' | 'espera' | 'revisar' | 'cubierto',
            quedas: tot,
            diasQuedas: tot !== null && k.consumo > 0 ? tot / k.consumo : null,
            dias: dH === null ? null : dH < 1 ? 'menos de 1 día' : ordDias(dH),
            riesgo: dH !== null && dH < 5 && !(s.enOC > 0 && dL !== null && dL >= 0 && dL <= dH + 0.5),
            llega:
              r.llegaOC && s.enOC > 0 ? fImp(r.llegaOC) + (dL !== null && dL < 0 ? ', atrasada' : '') : null,
          };
        }),
    }))
    .filter((x) => x.filas.length);
  return { d, kgE, kgP, n, grupos };
}
export { dinero };
