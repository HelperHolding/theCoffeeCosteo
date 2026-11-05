-- Rappi del portal, lote 2 de la integración de todas las sucursales (8 de CDMX y 2 de Toluca). Una fila por tienda,
-- como las migraciones 28, 29 y 36. IDs y nombres comprobados el 2026-11-05 en solo lectura: el nombre viene del filtro
-- de sucursales del portal (brand/family/email) y coincide con el store_name de sus pedidos del 3 y 4-nov.
-- Interlomas Turbo y Tecnológico Turbo se llaman «(no hub)» en el portal y no tuvieron pedidos esos días; entran como
-- Plaza Samara Turbo en el lote 1, por si empiezan a vender. Patio Santa Fe y Patio Toluca no tienen tienda Turbo.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930405893', 642, 'The Coffee Puerta Polanco', 'normal'),
  ('MX1930471054', 642, 'The Coffee Puerta Polanco - Turbo', 'turbo'),
  ('MX1930295655', 608, 'The Coffee Interlomas', 'normal'),
  ('MX1930370915', 608, 'The Coffee Interlomas - Turbo (no hub)', 'turbo'),
  ('MX1930295654', 606, 'The Coffee Satélite', 'normal'),
  ('MX1930467343', 606, 'The Coffee Satelite - Turbo', 'turbo'),
  ('MX1930272916', 506, 'The Coffee Portales Norte', 'normal'),
  ('MX1930301133', 506, 'The Coffee Portales Norte - Turbo', 'turbo'),
  ('MX1930284122', 550, 'The Coffee Río Nazas', 'normal'),
  ('MX1930301159', 550, 'The Coffee Rio Naza - Turbo', 'turbo'),
  ('MX1930298521', 611, 'The Coffee Insurgentes', 'normal'),
  ('MX1930370876', 611, 'The Coffee Insurgentes - Turbo', 'turbo'),
  ('MX1930300657', 549, 'The Coffee La del Valle', 'normal'),
  ('MX1930370889', 549, 'The Coffee La Del Valle - Turbo', 'turbo'),
  ('MX1930298522', 610, 'The Coffee Tecnológico', 'normal'),
  ('MX1930406097', 610, 'The Coffee Tecnológico - Turbo (No Hub)', 'turbo'),
  ('MX1930455205', 643, 'The Coffee Patio Santa Fe', 'normal'),
  ('MX1930433754', 646, 'The Coffee Patio Toluca', 'normal');
