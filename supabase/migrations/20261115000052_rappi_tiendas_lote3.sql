-- Rappi del portal, lote 3 de la integración de todas las sucursales (centro y Bajío). Una fila por tienda, como las
-- migraciones 28, 29, 36 y 51. IDs y nombres comprobados el 2026-11-15 en solo lectura: el nombre viene del filtro de
-- sucursales del portal (brand/family/email) y coincide con el store_name de sus pedidos del 8 al 14-nov.
-- Solo Galerías Metepec y Los Arcos tienen tienda Turbo. La de Metepec se llama «Metepec - Turbo (no hub)» y no tuvo
-- pedidos esa semana; es de Galerías Metepec, porque su ID es anterior al de la tienda de Townsquare (la otra de
-- Metepec). Entra, como las Turbo «(no hub)» del lote 2, por si empieza a vender.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930281363', 520, 'The Coffee Galerías Metepec', 'normal'),
  ('MX1930370916', 520, 'The Coffee Metepec - Turbo (no hub)', 'turbo'),
  ('MX1930466071', 743, 'The Coffee Townsquare', 'normal'),
  ('MX1930274352', 463, 'The Coffee Avándaro', 'normal'),
  ('MX1930407708', 616, 'The Coffee Colosio Pachuca', 'normal'),
  ('MX1930442887', 761, 'The Coffee Centro Histórico Puebla', 'normal'),
  ('MX1930283676', 509, 'The Coffee Los Arcos', 'normal'),
  ('MX1930334152', 509, 'The Coffee Los Arcos - Turbo', 'turbo'),
  ('MX1930482827', 734, 'The Coffee Uptown Juriquilla', 'normal'),
  ('MX1930418453', 466, 'The Coffee San Miguel de Allende Canal 16', 'normal'),
  ('MX1930418539', 614, 'The Coffee Torre Visu', 'normal'),
  ('MX1930326349', 615, 'The Coffee Paseo MS', 'normal');
