-- Rappi del portal en Cd. Juárez (612) y Bonampak (583). Hasta el 15-nov su Rappi llegaba solo por la API del POS
-- (forma de pago RAPPI). Carlo pidió dejar fuera ese Rappi en todas las sucursales y quedarse con el del portal, que
-- separa la tienda normal de la Turbo y trae los productos con sus opciones. IDs y nombres comprobados el 2026-11-15 en
-- solo lectura: coinciden con el store_name de sus pedidos del 8 al 14-nov (89 pedidos).
-- Hora: Bonampak (Cancún) se convierte a su zona en pedidoRappiAPos (+1 h); Juárez (reloj del POS en UTC−6) no cambia.
-- Sin estas filas, rappi_importar rechaza el lote completo si llega una tienda nueva: este alta va ANTES de agregarlas a
-- RAPPI_TIENDAS en el servidor.
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930415960', 612, 'The Coffee Cd. Juárez', 'normal'),
  ('MX1930356312', 583, 'The Coffee Bonampak', 'normal'),
  ('MX1930404424', 583, 'The Coffee Bonampak - Turbo', 'turbo');
