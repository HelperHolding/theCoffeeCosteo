// Existencias de insumos críticos (migración 96). Funciones puras: el servidor lee (existencias-servidor.ts) y aquí se
// arma lo que ve la gerencia.
//
// Existencia esperada = último conteo de APERTURA + entradas − consumo teórico − mermas, todo en la unidad de conteo
// del insumo (franq_insumos.unidad). Entradas y mermas cuentan si se registraron DESPUÉS del conteo (por hora); el
// consumo teórico va por día de operación, desde el día del conteo (el de apertura se hace antes de vender) hasta hoy.
// La conciliación compara cada conteo de apertura contra lo que se esperaba desde el conteo de apertura anterior.
import { sumarDias } from './dia';
import { vigentesMerma } from './mermas';
import type { EntradaPedido, FranqConteo, FranqEntrada, FranqInsumo, FranqMerma } from './tipos';

export const DIAS_EXISTENCIAS = 14;

/**
 * Unidades base de Costeo (gr, ml o pza) por unidad de conteo. La lista sugerida cuenta por paquete cuando la
 * presentación es mayor a 1 («paquete de 1500 gr», migración 83): entonces el factor es la presentación; si la gerencia
 * la cambió a la unidad base, es 1. La misma regla que las mermas.
 */
export const factorConteo = (unidad: string, presentacion: number | null | undefined) =>
  presentacion && presentacion > 1 && /^paquete/i.test(unidad.trim()) ? presentacion : 1;

export const vigentesEntrada = (es: FranqEntrada[]) => {
  const corregidas = new Set(es.map((e) => e.corrige_id).filter((x) => x !== null));
  return es.filter((e) => !e.anulada && !corregidas.has(e.id));
};

/** Equivalencia de la OV sugerida (com_insumo_sku): unidades base del insumo por paquete del SKU. */
export interface EquivalenciaSku {
  sku: string;
  insumoId: string;
  factor: number;
}

/**
 * Entradas de un pedido recibido: cada renglón (SKU × cantidad recibida) se convierte a los insumos de la lista de la
 * sucursal con la equivalencia de la OV sugerida. Lo que no se sigue en existencias (sin equivalencia o fuera de la
 * lista) se devuelve aparte para decirlo en pantalla.
 */
export function entradasDePedido(a: {
  lineas: { nombre: string; sku: string | null; recibido: number }[];
  equivalencias: EquivalenciaSku[];
  insumos: Pick<FranqInsumo, 'id' | 'insumo_id' | 'unidad' | 'activo'>[];
  presentaciones: Map<string, number>;
}): { entradas: EntradaPedido[]; sinSeguir: string[] } {
  const porSku = new Map<string, EquivalenciaSku[]>();
  for (const e of a.equivalencias) porSku.set(e.sku, [...(porSku.get(e.sku) ?? []), e]);
  const porInsumo = new Map<string, Pick<FranqInsumo, 'id' | 'unidad'>>();
  for (const i of a.insumos) if (i.activo && i.insumo_id) porInsumo.set(i.insumo_id, i);
  const suma = new Map<number, { cantidad: number; sku: string }>();
  const sinSeguir: string[] = [];
  for (const l of a.lineas) {
    if (!(l.recibido > 0)) continue;
    const destinos = (l.sku ? (porSku.get(l.sku) ?? []) : [])
      .map((e) => ({ e, i: porInsumo.get(e.insumoId) }))
      .filter((x) => x.i);
    if (!destinos.length) {
      sinSeguir.push(l.nombre);
      continue;
    }
    for (const { e, i } of destinos) {
      const cantidad = (l.recibido * e.factor) / factorConteo(i!.unidad, a.presentaciones.get(e.insumoId));
      const previa = suma.get(i!.id);
      suma.set(i!.id, { cantidad: (previa?.cantidad ?? 0) + cantidad, sku: previa?.sku ?? l.sku! });
    }
  }
  const entradas = [...suma].map(([insumo, v]) => ({
    insumo,
    cantidad: Math.round(v.cantidad * 1000) / 1000,
    sku: v.sku,
  }));
  return { entradas: entradas.filter((e) => e.cantidad > 0), sinSeguir };
}

export interface ConteoBase {
  dia: string;
  cantidad: number;
  nombre: string;
  registrado_en: string;
}

export interface Conciliacion {
  /** Día del conteo que se concilia. */
  dia: string;
  /** Lo que se esperaba ese día desde el conteo anterior. */
  esperado: number;
  contado: number;
  /** contado − esperado: negativo = faltante, positivo = sobrante. */
  diferencia: number;
}

export interface FilaExistencia {
  insumoId: number;
  nombre: string;
  unidad: string;
  /** Último conteo de apertura; sin él no hay de dónde partir. */
  base: ConteoBase | null;
  entradas: number;
  mermas: number;
  /** Consumo teórico desde el conteo; null si el insumo no viene de Costeo o no se pudo calcular. */
  consumo: number | null;
  /** base + entradas − consumo − mermas; null sin base o sin consumo. */
  esperado: number | null;
  conciliacion: Conciliacion | null;
}

/** Consumo teórico por día de operación: insumo de Costeo → cantidad en unidad base. */
export type ConsumoPorDia = Map<string, Map<string, number>>;

const redondear = (x: number) => Math.round(x * 1000) / 1000;

/** Días desde `desde` hasta `hasta`, ambos incluidos (vacío si desde > hasta). */
function dias(desde: string, hasta: string): string[] {
  const r: string[] = [];
  for (let d = desde; d <= hasta && r.length <= 400; d = sumarDias(d, 1)) r.push(d);
  return r;
}

export function armarExistencias(a: {
  insumos: FranqInsumo[];
  conteos: FranqConteo[];
  entradas: FranqEntrada[];
  mermas: FranqMerma[];
  /** null si el consumo teórico no se pudo calcular. */
  consumo: ConsumoPorDia | null;
  presentaciones: Map<string, number>;
  hoy: string;
}): FilaExistencia[] {
  const corregidos = new Set(a.conteos.map((c) => c.corrige_id).filter((x) => x !== null));
  const aperturas = a.conteos
    .filter((c) => !corregidos.has(c.id) && c.momento === 'apertura')
    .sort((x, y) => x.registrado_en.localeCompare(y.registrado_en));
  const entradas = vigentesEntrada(a.entradas);
  const mermas = vigentesMerma(a.mermas);

  return [...a.insumos]
    .filter((i) => i.activo)
    .sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre))
    .map((i) => {
      const factor = factorConteo(i.unidad, i.insumo_id ? a.presentaciones.get(i.insumo_id) : null);
      const consumoEntre = (desde: string, hasta: string): number | null => {
        if (!i.insumo_id || !a.consumo) return null;
        let s = 0;
        for (const d of dias(desde, hasta)) s += a.consumo.get(d)?.get(i.insumo_id) ?? 0;
        return s / factor;
      };
      const sumaEntre = <T extends { insumo_id: number; cantidad: number; registrado_en: string }>(
        xs: T[],
        desde: string,
        hasta: string | null,
      ) =>
        xs
          .filter(
            (x) =>
              x.insumo_id === i.id && x.registrado_en > desde && (hasta === null || x.registrado_en <= hasta),
          )
          .reduce((s, x) => s + Number(x.cantidad), 0);

      const propios = aperturas.filter((c) => c.insumo_id === i.id);
      const base = propios.at(-1) ?? null;
      const previo = propios.at(-2) ?? null;
      const vacia: FilaExistencia = {
        insumoId: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        base: null,
        entradas: 0,
        mermas: 0,
        consumo: null,
        esperado: null,
        conciliacion: null,
      };
      if (!base) return vacia;

      const ent = sumaEntre(entradas, base.registrado_en, null);
      const mer = sumaEntre(mermas, base.registrado_en, null);
      const con = consumoEntre(base.dia, a.hoy);
      let conciliacion: Conciliacion | null = null;
      if (previo) {
        const c = consumoEntre(previo.dia, sumarDias(base.dia, -1));
        if (c !== null) {
          const esperado =
            Number(previo.cantidad) +
            sumaEntre(entradas, previo.registrado_en, base.registrado_en) -
            sumaEntre(mermas, previo.registrado_en, base.registrado_en) -
            c;
          conciliacion = {
            dia: base.dia,
            esperado: redondear(esperado),
            contado: Number(base.cantidad),
            diferencia: redondear(Number(base.cantidad) - esperado),
          };
        }
      }
      return {
        ...vacia,
        base: {
          dia: base.dia,
          cantidad: Number(base.cantidad),
          nombre: base.nombre,
          registrado_en: base.registrado_en,
        },
        entradas: redondear(ent),
        mermas: redondear(mer),
        consumo: con === null ? null : redondear(con),
        esperado: con === null ? null : redondear(Number(base.cantidad) + ent - con - mer),
        conciliacion,
      };
    });
}

/** Primer día que hay que leer de ventas: el conteo de apertura anterior más viejo (acotado a DIAS_EXISTENCIAS). */
export function desdeConsumo(conteos: FranqConteo[], hoy: string): string {
  const corregidos = new Set(conteos.map((c) => c.corrige_id).filter((x) => x !== null));
  const porInsumo = new Map<number, string[]>();
  for (const c of conteos)
    if (!corregidos.has(c.id) && c.momento === 'apertura')
      porInsumo.set(c.insumo_id, [...(porInsumo.get(c.insumo_id) ?? []), c.registrado_en + '|' + c.dia]);
  let min = hoy;
  for (const xs of porInsumo.values()) {
    const orden = xs.sort();
    const d = (orden.at(-2) ?? orden.at(-1))!.split('|')[1];
    if (d < min) min = d;
  }
  const limite = sumarDias(hoy, -(DIAS_EXISTENCIAS - 1));
  return min < limite ? limite : min;
}
