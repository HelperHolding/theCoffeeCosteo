/**
 * Tamaños verificados por producto (receta de Costeo): qué vaso del POS («Regular - …ml» / «Large - …ml») corresponde
 * a qué tamaño de Costeo. Lista explícita, NUNCA una regla global: solo productos con evidencia de precio por tamaño en
 * 532 (E1 del doc 16, lotes 3 y 4). Quedan fuera, por ejemplo, Iced Blueberry Matcha y Matcha Iced Mint (E1 pendiente) y
 * el Grande de Chai Frap. «Sin vaso» solo se costea en productos de tamaño Único (ver costeo.ts).
 * Cambiar esta lista exige evidencia y revisión, como un lote.
 */
export const TAMANOS_VERIFICADOS: Record<string, Partial<Record<'Regular' | 'Large', 'Chica' | 'Grande'>>> = {
  // True White (4TW)
  'a96339d6-80e7-440b-a33b-bca51440d8e6': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Americano (2AM)
  '500360bd-fd76-4e22-bf01-9bd3ed6e2ae7': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Salted Caramel (2SC)
  '7867787b-4957-485c-822b-3106558d33a1': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Matcha Iced Latte (4MIL)
  '9756eec9-1f09-45ee-a45b-21ac8c54bb22': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Iced Vanilla (1IC)
  '15556232-34f4-490e-a9b7-0c01998bc4c1': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Vanilla Latte (2VLT)
  '1183a781-40b8-4654-9f49-92d317873907': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Ichigo Matcha (9IMT)
  'e201b60f-62e1-4c56-80e5-2b4873baf74f': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Chai Iced Latte (1ICHAI)
  '130033f6-dd70-4178-8366-945ea9674199': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Isopure Iced Latte (PCFICEAPP)
  '1a316b88-1212-4403-9dfd-4de2652653ab': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Chai Latte (6CM)
  '5153b158-4329-4ffd-9e79-9cc9d4f06a2a': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Flat Caramel (1FC)
  'f33b95a8-a338-4009-8c03-42edfd81bb6a': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Isopure Iced Matcha (PCFMATAPP)
  'be97f8cd-e66b-4dca-a38a-c971bdecd3d3': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Sora Iced Latte (Signature) (SOICAUAPP)
  '087d714a-45ca-44da-a3ad-55ce92a2bccb': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Cold brew (1COLDB)
  '00f47aba-88e6-4ebc-a815-5833f8b29871': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Black Ginger (3BG)
  'af7eeb7f-d1e2-4ea8-a8ab-d3c0f96b2e95': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Mad Mocha (3MC)
  'da45b5bd-3eca-452e-a18e-5a558e4dc517': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Iced Black (6ICB)
  'cb33752f-e335-46ec-b091-a8a2229eb946': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Iced Chocolate (ICECHOAPP)
  'c55e8b1f-300e-42f7-9c4a-f57b038c987e': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Sora Latte (Signature) (SOLAAUAPP)
  '2cc57a88-1966-4f7d-9604-461978c7c252': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Matcha Latte (5MC)
  'c7ca994c-897c-45d7-a62f-a7ba2f66bbce': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Matcha Vanilla Latte (7MVT)
  '3f7f8456-b0a4-49fd-be25-32c1f4b0e17c': { Regular: 'Chica', Large: 'Grande' }, // E1, doc 16
  // Pumpkin Iced Latte (CPUMICAPP)
  '38847fe5-2d6f-4050-9fd7-aa94bb3d4024': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Pumpkin Latte (CPUMLAAPP)
  '170be377-ff76-4bbc-b6d5-85cd9708b21c': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Pumpkin Spice Frap (CPUMFRAPP)
  '7769fb2e-d7ac-46b6-abeb-e23634d40bd5': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Salted Caramel Frap (SALFRAAPP)
  '052a61f6-55ff-4ac8-9459-ab4939789420': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Taro Frap (FRATARAPP)
  '817fe3be-7d8b-49be-8e1a-6acde12ccb1c': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Coffee Frap (COFFRAAPP)
  'ad75d625-2fef-4ce3-8a3f-1e3c049ebbcf': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Matcha Frap (FRAMATAPP)
  'bb72c7a6-d900-4d47-bf56-4a74654ccf4b': { Regular: 'Chica', Large: 'Grande' }, // lote 3, doc 26
  // Chai Frap (FRACHAAPP)
  'a00da002-92a3-4a48-ab47-b62ee9aa6a13': { Regular: 'Chica' }, // lote 3, doc 26: Grande sin precio comparable
  // Iced Latte (5IL)
  'fcf0d45d-76b2-48a4-8d96-d8abc228eca8': { Regular: 'Chica', Large: 'Grande' }, // lote 4, doc 28
  // Urban Chocolate (4UC)
  '2c8b49a6-7b2f-489e-8932-1d1ff8c7754c': { Regular: 'Chica', Large: 'Grande' }, // lote 4, doc 28
};
