-- Rappi del portal, lote 1 de la integración de todas las sucursales (9 de CDMX). Una fila por tienda, como las
-- migraciones 28 y 29. IDs y nombres comprobados el 2026-11-03 en solo lectura: el nombre viene del filtro de sucursales
-- del portal (brand/family/email) y coincide con el store_name de sus pedidos del 27-oct al 3-nov. Plaza Samara Turbo
-- todavía no tiene pedidos; su nombre sale solo del filtro.
-- Roma Sur (469) no tiene tiendas en esta cuenta del portal: queda fuera.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930281360', 519, 'The Coffee La Mexicana', 'normal'),
  ('MX1930366068', 519, 'The Coffee la Mexicana - Turbo', 'turbo'),
  ('MX1930281362', 546, 'The Coffee Plaza Carso', 'normal'),
  ('MX1930303311', 546, 'The Coffee Carso - Turbo', 'turbo'),
  ('MX1930270759', 545, 'The Coffee Polanco', 'normal'),
  ('MX1930300871', 545, 'The Coffee Polanco - Turbo', 'turbo'),
  ('MX1930353908', 670, 'The Coffee Reforma', 'normal'),
  ('MX1930403340', 670, 'The Coffee Reforma - Turbo', 'turbo'),
  ('MX1930274353', 460, 'The Coffee Pasaje Parián', 'normal'),
  ('MX1930301162', 460, 'The Coffee Pasaje Parian Turbo', 'turbo'),
  ('MX1930405892', 626, 'The Coffee Patio Universidad', 'normal'),
  ('MX1930469266', 626, 'The Coffee Patio Universidad - Turbo', 'turbo'),
  ('MX1930298953', 607, 'The Coffee Santa Fe', 'normal'),
  ('MX1930370868', 607, 'The Coffee Santa Fe - Turbo', 'turbo'),
  ('MX1930281361', 507, 'The Coffee Hamburgo', 'normal'),
  ('MX1930303310', 507, 'The Coffee Hamburgo - Turbo', 'turbo'),
  ('MX1930371193', 625, 'The Coffee Plaza Samara', 'normal'),
  ('MX1930494360', 625, 'The Coffee Plaza Samara Turbo', 'turbo');
