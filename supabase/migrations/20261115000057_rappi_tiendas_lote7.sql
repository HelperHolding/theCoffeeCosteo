-- Rappi del portal, lote 7 de la integración de todas las sucursales. Una fila por tienda, como las migraciones 28, 29,
-- 36 y 51 a 56. IDs y nombres comprobados el 2026-11-15 en solo lectura: el nombre viene del filtro de sucursales del
-- portal (brand/family/email) y coincide con el store_name de sus pedidos del 8 al 14-nov.
-- Tampico 33, Nuevo León y Puente Churubusco tienen Turbo (empezaron a vender el 12 y 13-nov). Durango Centro no tuvo
-- pedidos esa semana; entra por si vuelve a vender.
-- Hora: Juárez (reloj del POS en UTC−6) y Chihuahua marcan la misma hora que el centro; no se convierte nada.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930485700', 717, 'The Coffee Plaza Cantabría', 'normal'),
  ('MX1930476665', 733, 'The Coffee Plaza Norte León', 'normal'),
  ('MX1930283677', 547, 'The Coffee El Campanario', 'normal'),
  ('MX1930480565', 754, 'The Coffee Tampico', 'normal'),
  ('MX1930494641', 754, 'The Coffee Tampico Turbo', 'turbo'),
  ('MX1930469787', 719, 'The Coffee Nuevo Leon CDMX', 'normal'),
  ('MX1930494642', 719, 'The Coffee Nuevo León CDMX Turbo', 'turbo'),
  ('MX1930465116', 715, 'The Coffee Durango Centro', 'normal'),
  ('MX1930480394', 771, 'The Coffee Marina Vallarta', 'normal'),
  ('MX1930492644', 735, 'The Coffee Uruguay 20 CDMX', 'normal'),
  ('MX1930470273', 716, 'The Coffee Plaza Cumbres', 'normal'),
  ('MX1930480568', 770, 'The Coffee Churubusco', 'normal'),
  ('MX1930494385', 770, 'The Coffee Churubusco Turbo', 'turbo');
