-- Rappi del portal, lote 6 de la integración de todas las sucursales (Cancún y Mérida). Una fila por tienda, como las
-- migraciones 28, 29, 36 y 51 a 54. IDs y nombres comprobados el 2026-11-15 en solo lectura: el nombre viene del filtro
-- de sucursales del portal (brand/family/email) y coincide con el store_name de sus pedidos del 8 al 14-nov.
-- Puerto Cancún y Malecón Cancún tienen Turbo. «Malecón Turbo» no tuvo pedidos esa semana; es de Malecón Cancún, la
-- única sucursal Malecón, y entra por si empieza a vender. Mayab (627) y Tulum (462) no tienen tienda en la cuenta y se
-- quedan solo con el POS.
-- Hora: el portal manda la hora del centro; la de Cancún se convierte a su zona en pedidoRappiAPos (PR #128).
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930395141', 552, 'The Coffee Puerto Cancún', 'normal'),
  ('MX1930491000', 552, 'The Coffee Puerto Cancún Turbo', 'turbo'),
  ('MX1930441086', 679, 'The Coffee Scala Huayacan', 'normal'),
  ('MX1930356313', 644, 'The Coffee Malecón Cancún', 'normal'),
  ('MX1930494349', 644, 'The Coffee Malecón Turbo', 'turbo'),
  ('MX1930395090', 601, 'The Coffee Calle 47', 'normal'),
  ('MX1930418437', 655, 'The Coffee Arthouse Merida', 'normal');
