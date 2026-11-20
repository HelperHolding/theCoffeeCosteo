import type { CustomNormal, LineaNormal, PedidoNormal } from './normalizar';
import type { PedidoRappi, ProductoRappi } from './rappi-portal';
import { enZona } from './tiempo';

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
  // Sin receta todavía (2026-10-30): quedan ligadas a su código del POS; cuentan solas cuando el código tenga receta.
  'cookie matcha & white chocolate': 'COOMATAPP',
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
  'spooky biscuits': 'SPOBISAPP', // sin receta todavía, ligada a su código del POS
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
 * Productos que Rappi vende con el sabor como opción («Elige Tu Favorito»): el sabor elegido decide el producto (Carlo,
 * 2026-10-30). «Kouign Amann Dulce de Leche» con «Avellana» es el Kouign Amann de avellana (en Namóra, 2 unidades el 29
 * y el 30 de octubre). El renglón toma el nombre del producto de ese sabor: así un mismo nombre no queda con dos
 * códigos (ver identificador). Con «Dulce de Leche» es el mismo producto.
 */
const SABORES_RAPPI: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'kouign amann dulce de leche': { avellana: 'Kouign Amann Hazelnut' },
};
const CATEGORIA_SABOR = 'elige tu favorito';

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
/**
 * Rappi escribe la categoría del vaso de varias formas: «Elige el Tamaño», «Elige tu tamaño» (Pumpkin Iced Latte, True
 * White…) y «Elige el tamaño caliente» (True White).
 */
const CATEGORIAS_TAMANO = ['elige el tamaño', 'elige tu tamaño', 'elige el tamaño caliente'] as const;
const BEBIDA = ['leche', 'café', ...CATEGORIAS_TAMANO, 'miel'] as const;
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
 * «Leche», «Leche.», «Leche Latte»…). `null` = descriptivo, se omite (el combo del POS ya es eso).
 */
/**
 * Bebidas calientes (código POS): en el POS y en Rappi van en Tradicional 240 ml o Grande 355 ml; las demás bebidas son
 * frías, en Tradicional 440 ml o Grande 600 ml (Carlos, 2026-11-18). Incluye los combos del POS con bebida caliente.
 */
const CALIENTES: ReadonlySet<string> = new Set([
  '2AM', // Americano
  '4TW', // True White
  '6CM', // Chai Latte
  '1FC', // Flat Caramel
  '3MC', // Mad Mocha
  '5MC', // Matcha Latte
  '7MVT', // Matcha Vanilla Latte
  '2VLT', // Vainilla Latte
  '4UC', // Urban Chocolat
  'CPUMLAAPP', // Pumpkin Latte
  'SOLAAUAPP', // Sora Latte
  'PEPMOLAPP', // Peppermint Mocha Latte
  'PEPMMLAPP', // Peppermint Mocha Matcha Latte
  'TRWCROAPP', // True White + Croissant de queso y jamón
]);
/** Bebidas de un solo tamaño: el tamaño que mande Rappi no es un vaso (Hot Drip V60 solo es Tradicional caliente). */
const SIN_TAMANO: ReadonlySet<string> = new Set(['1HDV60']);
/**
 * Vaso del POS para el tamaño de Rappi. Rappi escribe el tamaño de muchas formas («Tradicional», «Tradicional 240 ml»,
 * «Mediano 440 ml», «Grande», «Grande 590 ml.»…) y sus ml no siempre corresponden a la bebida (un Americano llega como
 * «Grande 590 ml»): manda la palabra (Tradicional y Mediano = Regular, Grande = Large) y la bebida da los ml. Otra
 * palabra queda a la vista (fuera por tamaño), nunca como Grande.
 */
function vasoRappi(d: string, codigo: string): string | null | undefined {
  const palabra = d.split(' ')[0];
  const regular = ['tradicional', 'mediano'].includes(palabra);
  if (!regular && palabra !== 'grande') return undefined;
  if (SIN_TAMANO.has(codigo)) return null;
  const caliente = CALIENTES.has(codigo);
  return regular
    ? caliente
      ? 'Regular - 240ml'
      : 'Regular - 440ml'
    : caliente
      ? 'Large - 355ml'
      : 'Large - 600ml';
}
/**
 * Vaso de las bebidas de Rappi que llegan sin opción de tamaño. Hasta el 2026-11-03 Rappi las vendía así y eran las
 * grandes (Carlo, 2026-10-29): el Large que usa el POS de Namóra para ese producto (1 al 28 de octubre), 355 ml en las
 * calientes y 600 ml en los frappés; el Gelato Frappé Coffee entra con su tamaño Grande (doc 42). Desde el 2026-11-03
 * todas traen los dos tamaños y manda el elegido, salvo los Métodos: Cold Drip V60 va en el vaso chico (Carlo,
 * 2026-11-03; Regular 440 ml = Chica en TAMANOS_VERIFICADOS) y Hot Drip V60 es de tamaño Único, sin vaso.
 */
export const VASO_UNICO_RAPPI: Readonly<Record<string, string>> = {
  americano: 'Large - 355ml',
  'cold drip v60': 'Regular - 440ml',
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
  'gelato frappé coffee': 'Large - 600ml',
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
  'elige el tamaño': vasoRappi,
  'elige tu tamaño': vasoRappi,
  'elige el tamaño caliente': vasoRappi,
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
  // El sabor ya decidió el producto (SABORES_RAPPI): no es una personalización.
  [CATEGORIA_SABOR]: () => null,
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
  let nombre = x.nombre.replace(/\s+/g, ' ').trim();
  const sabor = x.opciones.find((o) => normalizarRappi(o.categoria) === CATEGORIA_SABOR);
  nombre = (sabor && SABORES_RAPPI[normalizarRappi(nombre)]?.[normalizarRappi(sabor.descripcion)]) ?? nombre;
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
        // Conserva el precio de la opción solo para saber si tuvo costo extra (Consumo lo anota): la venta del combo
        // se suma por las personalizaciones de la línea, nunca por las de sus partes.
        customs: customs(x.opciones, codigoParte, parte.personaliza),
      };
    });
  } else {
    lineaCustoms = customs(x.opciones, codigo);
    const vaso = VASO_UNICO_RAPPI[clave];
    // Si el pedido trae tamaño, manda ese; uno que vasoRappi no reconoce queda a la vista (fuera por tamaño), no como Grande.
    const eligioTamano = x.opciones.some((o) =>
      (CATEGORIAS_TAMANO as readonly string[]).includes(normalizarRappi(o.categoria)),
    );
    if (vaso && !eligioTamano)
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

/**
 * Zona en la que el portal manda `created_at` de TODAS las tiendas (comprobado el 2026-11-15 con el número de pedido,
 * que es correlativo en todo el país: los de Tijuana y Hermosillo calzan con los de CDMX sin desfase). Por eso una
 * sucursal fuera de la hora del centro necesita convertirla para que su Rappi quede en la misma hora que su POS.
 */
export const ZONA_RAPPI = 'America/Mexico_City';

/**
 * Pasa la hora de pared del portal (hora del centro) a la de la sucursal (`zona` de su config, la misma en la que el POS
 * marca sus tickets). Devuelve fecha y segundo; en la zona del centro no cambia nada.
 */
export function horaRappiEnZona(
  fecha: string,
  segundo: number,
  zona: string,
): { fecha: string; segundo: number } {
  if (zona === ZONA_RAPPI) return { fecha, segundo };
  const [a, m, d] = fecha.split('-').map(Number);
  const pared = Date.UTC(a, m - 1, d) + segundo * 1000;
  // Instante real: la hora de pared del centro menos su desfase en ese momento (se ajusta una vez si el primer intento
  // cae del otro lado de un cambio de horario).
  let instante = pared + 6 * 3600_000;
  for (let i = 0; i < 2; i++) {
    const v = enZona(new Date(instante), ZONA_RAPPI);
    const [va, vm, vd] = v.fecha.split('-').map(Number);
    const visto = Date.UTC(va, vm - 1, vd) + v.segundo * 1000;
    if (visto === pared) break;
    instante += pared - visto;
  }
  return enZona(new Date(instante), zona);
}

/**
 * ¿La zona marca la misma hora que el centro en esa fecha? (Monterrey, Mérida o `Etc/GMT+6` sí: no hace falta leer días
 * de más ni convertir). Se compara a mediodía para no depender de la hora exacta de un cambio de horario.
 */
export function mismaHoraQueRappi(zona: string, fecha: string): boolean {
  if (zona === ZONA_RAPPI) return true;
  const r = horaRappiEnZona(fecha, 12 * 3600, zona);
  return r.fecha === fecha && r.segundo === 12 * 3600;
}

/**
 * Escala los importes de líneas y personalizaciones de bruto a venta (factor venta ÷ bruto). Si las líneas sumaban el
 * bruto, la última con importe > 0 absorbe el redondeo y la suma queda exactamente en la venta; si no lo sumaban (el
 * pedido no cuadraba de origen), solo se escala cada importe. Sin descuento devuelve las mismas líneas.
 */
function escalarLineas<L extends LineaNormal>(lineas: L[], brutoCent: number, ventaCent: number): L[] {
  if (ventaCent === brutoCent || brutoCent <= 0) return lineas;
  const f = ventaCent / brutoCent;
  const total = (ls: L[]) =>
    ls.reduce((s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0), 0);
  const cuadraba = total(lineas) === brutoCent;
  const escaladas = lineas.map((l) => ({
    ...l,
    importeCent: Math.round(l.importeCent * f),
    customs: l.customs.map((c) => ({ ...c, importeCent: Math.round(c.importeCent * f) })),
  }));
  if (!cuadraba) return escaladas;
  const diferencia = ventaCent - total(escaladas);
  if (diferencia !== 0) {
    for (let i = escaladas.length - 1; i >= 0; i--) {
      if (escaladas[i].importeCent + diferencia >= 0 && escaladas[i].importeCent > 0) {
        escaladas[i] = { ...escaladas[i], importeCent: escaladas[i].importeCent + diferencia };
        break;
      }
    }
  }
  return escaladas;
}

/**
 * Un pedido de Rappi en la forma del POS (origen «rappi»), o null si fue cancelado o rechazado. `zona` es la de la
 * sucursal (config): la hora del portal se convierte a ella.
 */
export function pedidoRappiAPos(p: PedidoRappi, zona: string = ZONA_RAPPI): PedidoNormal | null {
  if (!sumaVenta(p.estado)) return null;
  const c = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(p.creado);
  if (!c) return null;
  const local = horaRappiEnZona(c[1], Number(c[2]) * 3600 + Number(c[3]) * 60 + Number(c[4]), zona);
  const hh = String(Math.floor(local.segundo / 3600)).padStart(2, '0');
  const mm = String(Math.floor((local.segundo % 3600) / 60)).padStart(2, '0');
  const ss = String(local.segundo % 60).padStart(2, '0');
  const m = [p.creado, local.fecha, hh, mm, ss] as const;
  const brutoCent = cent(p.bruto);
  const descuentoCent = Math.min(brutoCent, Math.max(0, cent(p.descuento_venta ?? 0)));
  const ventaCent = brutoCent - descuentoCent;
  const lineas = escalarLineas(p.productos.flatMap(lineasDe), brutoCent, ventaCent);
  const suma = lineas.reduce(
    (s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0),
    0,
  );
  return {
    id: Number(p.id),
    fecha: m[1],
    segundo: local.segundo,
    hora: `${m[2]}:${m[3]}:${m[4]}`,
    origen: 'rappi',
    ventaCent,
    netoCent: null,
    descuentoCent,
    metodo: 'RAPPI',
    tipo: 'RAPPI_PORTAL',
    lineas,
    numeroPedidoRappi: p.id,
    cuadra: suma === ventaCent,
  };
}
