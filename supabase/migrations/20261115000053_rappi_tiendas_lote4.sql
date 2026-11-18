-- Rappi del portal, lote 4 de la integración de todas las sucursales (centro-norte y occidente). Una fila por tienda,
-- como las migraciones 28, 29, 36, 51 y 52. IDs y nombres comprobados el 2026-11-15 en solo lectura: el nombre viene del
-- filtro de sucursales del portal (brand/family/email) y coincide con el store_name de sus pedidos del 8 al 14-nov.
-- Ninguna tiene tienda Turbo. Tepatitlán (508) no tiene tienda en la cuenta y se queda solo con el POS.
-- Centro Puerto Vallarta (582) se llama solo «The Coffee Centro» en el portal (confirmado por Carlo el 15-nov).
-- «Guadalupe Zacatecas» es otra sucursal, fuera de la API: Zacatecas (593) es «The Coffee Zacatecas».
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930287383', 551, 'The Coffee Colosio Aguascalientes', 'normal'),
  ('MX1930474509', 674, 'The Coffee Garza Sada', 'normal'),
  ('MX1930303767', 593, 'The Coffee Zacatecas', 'normal'),
  ('MX1930419845', 718, 'The Coffee Trendy San Luis', 'normal'),
  ('MX1930463809', 763, 'The Coffee Covalia', 'normal'),
  ('MX1930455207', 721, 'The Coffee Constitución', 'normal'),
  ('MX1930290695', 553, 'The Coffee Colima', 'normal'),
  ('MX1930408074', 582, 'The Coffee Centro', 'normal'),
  ('MX1930298952', 478, 'The Coffee Versalles', 'normal');
