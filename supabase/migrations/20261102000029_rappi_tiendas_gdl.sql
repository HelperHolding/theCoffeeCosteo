-- Rappi del portal en las otras 10 sucursales de Guadalajara (docs/rappi-portal/07). Una fila por tienda, como la de
-- Namóra en la migración 28. IDs y nombres comprobados el 2026-11-02 en solo lectura: el nombre viene del filtro de
-- sucursales del portal (brand/family/email) y coincide con el store_name de sus pedidos del 27-oct o del 1-nov (Legacy
-- y Calle Ottawa normales no tuvieron pedidos esos días; su nombre sale solo del filtro).
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930260682', 532, 'The Coffee Rubén Darío', 'normal'),
  ('MX1930284884', 532, 'The Coffee Rubén Darío Turbo', 'turbo'),
  ('MX1930213018', 384, 'The Coffee Ventura', 'normal'),
  ('MX1930370852', 384, 'The Coffee Ventura - Turbo', 'turbo'),
  ('MX1930215621', 457, 'The Coffee Aleden Puerta', 'normal'),
  ('MX1930284932', 457, 'The Coffee Aleden Puerta - Turbo', 'turbo'),
  ('MX1930215622', 459, 'The Coffee Legacy', 'normal'),
  ('MX1930366484', 459, 'The Coffee Legacy - Turbo', 'turbo'),
  ('MX1930215620', 477, 'The Coffee Ciudad Granja', 'normal'),
  ('MX1930370853', 477, 'The Coffee Ciudad Granja - Turbo', 'turbo'),
  ('MX1930260683', 515, 'The Coffee Chapu 67', 'normal'),
  ('MX1930384086', 515, 'The Coffee Chapu 67 - Turbo', 'turbo'),
  ('MX1930270836', 514, 'The Coffee Essentia', 'normal'),
  ('MX1930370851', 514, 'The Coffee Essentia - Turbo', 'turbo'),
  ('MX1930258127', 518, 'The Coffee Calle Otawa', 'normal'),
  ('MX1930387241', 518, 'The Coffee Otawa - Turbo', 'turbo'),
  ('MX1930384164', 567, 'The Coffee Gran Plaza', 'normal'),
  ('MX1930416799', 567, 'The Coffee la Gran Plaza - Turbo', 'turbo'),
  ('MX1930395081', 631, 'The Coffee Forum Tlaquepaque', 'normal'),
  ('MX1930469273', 631, 'The Coffee Forum Tlaquepaque - Turbo', 'turbo');
