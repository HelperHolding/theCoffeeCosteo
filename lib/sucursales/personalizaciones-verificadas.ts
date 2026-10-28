/**
 * Personalizaciones del POS que NO cambian el costo de la receta de Costeo (docs/conciliacion-brasil/33). Una línea con
 * personalizaciones solo es de costeo completo si TODAS están aquí para su receta (o son de temperatura).
 * Lista explícita por receta, NUNCA una regla global: «lo que cuesta $0 no cambia la receta» sería falso (el shot
 * sencillo cuesta $0 y lleva menos café). Cada par se verificó contra la receta vigente el 2026-10-28.
 * Quedan fuera las que cambian cantidades o insumos (leches, shots, miel, jarabes, granos): requieren calcular la
 * diferencia con las cantidades de la receta y el costo de los insumos. Cambiar esta lista exige evidencia, como un lote.
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
  ],
  // Black Ginger
  'af7eeb7f-d1e2-4ea8-a8ab-d3c0f96b2e95': [
    'Traditional Tonic', // tónica de la receta
  ],
  // Black edition 250g
  'd22e139c-c4d7-49b7-b8e6-9b13b40a3519': [
    'Ground (V60)', // grano o molido, misma bolsa
    'In Grains', // grano o molido, misma bolsa
  ],
  // Chai Iced Latte
  '130033f6-dd70-4178-8366-945ea9674199': [
    'Milk', // leche entera, la de la receta
    'Original Chai', // chai de la receta
    'Without Honey', // la receta no lleva miel
  ],
  // Chai Latte
  '5153b158-4329-4ffd-9e79-9cc9d4f06a2a': [
    'Without Honey', // la receta no lleva miel
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
  // Gelato Frappé Chai
  '0252e4e5-3d19-49c1-9f01-2b0f72c1e21b': [
    'Milk uht (Gelato)', // leche entera, la de la receta
    'Tradicional Gelato', // helado de la receta
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
  // Iced Chocolate
  'c55e8b1f-300e-42f7-9c4a-f57b038c987e': [
    'With Sprinkles', // la receta ya lleva 4 g de chips de chocolate
    'Without Coffee', // la receta no lleva café
  ],
  // Iced Latte
  'fcf0d45d-76b2-48a4-8d96-d8abc228eca8': [
    'Milk', // leche entera, la de la receta
    'Without Honey', // la receta no lleva miel
  ],
  // Iced Vanilla
  '15556232-34f4-490e-a9b7-0c01998bc4c1': [
    'Average Vanilla (15ml)', // la receta lleva 15 ml de vainilla
    'Milk', // leche entera, la de la receta
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
    'Without Honey', // la receta no lleva miel
  ],
  // Matcha Iced Latte
  '9756eec9-1f09-45ee-a45b-21ac8c54bb22': [
    'Milk', // leche entera, la de la receta
    'Without Honey', // la receta no lleva miel
    'Without White Sprinkles', // la receta no lleva chispas blancas
  ],
  // Matcha Latte
  'c7ca994c-897c-45d7-a62f-a7ba2f66bbce': [
    'Without Honey', // la receta no lleva miel
  ],
  // Matcha Vanilla Latte
  '3f7f8456-b0a4-49fd-be25-32c1f4b0e17c': [
    'Average Vanilla (10ml)', // la receta lleva 10 ml de vainilla
  ],
  // Pumpkin Iced Latte
  '38847fe5-2d6f-4050-9fd7-aa94bb3d4024': [
    'Milk', // leche entera, la de la receta
  ],
  // Pure Black (Double Shot)
  '89e80a88-123d-4b13-b166-f4e56c506525': [
    'Lungo (Pure Black)', // mismos 18 g de café; cambia el agua
    'Ristretto (Pure Black)', // mismos 18 g de café; cambia el agua
  ],
  // Salted Caramel
  '7867787b-4957-485c-822b-3106558d33a1': [
    'Milk', // leche entera, la de la receta
  ],
  // Sora Iced Latte (Signature)
  '087d714a-45ca-44da-a3ad-55ce92a2bccb': [
    'Original Coco Vanilla Flavor (15ml)', // sabor de la receta
  ],
  // Sora Latte (Signature)
  '2cc57a88-1966-4f7d-9604-461978c7c252': [
    'Original Coco Vanilla Flavor (10ml)', // sabor de la receta
  ],
  // Totebags
  '96e85958-1f5a-44cf-98d7-acd7c7d8102c': [
    'Totebags Cru', // color; todas las tote bags cuestan igual
  ],
  // True White
  'a96339d6-80e7-440b-a33b-bca51440d8e6': [
    'Milk', // leche entera, la de la receta
    'Without Honey', // la receta no lleva miel
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
  // Vanilla Latte
  '1183a781-40b8-4654-9f49-92d317873907': [
    'Average Vanilla (10ml)', // la receta lleva 10 ml de vainilla
  ],
  // White bag 250g
  '5ce9b244-40e2-4153-92b8-7c5dc38968d4': [
    'Ground (V60)', // grano o molido, misma bolsa
    'In Grains', // grano o molido, misma bolsa
  ],
};

export const personalizacionNeutra = (recetaId: string, nombre: string) =>
  TEMPERATURAS.has(nombre) || (PERSONALIZACIONES_NEUTRAS[recetaId]?.includes(nombre) ?? false);
