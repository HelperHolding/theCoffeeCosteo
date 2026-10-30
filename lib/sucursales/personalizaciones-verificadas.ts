/**
 * Personalizaciones del POS que NO cambian el costo de la receta de Costeo (docs/conciliacion-brasil/33). Una línea con
 * personalizaciones solo es de costeo completo si TODAS están aquí para su receta (o son de temperatura).
 * Lista explícita por receta, NUNCA una regla global: «lo que cuesta $0 no cambia la receta» sería falso (el shot
 * sencillo cuesta $0 y lleva menos café). Cada par se verificó contra la receta vigente el 2026-10-28; los «Milk» de
 * los pedidos de Rappi (que siempre mandan la leche, también la entera), el 2026-10-29: leche entera directa en todos
 * los tamaños de la receta (docs/rappi-portal/04).
 * Las que cambian un insumo o su cantidad van aparte, en PERSONALIZACIONES_AJUSTADAS (etapa 1b, doc 35): el costeo
 * calcula la diferencia con las líneas de la receta y el costo de los insumos. Cambiar estas listas exige evidencia,
 * como un lote.
 */

/** Temperatura de servicio: no cambia ningún insumo, en ninguna receta. El POS usa «º» y «°». */
export const TEMPERATURAS: ReadonlySet<string> = new Set([
  'Original (60°C)',
  'Original (60ºC)',
  'Extra Hot (70°C)',
  'Extra Hot (70ºC)',
  'Warm (50°C)',
  'Warm (50ºC)',
]);

export const PERSONALIZACIONES_NEUTRAS: Record<string, readonly string[]> = {
  // Americano
  '500360bd-fd76-4e22-bf01-9bd3ed6e2ae7': [
    'No Milk (Americano)', // la receta no lleva leche
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Black Ginger
  'af7eeb7f-d1e2-4ea8-a8ab-d3c0f96b2e95': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
    'Traditional Tonic', // tónica de la receta
  ],
  // Black edition 250g
  'd22e139c-c4d7-49b7-b8e6-9b13b40a3519': [
    'Ground (V60)', // grano o molido, misma bolsa
    'In Grains', // grano o molido, misma bolsa
  ],
  // Chai Frap
  'a00da002-92a3-4a48-ab47-b62ee9aa6a13': [
    'Milk', // leche entera, la de la receta
  ],
  // Chai Iced Latte
  '130033f6-dd70-4178-8366-945ea9674199': [
    'Milk', // leche entera, la de la receta
    'Original Chai', // chai de la receta
    'Without Honey', // la receta no lleva miel
  ],
  // Chai Latte
  '5153b158-4329-4ffd-9e79-9cc9d4f06a2a': [
    'Milk', // leche entera, la de la receta
    'Without Honey', // la receta no lleva miel
  ],
  // Coffee Frap
  'ad75d625-2fef-4ce3-8a3f-1e3c049ebbcf': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Cold brew
  '00f47aba-88e6-4ebc-a815-5833f8b29871': [
    'Cold brew - Black', // grano BLACK, el de la receta
    'No Milk (Americano)', // la receta no lleva leche
  ],
  // Croissant filled with cheese
  '49a02218-0eb3-4a49-8742-c4b6c6c0da9c': [
    'Without Chipotle Mayo', // la receta no lleva mayonesa
  ],
  // Croissant filled with cheese and ham
  '4ac9187c-fdaf-4678-8e91-7ead2d596c9b': [
    'Without Chipotle Mayo', // la receta no lleva mayonesa
  ],
  // Flat Caramel
  'f33b95a8-a338-4009-8c03-42edfd81bb6a': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Gelato Frappé Chai
  '0252e4e5-3d19-49c1-9f01-2b0f72c1e21b': [
    'Milk uht (Gelato)', // leche entera, la de la receta
    'Tradicional Gelato', // helado de la receta
  ],
  // Gelato Frappé Coffee
  'adfc682f-380c-41a9-a83d-63f94e0d3042': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Gelato Frappé Matcha
  '22e7e73c-3f8e-471d-b86a-63a35fcfcb64': [
    'Milk uht (Gelato)', // leche entera, la de la receta
    'Tradicional Gelato', // helado de la receta
  ],
  // Grilled Cheese Sandwich
  '9c5f7529-8809-464a-a61a-911d507e2d03': [
    'Without Chipotle Mayo', // la receta no lleva mayonesa
  ],
  // Grilled Ham & Cheese Sandwich
  'ae3742b2-0188-4fc3-88c4-533a8ecb40c9': [
    'Without Chipotle Mayo', // la receta no lleva mayonesa
  ],
  // Grilled Ham Cheese and Tomato Sandwich
  'ff0a88ca-d7c0-4d73-84a3-125815f9274e': [
    'Without Chipotle Mayo', // la receta no lleva mayonesa
  ],
  // Hot Drip V60
  'e0b13ec8-1c24-4ed8-9be2-5198d63a5485': [
    'Hot Drip Black', // grano BLACK, el de la receta
  ],
  // Iced Black
  'cb33752f-e335-46ec-b091-a8a2229eb946': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Iced Chocolate
  'c55e8b1f-300e-42f7-9c4a-f57b038c987e': [
    'Milk', // leche entera, la de la receta
    'With Sprinkles', // la receta ya lleva 4 g de chips de chocolate
    'Without Coffee', // la receta no lleva café
  ],
  // Iced Latte
  'fcf0d45d-76b2-48a4-8d96-d8abc228eca8': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
    'Without Honey', // la receta no lleva miel
  ],
  // Iced Latte + Cookie Tradicional
  '480a3080-d543-4540-adfc-d4e64ba06248': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Iced Latte + Ham & Cheese Sandwich
  'e95e45e9-b5fc-4d10-ab5c-170e13cedf15': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Iced Vanilla
  '15556232-34f4-490e-a9b7-0c01998bc4c1': [
    'Average Vanilla (15ml)', // la receta lleva 15 ml de vainilla
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
    'With Sprinkles', // la receta ya lleva 4 g de chips de chocolate
    'Without White Sprinkles', // la receta no lleva chispas blancas
  ],
  // Ichigo Matcha
  'e201b60f-62e1-4c56-80e5-2b4873baf74f': [
    'Average Vanilla (15ml)', // la receta lleva 15 ml de vainilla
    'Milk', // leche entera, la de la receta
  ],
  // Isopure Iced Latte
  '1a316b88-1212-4403-9dfd-4de2652653ab': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
    'Without Honey', // la receta no lleva miel
  ],
  // Isopure Iced Matcha
  'be97f8cd-e66b-4dca-a38a-c971bdecd3d3': [
    'Milk', // leche entera, la de la receta
  ],
  // Kraft edition 250g
  '8359cad0-fe26-402b-9389-70775647164c': [
    'In Grains', // grano o molido, misma bolsa
  ],
  // Macchiato
  '4255bb6b-1a50-42a4-896d-d3f424b6ceab': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
    'Without Honey', // la receta no lleva miel
  ],
  // Mad Mocha
  'da45b5bd-3eca-452e-a18e-5a558e4dc517': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Matcha Frap
  'bb72c7a6-d900-4d47-bf56-4a74654ccf4b': [
    'Milk', // leche entera, la de la receta
  ],
  // Matcha Iced Latte
  '9756eec9-1f09-45ee-a45b-21ac8c54bb22': [
    'Milk', // leche entera, la de la receta
    'Without Honey', // la receta no lleva miel
    'Without White Sprinkles', // la receta no lleva chispas blancas
  ],
  // Matcha Iced Latte + Lemon Cake
  'a1455ee0-cb6d-4195-bd11-01660fc56cb3': [
    'Milk', // leche entera, la de la receta
  ],
  // Matcha Iced Mint
  '4b651700-0745-42fe-8e78-7b44dbdb66ee': [
    'Milk', // leche entera, la de la receta
  ],
  // Matcha Latte
  'c7ca994c-897c-45d7-a62f-a7ba2f66bbce': [
    'Milk', // leche entera, la de la receta
    'Without Honey', // la receta no lleva miel
  ],
  // Matcha Vanilla Latte
  '3f7f8456-b0a4-49fd-be25-32c1f4b0e17c': [
    'Average Vanilla (10ml)', // la receta lleva 10 ml de vainilla
    'Milk', // leche entera, la de la receta
  ],
  // Nutty Latte (Signature)
  '28d68f0b-1896-491a-9350-02ca52d7d1bd': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Pumpkin Iced Latte
  '38847fe5-2d6f-4050-9fd7-aa94bb3d4024': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Pumpkin Latte
  '170be377-ff76-4bbc-b6d5-85cd9708b21c': [
    'Average Creamer (30ml)', // solo Rappi: la receta lleva 30 ml de creamer (Medio, Carlo 2026-10-29)
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Pumpkin Spice Frap
  '7769fb2e-d7ac-46b6-abeb-e23634d40bd5': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Pure Black (Double Shot)
  '89e80a88-123d-4b13-b166-f4e56c506525': [
    'Lungo (Pure Black)', // mismos 18 g de café; cambia el agua
    'Ristretto (Pure Black)', // mismos 18 g de café; cambia el agua
  ],
  // Pure Black (Single Shot)
  'd9954c93-6a80-45f6-95fb-579b837a62be': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Salted Caramel
  '7867787b-4957-485c-822b-3106558d33a1': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Salted Caramel Frap
  '052a61f6-55ff-4ac8-9459-ab4939789420': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Sora Iced Latte (Signature)
  '087d714a-45ca-44da-a3ad-55ce92a2bccb': [
    'Milk', // leche entera, la de la receta
    'Original Coco Vanilla Flavor (15ml)', // sabor de la receta
  ],
  // Sora Latte (Signature)
  '2cc57a88-1966-4f7d-9604-461978c7c252': [
    'Milk', // leche entera, la de la receta
    'Original Coco Vanilla Flavor (10ml)', // sabor de la receta
  ],
  // Taro Frap
  '817fe3be-7d8b-49be-8e1a-6acde12ccb1c': [
    'Milk', // leche entera, la de la receta
  ],
  // Totebags
  '96e85958-1f5a-44cf-98d7-acd7c7d8102c': [
    'Totebags Cru', // color; todas las tote bags cuestan igual
  ],
  // True White
  'a96339d6-80e7-440b-a33b-bca51440d8e6': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
    'Without Honey', // la receta no lleva miel
  ],
  // True White + Croissant Serrano & Gouda
  '14c61cda-2564-402a-b70f-82ebafc8d7b4': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // True White + Croissant filled with cheese and ham
  'fd4c5628-6681-47dd-ab01-2d0de8ae6d28': [
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // True White + Grilled Ham & Cheese Sandwich
  'd950794b-23cf-4f1c-a775-ee71f5001eff': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // True White + Pain Au Chocolat
  '370a151c-2cc8-4d54-bea6-0b81310637e7': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // True White + Pan de Muerto
  'e500b148-2921-4139-bdf0-184dcb567900': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Tumbler (240ml)
  '7962a115-d69b-4b9d-afa8-8eb753b077ab': [
    'Black Tumbler (240ml)', // color; un solo insumo
    'White Tumbler (240ml)', // color; un solo insumo
  ],
  // Tumbler (360ml)
  '5d918d0f-3cbc-4c86-a0fb-f965df7ba976': [
    'Black Tumbler (360ml)', // color; un solo insumo
    'White Tumbler (360ml)', // color; un solo insumo
  ],
  // Umbrella
  '74e9cffe-f459-42a5-ac57-4e58277ad8f7': [
    'Transparent Umbrella', // color; un solo insumo
  ],
  // Urban Chocolate
  '2c8b49a6-7b2f-489e-8932-1d1ff8c7754c': [
    'Milk', // leche entera, la de la receta
  ],
  // Vanilla Latte
  '1183a781-40b8-4654-9f49-92d317873907': [
    'Average Vanilla (10ml)', // la receta lleva 10 ml de vainilla
    'Milk', // leche entera, la de la receta
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // Vanilla Latte + Pain au Chocolat
  '2f38f651-98ba-4937-b541-b060854f45a7': [
    'Single Shot (18ml)', // la receta lleva 18 g de café: un shot (Carlo, 2026-10-30)
  ],
  // White bag 250g
  '5ce9b244-40e2-4153-92b8-7c5dc38968d4': [
    'Ground (V60)', // grano o molido, misma bolsa
    'In Grains', // grano o molido, misma bolsa
  ],
};

export const personalizacionNeutra = (recetaId: string, nombre: string) =>
  TEMPERATURAS.has(nombre) || (PERSONALIZACIONES_NEUTRAS[recetaId]?.includes(nombre) ?? false);

/**
 * Cómo cambia la receta una personalización: un insumo por otro con la misma cantidad (`cambia`), o la cantidad final
 * de un insumo de la receta (`cantidad`; 0 = sin él). Los nombres son los de Costeo.
 */
export type Ajuste = { cambia: { de: string; a: string } } | { cantidad: { insumo: string; valor: number } };

const LECHE = 'LECHE ENTERA';
const DESLACTOSADA = 'LECHE DESLACTOSADAS';
const VAINILLA = 'JARABE DE VANILLA 1 LT (3 PZAS)';
const CHIPS = 'CHIP DE SABOR CHOCOLATE 1 KG';
const JENGIBRE = 'JARABE DE JENGIBRE 1 LT (3 PZAS)';
const GRANO_BLACK = 'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG';
const GRANO_WHITE = 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG';
const GRANO_KRAFT = 'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG';
/** Café de los shots (Carlo, 2026-10-30): cada shot = 18 g; Single (18 ml) = 18 g y Double (36 ml) = 36 g. */
const CAFE_WHITE = GRANO_WHITE;
const CAFE_BLACK = GRANO_BLACK;
const CREAMER_PUMPKIN = 'CHOBANI D.CREAMER PUMPKIN SPICE';
const DESLACTOSADA_POR_ENTERA: Ajuste = { cambia: { de: LECHE, a: DESLACTOSADA } };

/**
 * Personalizaciones que cambian la receta y cuyo efecto se conoce sin pedir datos (etapa 1b, doc 35), por receta de
 * Costeo. Solo donde se vendieron (28-sep a 25-oct) y donde el insumo que tocan está directo en la receta, en todos sus
 * tamaños. La vainilla con ml en el nombre es la cantidad total (Average = la de la receta). Shots (Carlo,
 * 2026-10-30): cada shot = 18 g de café; en las recetas de espresso con 18 g en todos sus tamaños, «Single Shot (18ml)»
 * es la receta (neutra) y «Double shot (36ml)» deja 36 g. Fuera, a propósito: «Extra Double shot» (falta saber cuántos
 * shots suma), Hot Drip V60 (café filtrado), Pure Black (Double Shot) (su receta lleva 18 g, no 36), «Lactose free» en
 * Americano y Cold brew (no llevan leche: la agrega) y lo que pide datos a Operaciones/Compras (miel, leches vegetales,
 * More/Less de jarabes sin ml, Chipotle Mayo).
 */
export const PERSONALIZACIONES_AJUSTADAS: Record<string, Readonly<Record<string, Ajuste>>> = {
  // Americano
  '500360bd-fd76-4e22-bf01-9bd3ed6e2ae7': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Black Ginger
  'af7eeb7f-d1e2-4ea8-a8ab-d3c0f96b2e95': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'No ginger': { cantidad: { insumo: JENGIBRE, valor: 0 } },
  },
  // Chai Frap
  'a00da002-92a3-4a48-ab47-b62ee9aa6a13': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Chai Iced Latte
  '130033f6-dd70-4178-8366-945ea9674199': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Chai Latte
  '5153b158-4329-4ffd-9e79-9cc9d4f06a2a': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Coffee Frap
  'ad75d625-2fef-4ce3-8a3f-1e3c049ebbcf': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Cold brew
  '00f47aba-88e6-4ebc-a815-5833f8b29871': {
    'Cold brew - Kraft': { cambia: { de: GRANO_BLACK, a: GRANO_KRAFT } },
    'Cold brew - White': { cambia: { de: GRANO_BLACK, a: GRANO_WHITE } },
  },
  // Flat Caramel
  'f33b95a8-a338-4009-8c03-42edfd81bb6a': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Gelato Frappé Chai
  '0252e4e5-3d19-49c1-9f01-2b0f72c1e21b': {
    'Lactose free (Gelato)': DESLACTOSADA_POR_ENTERA,
  },
  // Gelato Frappé Coffee
  'adfc682f-380c-41a9-a83d-63f94e0d3042': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Gelato Frappé Matcha
  '22e7e73c-3f8e-471d-b86a-63a35fcfcb64': {
    'Lactose free (Gelato)': DESLACTOSADA_POR_ENTERA,
  },
  // Hot Drip V60
  'e0b13ec8-1c24-4ed8-9be2-5198d63a5485': {
    'Hot Drip Kraft': { cambia: { de: GRANO_BLACK, a: GRANO_KRAFT } },
    'Hot Drip White': { cambia: { de: GRANO_BLACK, a: GRANO_WHITE } },
  },
  // Iced Black
  'cb33752f-e335-46ec-b091-a8a2229eb946': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Iced Chocolate
  'c55e8b1f-300e-42f7-9c4a-f57b038c987e': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
    'Without Sprinkles': { cantidad: { insumo: CHIPS, valor: 0 } },
  },
  // Iced Latte
  'fcf0d45d-76b2-48a4-8d96-d8abc228eca8': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Iced Latte + Cookie Tradicional
  '480a3080-d543-4540-adfc-d4e64ba06248': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Iced Latte + Ham & Cheese Sandwich
  'e95e45e9-b5fc-4d10-ab5c-170e13cedf15': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Iced Vanilla
  '15556232-34f4-490e-a9b7-0c01998bc4c1': {
    'Average Vanilla (10ml)': { cantidad: { insumo: VAINILLA, valor: 10 } },
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
    'Less Vanilla (10ml)': { cantidad: { insumo: VAINILLA, valor: 10 } },
    'More Vanilla (15ml)': { cantidad: { insumo: VAINILLA, valor: 15 } },
    'More Vanilla (20ml)': { cantidad: { insumo: VAINILLA, valor: 20 } },
    'Without Sprinkles': { cantidad: { insumo: CHIPS, valor: 0 } },
  },
  // Ichigo Matcha
  'e201b60f-62e1-4c56-80e5-2b4873baf74f': {
    'Average Vanilla (10ml)': { cantidad: { insumo: VAINILLA, valor: 10 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
    'Less Vanilla (10ml)': { cantidad: { insumo: VAINILLA, valor: 10 } },
    'More Vanilla (15ml)': { cantidad: { insumo: VAINILLA, valor: 15 } },
    'More Vanilla (20ml)': { cantidad: { insumo: VAINILLA, valor: 20 } },
  },
  // Isopure Iced Latte
  '1a316b88-1212-4403-9dfd-4de2652653ab': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Isopure Iced Matcha
  'be97f8cd-e66b-4dca-a38a-c971bdecd3d3': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Macchiato
  '4255bb6b-1a50-42a4-896d-d3f424b6ceab': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Mad Mocha
  'da45b5bd-3eca-452e-a18e-5a558e4dc517': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Matcha Frap
  'bb72c7a6-d900-4d47-bf56-4a74654ccf4b': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Matcha Iced Latte
  '9756eec9-1f09-45ee-a45b-21ac8c54bb22': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Matcha Latte
  'c7ca994c-897c-45d7-a62f-a7ba2f66bbce': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Matcha Vanilla Latte
  '3f7f8456-b0a4-49fd-be25-32c1f4b0e17c': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
    'Less Vanilla (5ml)': { cantidad: { insumo: VAINILLA, valor: 5 } },
    'More Vanilla (15ml)': { cantidad: { insumo: VAINILLA, valor: 15 } },
  },
  // Nutty Latte (Signature)
  '28d68f0b-1896-491a-9350-02ca52d7d1bd': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Pumpkin Iced Latte
  '38847fe5-2d6f-4050-9fd7-aa94bb3d4024': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Pumpkin Latte
  '170be377-ff76-4bbc-b6d5-85cd9708b21c': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
    // Solo Rappi («Ajusta tu creamer», rappi-pos.ts): la receta lleva 30 ml en Chica y Grande (= Medio, Carlo).
    'Less Creamer (20ml)': { cantidad: { insumo: CREAMER_PUMPKIN, valor: 20 } },
    'More Creamer (40ml)': { cantidad: { insumo: CREAMER_PUMPKIN, valor: 40 } },
  },
  // Pumpkin Spice Frap
  '7769fb2e-d7ac-46b6-abeb-e23634d40bd5': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Pure Black (Single Shot)
  'd9954c93-6a80-45f6-95fb-579b837a62be': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_BLACK, valor: 36 } },
  },
  // Salted Caramel
  '7867787b-4957-485c-822b-3106558d33a1': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Salted Caramel Frap
  '052a61f6-55ff-4ac8-9459-ab4939789420': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Sora Iced Latte (Signature)
  '087d714a-45ca-44da-a3ad-55ce92a2bccb': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Sora Latte (Signature)
  '2cc57a88-1966-4f7d-9604-461978c7c252': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Taro Frap
  '817fe3be-7d8b-49be-8e1a-6acde12ccb1c': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // True White
  'a96339d6-80e7-440b-a33b-bca51440d8e6': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // True White + Croissant Serrano & Gouda
  '14c61cda-2564-402a-b70f-82ebafc8d7b4': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // True White + Croissant filled with cheese and ham
  'fd4c5628-6681-47dd-ab01-2d0de8ae6d28': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // True White + Grilled Ham & Cheese Sandwich
  'd950794b-23cf-4f1c-a775-ee71f5001eff': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // True White + Pain Au Chocolat
  '370a151c-2cc8-4d54-bea6-0b81310637e7': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // True White + Pan de Muerto
  'e500b148-2921-4139-bdf0-184dcb567900': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
  // Urban Chocolate
  '2c8b49a6-7b2f-489e-8932-1d1ff8c7754c': {
    'Lactose free': DESLACTOSADA_POR_ENTERA,
  },
  // Vanilla Latte
  '1183a781-40b8-4654-9f49-92d317873907': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
    'Lactose free': DESLACTOSADA_POR_ENTERA,
    'Less Vanilla (5ml)': { cantidad: { insumo: VAINILLA, valor: 5 } },
    'More Vanilla (15ml)': { cantidad: { insumo: VAINILLA, valor: 15 } },
  },
  // Vanilla Latte + Pain au Chocolat
  '2f38f651-98ba-4937-b541-b060854f45a7': {
    'Double shot (36ml)': { cantidad: { insumo: CAFE_WHITE, valor: 36 } },
  },
};

export const ajusteVerificado = (recetaId: string, nombre: string): Ajuste | undefined =>
  PERSONALIZACIONES_AJUSTADAS[recetaId]?.[nombre];
