-- Rappi del portal, lote 8 de la integración (las sucursales que Zoho ya contaba; docs/sucursales/15). Una fila por
-- tienda, como las migraciones 28, 29, 36, 51 a 54 y 56 a 58. IDs y nombres del filtro de sucursales del portal
-- (brand/family/email, 2026-11-20), comprobados en solo lectura contra el store_name de sus pedidos. Ninguna tiene
-- Turbo en el portal.
-- San Felipe (795) no tiene tienda en el portal. Montes Urales CDMX, Colima CDMX y Vía San Ángel Puebla sí tienen tienda
-- pero todavía no tienen sucursal en la API del POS: no se dan de alta.
-- Hora: Puerto Paraíso (Los Cabos) se convierte a America/Mazatlan en pedidoRappiAPos (−1 h); Plaza Toscana y Guadalupe
-- Zacatecas van en hora del centro.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930495202', 690, 'The Coffee Puerto Paraiso', 'normal'),
  ('MX1930486222', 777, 'The Coffee Plaza Toscana', 'normal'),
  ('MX1930486960', 681, 'The Coffee Guadalupe Zacatecas', 'normal');
