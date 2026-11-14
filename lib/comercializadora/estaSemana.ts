import { planKey } from '../../supabase/functions/_shared/planBuild.ts';
import type { ZohoProveedor } from '../../supabase/functions/_shared/planProv.ts';
import {
  borrAnalisis,
  borrFuenteZoho,
  ctxFila,
  hoyGrupos,
  hoyPedidoTexto,
  hoyRiesgos,
  pagoFecha,
  pagoPedidoFecha,
  pagoPorFecha,
  pagoTxt,
  type Borrador,
  type CtxFila,
  type Riesgo,
} from '../../supabase/functions/_shared/planHoy.ts';
import { PSEM_CATS, type GrupoSem, type Sem } from '../../supabase/functions/_shared/planSem.ts';
import { nf } from './importaciones';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
export type { Borrador, CtxFila, Riesgo };
export { borrAnalisis, borrFuenteZoho, ctxFila, hoyRiesgos };

/** ?sem=1: la próxima semana; cualquier otro valor, esta (_hoyUI.sem). */
export const semHoyDe = (v: string | undefined): 0 | 1 => (v === '1' ? 1 : 0);

/** _pagoKeyS: el nombre sin el paréntesis final ("Easy Drinkware (termos)" y "Easy Drinkware" son el mismo proveedor). */
const keySin = (n: unknown) => planKey(String(n || '').replace(/\s*\([^)]*\)\s*$/, ''));

/**
 * Días de crédito de un proveedor del plan (decisión 5 del 3f). El viejo los buscaba por NOMBRE en com_proveedores
 * (_pagoCredito 40641); el portal los toma de com_zoho_proveedor (zoho-sync):
 * 1. local y café: por el vendor de Zoho del grupo (el mayoritario de sus artículos o el de mismo nombre, como el mínimo);
 * 2. si no hay (Importaciones, o un grupo sin vendor): por nombre como el viejo, completo y luego sin el paréntesis final
 *    (con varios, el mayor crédito);
 * 3. sin coincidencia: contado (0 días) y `vendor` null, que la pantalla marca como "sin proveedor de Zoho".
 */
export function creditoProv(
  g: Pick<GrupoSem, 'fuente' | 'pk' | 'nombre'>,
  vendorDe: { local: Record<string, string>; cafe: Record<string, string> | null },
  zprov: ZohoProveedor[] | null | undefined,
): { dias: number; vendor: string | null } {
  const lista = zprov || [];
  const id = g.fuente === 'imp' ? undefined : (g.fuente === 'cafe' ? vendorDe.cafe : vendorDe.local)?.[g.pk];
  const z = id ? lista.find((x) => String(x.vendor_id) === id) : undefined;
  if (z) return { dias: Number(z.dias_credito) || 0, vendor: String(z.vendor_id) };
  const tal = new Map<string, ZohoProveedor>(),
    sin = new Map<string, ZohoProveedor>();
  lista.forEach((x) => {
    tal.set(planKey(x.nombre), x);
    const s = keySin(x.nombre),
      ya = sin.get(s);
    if (!ya || (Number(x.dias_credito) || 0) > (Number(ya.dias_credito) || 0)) sin.set(s, x);
  });
  const m = tal.get(planKey(g.nombre)) ?? sin.get(keySin(g.nombre));
  return m ? { dias: Number(m.dias_credito) || 0, vendor: String(m.vendor_id) } : { dias: 0, vendor: null };
}

export type Credito = (g: GrupoSem) => { dias: number; vendor: string | null };
export interface FilaSemana {
  g: GrupoSem;
  monto: number;
  n: number;
  sinCosto: number;
  minimo: number;
  /** "Bajo el mínimo del proveedor": solo si todos los artículos tienen costo (el monto sería parcial). */
  bajo: boolean;
  cumple: boolean;
  pago: { iso: string; txt: string; dias: number; vinculado: boolean };
  items: X[];
  /** Texto de "Copiar pedido" (solo con proveedor asignado). */
  texto: string | null;
}
/** _hoyPintar: un renglón por proveedor de la semana k, con su monto, su mínimo, el viernes de pago y el pedido. */
export function filasSemana(
  S: Sem,
  k: 0 | 1,
  c: { semIni: string[] },
  hoyIso: string,
  credito: Credito,
): FilaSemana[] {
  return hoyGrupos(S, k).map((g) => {
    const m = g.monto[k],
      min = g.minimo || 0,
      cr = credito(g),
      f = pagoFecha(pagoPedidoFecha(c, k, hoyIso), cr.dias);
    return {
      g,
      monto: m,
      n: g.n[k],
      sinCosto: g.sinCosto[k],
      minimo: min,
      bajo: min > 0 && m > 0 && m < min && !g.sinCosto[k],
      cumple: min > 0 && m >= min,
      pago: { iso: f, txt: pagoTxt(f), dias: cr.dias, vinculado: cr.vendor !== null },
      items: g.rows
        .filter((r: X) => r.sem[k] > 0)
        .sort((a: X, b: X) => b.sem[k] * (b.costo || 0) - a.sem[k] * (a.costo || 0)),
      texto: g.real ? hoyPedidoTexto(g, k, hoyIso) : null,
    };
  });
}
/** Tarjetas de arriba: el total de la semana y el de cada categoría (las tres, con su error si no se pudo calcular). */
export function tarjetasSemana(S: Sem, k: 0 | 1, filas: FilaSemana[]) {
  return {
    total: PSEM_CATS.reduce((t, d) => t + (S.cat[d.id].monto[k] || 0), 0),
    nProv: filas.length,
    nArt: filas.reduce((t, f) => t + f.n, 0),
    sinCosto: filas.reduce((t, f) => t + f.sinCosto, 0),
    cats: PSEM_CATS.map((d) => ({
      def: d,
      monto: S.cat[d.id].monto[k] || 0,
      n: S.cat[d.id].provs.reduce((t, g) => t + g.n[k], 0),
      err: S.cat[d.id].err,
    })),
  };
}
/** "Estas compras se pagan: vie 20 nov $… · …" (_pagoPorFecha). */
export const pagosSemana = (
  filas: FilaSemana[],
  k: 0 | 1,
  c: { semIni: string[] },
  hoyIso: string,
  credito: Credito,
) =>
  pagoPorFecha(
    filas.map((f) => f.g),
    k,
    c,
    hoyIso,
    (g) => credito(g).dias,
  ).map((p) => ({ ...p, txt: pagoTxt(p.f) }));

/** Riesgos que se ven: 5 en la vista simple y 12 con "Ver todo"; el resto se cuenta. */
export function riesgosVista(rs: Riesgo[], simple: boolean) {
  const n = simple ? 5 : 12;
  return { lista: rs.slice(0, n), mas: Math.max(0, rs.length - n), total: rs.length };
}
/** A dónde lleva "Ver" de un riesgo: Qué pedir (lo local; "Todo lo demás" no se porta), Café o Importaciones. */
export const rutaRiesgo = (tab: Riesgo['tab']) =>
  tab === 'cafe'
    ? '/comercializadora/cafe'
    : tab === 'imp'
      ? '/comercializadora/importaciones'
      : '/comercializadora';

/** _borrResolverHtml: cuántos hay de cada acción, el monto y el texto de "Copiar folios por borrar". */
export function resumenBorradores(lista: Borrador[]) {
  const n = { emitir: 0, ajustar: 0, borrar: 0 };
  let tot = 0;
  lista.forEach((o) => {
    n[o.accion]++;
    tot += o.monto;
  });
  const fs = lista.filter((o) => o.accion === 'borrar').map((o) => o.folio);
  return { n, tot, textoBorrar: `Borradores por borrar en Zoho (${fs.length}): ${fs.join(', ')}` };
}

/** _hoyDetalleHtml: números con un decimal si son chicos y fraccionarios. */
export const numDet = (x: number) => nf(x, Math.abs(x) < 10 && x % 1 ? 1 : 0);
/** _hoyDetalleHtml: días que alcanza. */
export const diasDet = (d: number | null | undefined) =>
  d === null || d === undefined ? '—' : d < 1 ? 'menos de 1 d' : d > 365 ? 'más de 1 año' : `${nf(d)} d`;
