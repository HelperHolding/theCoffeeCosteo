-- Rappi del portal, lote 5 de la integración de todas las sucursales (golfo, sur y norte). Una fila por tienda, como las
-- migraciones 28, 29, 36, 51, 52 y 53. IDs y nombres comprobados el 2026-11-15 en solo lectura: el nombre viene del
-- filtro de sucursales del portal (brand/family/email) y coincide con el store_name de sus pedidos del 8 al 14-nov.
-- Solo Distrito Independencia tiene Turbo: «Torreón - Turbo», la única tienda de Torreón además de ella. Fluvial (584) y
-- Aeropuerto Chiapas (781) no tienen tienda en la cuenta y se quedan solo con el POS.
-- Hora: el portal manda la de todas las tiendas en hora del centro; Tijuana y Hermosillo se convierten a su zona en
-- pedidoRappiAPos (PR #128), aquí no cambia nada.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930474432', 705, 'The Coffee Ávila Camacho', 'normal'),
  ('MX1930418447', 590, 'The Coffee Andamar', 'normal'),
  ('MX1930458526', 645, 'The Coffee Oaxaca', 'normal'),
  ('MX1930353519', 632, 'The Coffee Durango', 'normal'),
  ('MX1930281087', 558, 'The Coffee Distrito Independencia', 'normal'),
  ('MX1930370873', 558, 'The Coffee Torreón - Turbo', 'turbo'),
  ('MX1930326350', 613, 'The Coffee Tijuana', 'normal'),
  ('MX1930439764', 664, 'The Coffee Andenes Hermosillo', 'normal');
