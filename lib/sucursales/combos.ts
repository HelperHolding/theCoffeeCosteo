import { ES_TAMANO } from './metricas';
import type { CustomNormal, LineaNormal } from './normalizar';

/**
 * Combos del POS por sus productos, para Consumo (Carlo, 2026-10-30: «cada producto con su trazabilidad dependiendo de
 * la venta»). El croissant de un combo se cuenta con la receta del croissant, igual que cuando se vende suelto, y queda
 * marcado con el combo. Costeo NO usa esta lista: costea el combo con su propia receta.
 *
 * Evidencia (2026-10-30, recetas vigentes): la receta de cada combo = la bebida Chica + el producto, salvo
 * Iced Latte + Ham & Cheese e Iced Latte + Cookie (a la receta del combo le falta el hielo del Iced Latte) y
 * True White + Croissant Serrano & Gouda (otros quesos que el croissant suelto). Lista explícita, como las demás: un
 * combo nuevo no se arma solo.
 */
export interface ParteCombo {
  codigo: string;
  nombre: string;
  customs: CustomNormal[];
}
interface ParteComboPos {
  codigo: string;
  nombre: string;
  /** La bebida del combo: su vaso es el Chico de su receta si el ticket no trae vaso. */
  vasoBase?: string;
}
const CHICO_CALIENTE = 'Regular - 240ml';
const CHICO_FRIO = 'Regular - 440ml';
export const COMBOS_POS: Readonly<Record<string, readonly ParteComboPos[]>> = {
  '2VLT3FOOD3': [
    { codigo: '2VLT', nombre: 'Vanilla Latte', vasoBase: CHICO_CALIENTE },
    { codigo: '3FOOD3', nombre: 'Pain au Chocolat' },
  ],
  '4TW2FOOD2': [
    { codigo: '4TW', nombre: 'True White', vasoBase: CHICO_CALIENTE },
    { codigo: '3FOOD3', nombre: 'Pain au Chocolat' },
  ],
  CHALEMAPP: [
    { codigo: '6CM', nombre: 'Chai Latte', vasoBase: CHICO_CALIENTE },
    { codigo: 'CAKLEMAPP', nombre: 'Lemon Cake' },
  ],
  COMILTAPP: [
    { codigo: '5IL', nombre: 'Iced Latte', vasoBase: CHICO_FRIO },
    { codigo: 'COOTRAAPP', nombre: 'Cookie Traditional' },
  ],
  MATLEMAPP: [
    { codigo: '4MIL', nombre: 'Matcha Iced Latte', vasoBase: CHICO_FRIO },
    { codigo: 'CAKLEMAPP', nombre: 'Lemon Cake' },
  ],
  MISICEDAPP: [
    { codigo: '5IL', nombre: 'Iced Latte', vasoBase: CHICO_FRIO },
    { codigo: 'MQ1', nombre: 'Grilled Ham & Cheese Sandwich' },
  ],
  TRUGOUAPP: [
    { codigo: '4TW', nombre: 'True White', vasoBase: CHICO_CALIENTE },
    { codigo: 'CROGOUAPP', nombre: 'Croissant Serrano & Gouda' },
  ],
  TRUMISAPP: [
    { codigo: '4TW', nombre: 'True White', vasoBase: CHICO_CALIENTE },
    { codigo: 'MQ1', nombre: 'Grilled Ham & Cheese Sandwich' },
  ],
  TRUPANAPP: [
    { codigo: '4TW', nombre: 'True White', vasoBase: CHICO_CALIENTE },
    { codigo: 'PANMUEAPP', nombre: 'Pan de Muerto' },
  ],
  TRWCROAPP: [
    { codigo: '4TW', nombre: 'True White', vasoBase: CHICO_CALIENTE },
    { codigo: 'CROSTUAPP', nombre: 'Croissant filled with cheese and ham' },
  ],
};

/** Personalizaciones del alimento; las demás (vaso, leche, shot, miel, temperatura…) son de la bebida. */
const DEL_ALIMENTO = new Set(['Chipotle Mayo', 'Without Chipotle Mayo']);

/** Las partes de un combo del POS con sus personalizaciones, o undefined si el código no es un combo de la lista. */
export function partesCombo(codigo: string, l: Pick<LineaNormal, 'customs'>): ParteCombo[] | undefined {
  const combo = COMBOS_POS[codigo];
  if (!combo) return undefined;
  return combo.map((p) => {
    if (!p.vasoBase)
      return {
        codigo: p.codigo,
        nombre: p.nombre,
        customs: l.customs.filter((c) => DEL_ALIMENTO.has(c.nombre)),
      };
    const customs = l.customs.filter((c) => !DEL_ALIMENTO.has(c.nombre));
    const conVaso = customs.some((c) => ES_TAMANO.test(c.nombre))
      ? customs
      : [...customs, { codigo: 'COMBO', nombre: p.vasoBase, importeCent: 0, descuentoPct: 0 }];
    return { codigo: p.codigo, nombre: p.nombre, customs: conVaso };
  });
}
