import { AZUL, COLOR_ORIGEN, SERIE_BASE } from '@/components/sucursales/colores';

/**
 * Colores de datos del tablero BI (skill dataviz). El color sigue a la ENTIDAD, nunca al rango ni al orden en que
 * llega: un filtro que cambia qué métodos de pago o grupos aparecen no repinta a los que quedan. Validado con las
 * pruebas de la skill (L y croma OKLCH, ΔE OKLab×100 normal y protan/deutan/tritan, contraste contra #ffffff):
 * - Grupos, en ORDEN fijo (barra apilada): peor ΔE daltonismo 9.2 (naranja↔verde, deutan), normal 27.6 → PASS.
 * - Café: peor ΔE daltonismo 25.4, normal 28.2 → PASS.
 * - Pagos, en ORDEN fijo: peor ΔE daltonismo 6.1 (Rappi↔App - Wallet, deutan), normal 27.6 → piso legal SOLO con
 *   etiqueta visible: la barra apilada siempre lleva su lista rotulada. Ámbar, verde y rosa quedan bajo 3:1 de
 *   contraste: nunca van como texto ni sin su etiqueta.
 * Un valor fuera de estos mapas sale en gris con su etiqueta (nunca se genera un color nuevo).
 */
export const SIN_COLOR = SERIE_BASE;

/** Comida, Bebida, Combo y Merch: orden fijo de apilado y color por grupo. */
export const GRUPOS: { clave: string; color: string }[] = [
  { clave: 'Bebida', color: AZUL.fuerte },
  { clave: 'Comida', color: COLOR_ORIGEN.app },
  { clave: 'Combo', color: COLOR_ORIGEN.rappi },
  { clave: 'Merch', color: COLOR_ORIGEN.mostrador },
];

/** Contiene café: Sí / No. */
export const CAFE: Record<string, string> = { Sí: '#a0521d', No: AZUL.fuerte };

/** Etiquetas de pago de Zoho: orden fijo de apilado y color por etiqueta. «WALLET» es el nombre previo a 2026-03. */
export const PAGOS: { clave: string; color: string }[] = [
  { clave: 'TABLET - CARD', color: AZUL.fuerte },
  { clave: 'CONTINGENCY - MONEY', color: '#eda100' },
  { clave: 'CONTINGENCY - CARD', color: COLOR_ORIGEN.mostrador },
  { clave: 'APP - CARD', color: COLOR_ORIGEN.app },
  { clave: 'RAPPI', color: COLOR_ORIGEN.rappi },
  { clave: 'APP - WALLET', color: '#e87ba4' },
  { clave: 'WALLET', color: '#e87ba4' },
  { clave: 'RAPPI TURBO', color: '#008300' },
];

const indice = (lista: { clave: string }[], clave: string) => {
  const i = lista.findIndex((x) => x.clave === clave);
  return i < 0 ? lista.length : i;
};

/** Ordena por el orden fijo del mapa; lo desconocido va al final, por nombre. */
export function enOrden<T>(filas: T[], lista: { clave: string }[], clave: (f: T) => string): T[] {
  return [...filas].sort(
    (a, b) => indice(lista, clave(a)) - indice(lista, clave(b)) || clave(a).localeCompare(clave(b), 'es-MX'),
  );
}

export const colorDe = (lista: { clave: string; color: string }[], clave: string) =>
  lista.find((x) => x.clave === clave)?.color ?? SIN_COLOR;

/** Venta (columnas) y tickets (columnas del panel inferior) por periodo: dos medidas, dos paneles, un eje cada uno. */
export const SERIE_VENTA = AZUL.fuerte;
export const SERIE_TICKETS = COLOR_ORIGEN.app;
