import { ES_TAMANO } from './metricas';
import type { CustomNormal, LineaNormal, PedidoNormal } from './normalizar';
import type { PedidoRappi, ProductoRappi } from './rappi-portal';

/**
 * Traductor de pedidos de Rappi (portal de Partners, docs/rappi-portal) a la forma del POS, para que Ventas, Costeo y
 * Consumo los procesen con las MISMAS reglas que los del POS: código POS → receta (producto_codigo_pos), vaso
 * («Regular - 440ml»…) → tamaño verificado, personalizaciones neutras o con ajuste. Piloto: Namóra (docs/rappi-portal/04).
 *
 * Listas explícitas, NUNCA una regla global, como TAMANOS_VERIFICADOS. Lo que no está aquí no se adivina: un producto
 * sin equivalencia queda «sin enlace» y un acompañamiento sin equivalencia llega con su texto de Rappi (personalización
 * no calculada). Cambiar estas listas exige evidencia y revisión.
 */

/** Nombre del menú de Rappi normalizado: minúsculas, sin espacios dobles ni punto final. */
export const normalizarRappi = (s: string) =>
  s.replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLocaleLowerCase('es-MX');

/**
 * Producto de Rappi → código POS (producto_codigo_pos). Evidencia: mismo producto en el menú del POS
 * (docs/conciliacion-brasil/36) con el nombre en español o ligeramente distinto; los tres combos del POS (MISICEDAPP,
 * TRWCROAPP, MATLEMAPP) son los mismos combos de Rappi. Lista para revisión de Carlo en docs/rappi-portal/04. Pan de
 * Muerto (docs/conciliacion-brasil/39): el Tradicional es PANMUEAPP; el de Naranja no tiene código en el POS y usa el
 * código propio RAPPIPANMUENAR (lote 7 de enlaces).
 */
export const PRODUCTOS_RAPPI: Readonly<Record<string, string>> = {
  americano: '2AM',
  'açai bowl': 'ACABOWAPP',
  'banana cake': 'CAKBANAPP',
  'black ginger': '3BG',
  brownie: 'BRO13',
  'chai frappé': 'FRACHAAPP',
  'chai iced latte': '1ICHAI',
  'chai latte': '6CM',
  'cinnamon roll': '5CR',
  'coffee frappé': 'COFFRAAPP',
  'cold brew': '1COLDB',
  'cold drip v60': '1CDV60',
  'cookie tradicional': 'COOTRAAPP',
  'cookie triple chocolate': 'COOCHOAPP',
  'croissant relleno de queso y jamón': 'CROSTUAPP',
  'croissant serrano & gouda': 'CROGOUAPP',
  'croissant traditional': '2FOOD2',
  'flat caramel': '1FC',
  'gelato frappé coffee': 'SHCO',
  'hazelnut cream croissant': 'HALCRCAPP',
  'hot drip v60': '1HDV60',
  'iced black': '6ICB',
  'iced chocolate': 'ICECHOAPP',
  'iced latte': '5IL',
  'iced latte + sandwich jamón y queso': 'MISICEDAPP',
  'iced vanilla': '1IC',
  'ichigo matcha': '9IMT',
  'isopure iced latte': 'PCFICEAPP',
  'isopure iced matcha': 'PCFMATAPP',
  'kouign amann dulce de leche': 'KOAMDLAPP',
  'kouign amann hazelnut': 'KOAMAVAPP',
  'lemon cake': 'CAKLEMAPP',
  'mad mocha': '3MC',
  'matcha frappé': 'FRAMATAPP',
  'matcha iced latte': '4MIL',
  'matcha iced latte + lemon cake': 'MATLEMAPP',
  'matcha iced mint': '7IC',
  'matcha latte': '5MC',
  'matcha vanilla latte': '7MVT',
  'mineral water perrier': 'WATPERAPP',
  'pain au chocolat': '3FOOD3',
  'pan de muerto con glaseado de naranja': 'RAPPIPANMUENAR',
  'pan de muerto tradicional': 'PANMUEAPP',
  'pumpkin iced latte': 'CPUMICAPP',
  'pumpkin latte': 'CPUMLAAPP',
  'pumpkin spice frap': 'CPUMFRAPP',
  'salted caramel': '2SC',
  'salted caramel frappé': 'SALFRAAPP',
  'sandwich jamón, queso, cherry y orégano': 'BR3',
  'sora iced latte': 'SOICAUAPP',
  'sora latte': 'SOLAAUAPP',
  'sándwich de tres quesos': 'QQ2',
  'sándwich jamón y queso': 'MQ1',
  'sándwich tres quesos al grill': 'QQ2',
  'taro frappé': 'FRATARAPP',
  'true white': '4TW',
  'true white + croissant de queso y jamón': 'TRWCROAPP',
  'tumbler (360ml) タンブラーカップ': '3TBB',
  'urban chocolat': '4UC',
  'vainilla latte': '2VLT',
  'white bag 250g': '1CBWB',
};

/**
 * Combos que solo existen en Rappi: se venden a su precio y se arman con sus partes (decisión de Carlo, 2026-10-29:
 * costo = suma de las partes). Cada parte sale de una categoría de acompañamientos; sus personalizaciones son las de
 * las categorías indicadas. Una parte sin receta deja el combo sin enlace (p. ej. Pan de Muerto,
 * docs/conciliacion-brasil/37).
 */
interface ParteCombo {
  /** Categoría (normalizada) cuyo acompañamiento elegido ES la parte; o un producto fijo del combo. */
  eleccion?: string;
  fijo?: string;
  /** Categorías (normalizadas) de acompañamientos que personalizan esta parte. */
  personaliza: readonly string[];
}
const BEBIDA = ['leche', 'café', 'elige el tamaño', 'miel'] as const;
export const COMBOS_RAPPI: Readonly<Record<string, readonly ParteCombo[]>> = {
  'crea tu the coffee': [
    { eleccion: 'elige tu bebida', personaliza: BEBIDA },
    { eleccion: 'elige tu sandwich', personaliza: ['con mayonesa de chipotle'] },
  ],
  'pan de muerto tradicional + true white': [
    { fijo: 'true white', personaliza: BEBIDA },
    { fijo: 'pan de muerto tradicional', personaliza: [] },
  ],
};

/**
 * Acompañamiento de Rappi → personalización del POS, por categoría normalizada (Rappi la escribe con variantes:
 * «Leche», «Leche.», «Leche Latte»…). Vasos: Mediano y Tradicional 440 ml = Regular 440; Tradicional 240 ml = Regular
 * 240; Grande 590 ml = Large 600; Grande 355 ml = Large 355 (Carlo, 2026-10-29). `null` = descriptivo, se omite (el
 * combo del POS ya es eso).
 */
const VASOS: Readonly<Record<string, string>> = {
  'mediano 440 ml': 'Regular - 440ml',
  'tradicional 440 ml': 'Regular - 440ml',
  'tradicional 240 ml': 'Regular - 240ml',
  'grande 590 ml': 'Large - 600ml',
  'grande 355 ml': 'Large - 355ml',
};
/**
 * Bebidas que Rappi vende sin opción de tamaño: son las grandes (Carlo, 2026-10-29). El vaso es el Large que usa el POS
 * de Namóra para ese producto (1 al 28 de octubre): 355 ml en las calientes y 600 ml en los frappés. Cold Drip V60 no
 * está: en el POS no lleva vaso.
 */
export const VASO_UNICO_RAPPI: Readonly<Record<string, string>> = {
  americano: 'Large - 355ml',
  'chai latte': 'Large - 355ml',
  'flat caramel': 'Large - 355ml',
  'mad mocha': 'Large - 355ml',
  'matcha latte': 'Large - 355ml',
  'matcha vanilla latte': 'Large - 355ml',
  'pumpkin latte': 'Large - 355ml',
  'sora latte': 'Large - 355ml',
  'urban chocolat': 'Large - 355ml',
  'vainilla latte': 'Large - 355ml',
  'chai frappé': 'Large - 600ml',
  'coffee frappé': 'Large - 600ml',
  'matcha frappé': 'Large - 600ml',
  'pumpkin spice frap': 'Large - 600ml',
  'salted caramel frappé': 'Large - 600ml',
  'taro frappé': 'Large - 600ml',
};
const LECHES: Readonly<Record<string, string>> = {
  entera: 'Milk',
  deslactosada: 'Lactose free',
  avena: 'Oatmilk',
  almendra: 'Almond Milk',
  'leche de coco': 'Coconut Milk',
  'sin leche': 'No Milk (Americano)',
};
const MIEL: Readonly<Record<string, string>> = {
  sin: 'Without Honey',
  poco: 'Less Honey',
  promedio: 'Average Honey',
  mucho: 'More Honey',
};
const SHOTS: Readonly<Record<string, string>> = {
  'double shot (36ml)': 'Double shot (36ml)',
  'single shot (18ml)': 'Single Shot (18ml)',
  'extra double shot (+36ml)': 'Extra Double shot (36ml)',
};
/** Jarabes con ml en el POS: dependen de la receta (código POS) porque la cantidad de la receta cambia. */
const VAINILLA: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '2VLT': { medio: 'Average Vanilla (10ml)', más: 'More Vanilla (15ml)', menos: 'Less Vanilla (5ml)' },
  '7MVT': { medio: 'Average Vanilla (10ml)', más: 'More Vanilla (15ml)', menos: 'Less Vanilla (5ml)' },
  '1IC': { medio: 'Average Vanilla (15ml)', más: 'More Vanilla (20ml)', menos: 'Less Vanilla (10ml)' },
  '9IMT': { medio: 'Average Vanilla (15ml)', más: 'More Vanilla (20ml)', menos: 'Less Vanilla (10ml)' },
};
const CATEGORIAS: Readonly<Record<string, (d: string, codigo: string) => string | null | undefined>> = {
  'elige el tamaño': (d) => VASOS[d],
  leche: (d) => LECHES[d],
  'leche latte': (d) => LECHES[d],
  'leche para tú gelato frappé': (d) =>
    d === 'deslactosada' ? 'Lactose free (Gelato)' : d === 'avena' ? 'Oatmilk (Gelato)' : undefined,
  café: (d) => SHOTS[d],
  miel: (d) => MIEL[d],
  vainilla: (d, codigo) => VAINILLA[codigo]?.[d],
  'caramelo salado': (d) =>
    ({
      medio: 'Average Salted Caramel (cold)',
      más: 'More Salted Caramel (cold)',
      menos: 'Less Salted Caramel (cold)',
    })[d],
  caramelo: (d) => ({ medio: 'Average Caramelo (hot)' })[d],
  jengibre: (d) => ({ médio: 'Average Gengibre (Black Ginger)' })[d],
  menta: (d) => ({ medio: 'Average Mint', menos: 'Less Mint', mas: 'More Mint' })[d],
  chispitas: (d) => ({ 'con chispas': 'With Sprinkles', 'sin chispas': 'Without Sprinkles' })[d],
  'con mayonesa de chipotle': (d) =>
    ({ 'con mayonesa chipotle': 'Chipotle Mayo', 'sin mayonesa chipotle': 'Without Chipotle Mayo' })[d],
  agua: (d) => ({ 'con tónica tradicional': 'Traditional Tonic' })[d],
  // Solo existe en Rappi (Pumpkin): cantidad total de creamer, como la vainilla con ml del POS.
  'ajusta tu creamer': (d) =>
    ({
      'medio - 30 ml de creamer': 'Average Creamer (30ml)',
      'mas - 40 ml de creamer': 'More Creamer (40ml)',
      'menos - 20 ml de creamer': 'Less Creamer (20ml)',
    })[d],
  // Combo del POS «Iced Latte + Ham & Cheese Sandwich»: solo nombran sus partes fijas.
  'personaliza tu iced latte': () => null,
  'personaliza tu sandwich': () => null,
};

/** Un acompañamiento en el idioma del POS; sin equivalencia, conserva el texto de Rappi (no calculado). */
export function opcionPos(categoria: string, descripcion: string, codigo: string): string | null {
  const c = normalizarRappi(categoria);
  const d = normalizarRappi(descripcion);
  const traducida = CATEGORIAS[c]?.(d, codigo);
  if (traducida === null) return null;
  const limpio = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return traducida ?? `${limpio(categoria)}: ${limpio(descripcion)}`;
}

const cent = (pesos: number) => Math.round(pesos * 100);
const customs = (opciones: ProductoRappi['opciones'], codigo: string, categorias?: readonly string[]) =>
  opciones
    .filter((o) => !categorias || categorias.includes(normalizarRappi(o.categoria)))
    .flatMap((o): CustomNormal[] => {
      const nombre = opcionPos(o.categoria, o.descripcion, codigo);
      return nombre === null
        ? []
        : [{ codigo: 'RAPPI', nombre, importeCent: cent(o.precio), descuentoPct: 0 }];
    });

/** Parte de un combo armado: su código POS (si tiene receta) y sus personalizaciones. */
export interface ParteLinea {
  codigo: string;
  nombre: string;
  customs: CustomNormal[];
}

/** Código para un producto de Rappi sin equivalencia: nunca coincide con un código del POS (queda «sin enlace»). */
const SIN_ENLACE = (nombre: string) => `RAPPI:${normalizarRappi(nombre)}`;

/**
 * Las líneas (una por unidad, como el POS) de un producto de Rappi. Importe de la unidad = precio del renglón /
 * unidades; los acompañamientos con precio van como personalizaciones con su importe, así que Σ = precio del renglón.
 */
export function lineasDe(x: ProductoRappi): (LineaNormal & { partes?: ParteLinea[] })[] {
  const nombre = x.nombre.replace(/\s+/g, ' ').trim();
  const clave = normalizarRappi(nombre);
  const combo = COMBOS_RAPPI[clave];
  let codigo = PRODUCTOS_RAPPI[clave] ?? SIN_ENLACE(nombre);
  let lineaCustoms: CustomNormal[];
  let partes: ParteLinea[] | undefined;
  if (combo) {
    codigo = `RAPPI-COMBO:${clave}`;
    // Todos los acompañamientos con precio quedan en la línea (importe); las partes llevan sus personalizaciones.
    lineaCustoms = x.opciones
      .filter((o) => o.precio)
      .map((o) => ({
        codigo: 'RAPPI',
        nombre: o.descripcion.trim(),
        importeCent: cent(o.precio),
        descuentoPct: 0,
      }));
    partes = combo.map((parte) => {
      const elegida = parte.eleccion
        ? x.opciones.find((o) => normalizarRappi(o.categoria) === parte.eleccion)?.descripcion
        : parte.fijo;
      const nombreParte = (elegida ?? '').replace(/\s+/g, ' ').trim();
      const codigoParte = PRODUCTOS_RAPPI[normalizarRappi(nombreParte)] ?? SIN_ENLACE(nombreParte || clave);
      return {
        codigo: codigoParte,
        nombre: nombreParte,
        customs: customs(x.opciones, codigoParte, parte.personaliza).map((c) => ({ ...c, importeCent: 0 })),
      };
    });
  } else {
    lineaCustoms = customs(x.opciones, codigo);
    const vaso = VASO_UNICO_RAPPI[clave];
    if (vaso && !lineaCustoms.some((c) => ES_TAMANO.test(c.nombre)))
      lineaCustoms.push({ codigo: 'RAPPI', nombre: vaso, importeCent: 0, descuentoPct: 0 });
  }
  // Una línea por unidad; la última absorbe el redondeo, así que Σ líneas = precio del renglón.
  const n = Math.max(1, x.unidades);
  const repartir = (total: number) =>
    Array.from({ length: n }, (_, i) =>
      i < n - 1 ? Math.floor(total / n) : total - Math.floor(total / n) * (n - 1),
    );
  const extras = lineaCustoms.map((c) => repartir(c.importeCent));
  const bases = repartir(cent(x.precio) - lineaCustoms.reduce((s, c) => s + c.importeCent, 0));
  return bases.map((base, i) => ({
    codigo,
    nombre,
    importeCent: base,
    descuentoPct: 0,
    customs: lineaCustoms.map((c, k) => ({ ...c, importeCent: extras[k][i] })),
    ...(partes ? { partes } : {}),
  }));
}

/** Estados que suman: terminados y en curso. Cancelados y rechazados no son venta. */
const sumaVenta = (estado: string) => !/^cancel/.test(estado);

/** Un pedido de Rappi en la forma del POS (origen «rappi»), o null si fue cancelado o rechazado. */
export function pedidoRappiAPos(p: PedidoRappi): PedidoNormal | null {
  if (!sumaVenta(p.estado)) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(p.creado);
  if (!m) return null;
  const lineas = p.productos.flatMap(lineasDe);
  const ventaCent = cent(p.bruto);
  const suma = lineas.reduce(
    (s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0),
    0,
  );
  return {
    id: Number(p.id),
    fecha: m[1],
    segundo: Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]),
    hora: `${m[2]}:${m[3]}:${m[4]}`,
    origen: 'rappi',
    ventaCent,
    netoCent: null,
    descuentoCent: p.descuento_aliado === null ? 0 : cent(p.descuento_aliado),
    metodo: 'RAPPI',
    tipo: 'RAPPI_PORTAL',
    lineas,
    numeroPedidoRappi: p.id,
    cuadra: suma === ventaCent,
  };
}
