-- Alta de los 4 Peppermint Mocha en Costeo (2026-11-17).
-- Fuente: Productos_nuevos_Costeo_2026-11-17.xlsx, hoja «1 Peppermint Mocha».
-- Receta POR ANALOGÍA (borrador), cargada a pedido de Sebastián el 2026-11-17. Preguntas abiertas en ese archivo:
-- jarabe de peppermint vs jarabe de menta, cantidades de jarabe y cacao, topping y cantidad de matcha.
-- Categoría Seasonal y precio de lista Chica $99 / Grande $109, como Pumpkin Latte.
-- Todo en una transacción: si algo no cuadra, se revierte todo.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';
select set_config('app.origen', 'carga_masiva', true);

create temp table pep_carga on commit drop as select gen_random_uuid() as carga_id;

create temp table pep_productos (nombre text primary key, codigo text not null, chica numeric, grande numeric) on commit drop;
insert into pep_productos values
  ('Peppermint Mocha Latte',        'PEPMOLAPP', 19.55, 21.51),
  ('Peppermint Mocha Iced Latte',   'PEPMIALPP', 20.25, 23.09),
  ('Peppermint Mocha Matcha Latte', 'PEPMMLAPP', 17.37, 19.33),
  ('Peppermint Mocha Iced Matcha',  'PEPIMLAPP', 18.07, 22.15);

-- producto, orden, componente (insumo o sub-receta), cantidad Chica, cantidad Grande (null = no lleva)
create temp table pep_lineas (producto text, orden int, componente text, chica numeric, grande numeric) on commit drop;
insert into pep_lineas values
  ('Peppermint Mocha Latte', 0, 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 18, 18),
  ('Peppermint Mocha Latte', 1, 'LECHE ENTERA', 170, 250),
  ('Peppermint Mocha Latte', 2, 'Mix AZUCAR MASCABADO USO BARRA + COCOA POWDER - EXTRA BRUTE 1 KG', 10, 10),
  ('Peppermint Mocha Latte', 3, 'JARABE DE MENTA 1 LT (3 PZAS)', 15, 15),
  ('Peppermint Mocha Latte', 4, 'VASO CALIENTE PAPEL KRAFT 8 OZ (500 PZS)', 1, null),
  ('Peppermint Mocha Latte', 5, 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', null, 1),
  ('Peppermint Mocha Latte', 6, 'TAPA CALIENTE 80MM (1,000 PZS)', 1, null),
  ('Peppermint Mocha Latte', 7, 'TAPA CALIENTE 90MM (1,000 PZS)', null, 1),

  ('Peppermint Mocha Iced Latte', 0, 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 18, 18),
  ('Peppermint Mocha Iced Latte', 1, 'LECHE ENTERA', 170, 290),
  ('Peppermint Mocha Iced Latte', 2, 'HIELO (g)', 130, 245),
  ('Peppermint Mocha Iced Latte', 3, 'Mix AZUCAR MASCABADO USO BARRA + COCOA POWDER - EXTRA BRUTE 1 KG', 10, 10),
  ('Peppermint Mocha Iced Latte', 4, 'JARABE DE MENTA 1 LT (3 PZAS)', 15, 15),
  ('Peppermint Mocha Iced Latte', 5, 'VASO FRÍO PET 14 OZ (1,000 PZS)', 1, null),
  ('Peppermint Mocha Iced Latte', 6, 'VASO FRÍO PET 20 OZ (1,000 PZS)', null, 1),
  ('Peppermint Mocha Iced Latte', 7, 'TAPA FRIO PET (1,000 PZS)', 1, 1),
  ('Peppermint Mocha Iced Latte', 8, 'POPOTE CON PUNTA NEGRO (2,000 PZS)', 1, 1),

  ('Peppermint Mocha Matcha Latte', 0, 'Mix MATCHA GOURMET ORGÁNICO 1 KG', 36.046693, 36.046693),
  ('Peppermint Mocha Matcha Latte', 1, 'LECHE ENTERA', 170, 250),
  ('Peppermint Mocha Matcha Latte', 2, 'Mix AZUCAR MASCABADO USO BARRA + COCOA POWDER - EXTRA BRUTE 1 KG', 10, 10),
  ('Peppermint Mocha Matcha Latte', 3, 'JARABE DE MENTA 1 LT (3 PZAS)', 15, 15),
  ('Peppermint Mocha Matcha Latte', 4, 'VASO CALIENTE PAPEL KRAFT 8 OZ (500 PZS)', 1, null),
  ('Peppermint Mocha Matcha Latte', 5, 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', null, 1),
  ('Peppermint Mocha Matcha Latte', 6, 'TAPA CALIENTE 80MM (1,000 PZS)', 1, null),
  ('Peppermint Mocha Matcha Latte', 7, 'TAPA CALIENTE 90MM (1,000 PZS)', null, 1),

  ('Peppermint Mocha Iced Matcha', 0, 'Mix MATCHA GOURMET ORGÁNICO 1 KG', 36.046693, 45.021012),
  ('Peppermint Mocha Iced Matcha', 1, 'LECHE ENTERA', 170, 290),
  ('Peppermint Mocha Iced Matcha', 2, 'HIELO (g)', 130, 245),
  ('Peppermint Mocha Iced Matcha', 3, 'Mix AZUCAR MASCABADO USO BARRA + COCOA POWDER - EXTRA BRUTE 1 KG', 10, 10),
  ('Peppermint Mocha Iced Matcha', 4, 'JARABE DE MENTA 1 LT (3 PZAS)', 15, 15),
  ('Peppermint Mocha Iced Matcha', 5, 'VASO FRÍO PET 14 OZ (1,000 PZS)', 1, null),
  ('Peppermint Mocha Iced Matcha', 6, 'VASO FRÍO PET 20 OZ (1,000 PZS)', null, 1),
  ('Peppermint Mocha Iced Matcha', 7, 'TAPA FRIO PET (1,000 PZS)', 1, 1),
  ('Peppermint Mocha Iced Matcha', 8, 'POPOTE CON PUNTA NEGRO (2,000 PZS)', 1, 1);

-- Validaciones previas: nada existe ya, y cada componente, tamaño y categoría resuelve a exactamente uno.
do $$ begin
  if exists (select 1 from public.recetas r join pep_productos p on lower(r.nombre) = lower(p.nombre)) then
    raise exception 'Ya existe una receta Peppermint. Se revierte todo';
  end if;
  if exists (select 1 from public.producto_codigo_pos c join pep_productos p on c.codigo = p.codigo) then
    raise exception 'Un código POS de Peppermint ya está ligado. Se revierte todo';
  end if;
  if exists (select 1 from (select distinct componente from pep_lineas) l where
      (select count(*) from public.insumos i where i.nombre = l.componente and i.activo)
    + (select count(*) from public.recetas s where s.nombre = l.componente and s.tipo = 'subreceta' and s.activo) <> 1) then
    raise exception 'Un componente no existe, está inactivo o es ambiguo. Se revierte todo';
  end if;
  if (select count(*) from public.tamanos where nombre in ('Chica', 'Grande')) <> 2 then
    raise exception 'Faltan los tamaños Chica y Grande. Se revierte todo';
  end if;
  if (select count(*) from public.categorias_producto where nombre = 'Seasonal') <> 1 then
    raise exception 'Falta la categoría Seasonal. Se revierte todo';
  end if;
end $$;

-- Recetas
insert into public.recetas (nombre, tipo, categoria_id, activo)
select p.nombre, 'producto', (select id from public.categorias_producto where nombre = 'Seasonal'), true
from pep_productos p;

-- Tamaños con precio de lista
insert into public.producto_tamanos (producto_id, tamano_id, precio_lista)
select r.id, t.id, case t.nombre when 'Chica' then 99 else 109 end
from pep_productos p
join public.recetas r on r.nombre = p.nombre and r.tipo = 'producto'
cross join public.tamanos t
where t.nombre in ('Chica', 'Grande');

-- Líneas
insert into public.receta_lineas (receta_id, insumo_id, subreceta_id, orden)
select r.id,
  (select i.id from public.insumos i where i.nombre = l.componente and i.activo),
  (select s.id from public.recetas s where s.nombre = l.componente and s.tipo = 'subreceta' and s.activo),
  l.orden
from pep_lineas l
join public.recetas r on r.nombre = l.producto and r.tipo = 'producto';

-- Cantidades por tamaño
insert into public.linea_cantidades (linea_id, tamano_id, cantidad)
select rl.id, t.id, case t.nombre when 'Chica' then l.chica else l.grande end
from pep_lineas l
join public.recetas r on r.nombre = l.producto and r.tipo = 'producto'
join public.receta_lineas rl on rl.receta_id = r.id and rl.orden = l.orden
join public.tamanos t on t.nombre in ('Chica', 'Grande')
where case t.nombre when 'Chica' then l.chica else l.grande end is not null;

-- Códigos POS
insert into public.producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia, carga_id)
select p.codigo, r.id, p.nombre,
  'POS desde 2026-11-11/12 (Zoho «Looker Sucursales» y Productos_nuevos_Costeo_2026-11-17.xlsx) · receta por analogía, borrador',
  (select carga_id from pep_carga)
from pep_productos p
join public.recetas r on r.nombre = p.nombre and r.tipo = 'producto';

-- Comprobación: el costo de Costeo debe cuadrar con el del archivo (±0.01).
do $$ begin
  if exists (
    select 1 from pep_productos p
    join public.recetas r on r.nombre = p.nombre and r.tipo = 'producto'
    join public.v_costo_producto v on v.producto_id = r.id
    join public.tamanos t on t.id = v.tamano_id
    where abs(v.costo - case t.nombre when 'Chica' then p.chica else p.grande end) > 0.01
  ) then raise exception 'El costo no cuadra con el archivo. Se revierte todo'; end if;
  if (select count(*) from public.producto_codigo_pos c join pep_productos p on c.codigo = p.codigo) <> 4 then
    raise exception 'No se ligaron los 4 códigos POS. Se revierte todo';
  end if;
end $$;

select r.nombre, t.nombre as tamano, pt.precio_lista, round(v.costo, 2) as costo,
  round(v.costo / pt.precio_lista * 1.16 * 100, 1) as food_cost_pct, c.codigo
from pep_productos p
join public.recetas r on r.nombre = p.nombre and r.tipo = 'producto'
join public.producto_tamanos pt on pt.producto_id = r.id
join public.tamanos t on t.id = pt.tamano_id
join public.v_costo_producto v on v.producto_id = r.id and v.tamano_id = t.id
join public.producto_codigo_pos c on c.receta_id = r.id
order by r.nombre, t.nombre;

select carga_id as carga_id_para_revertir from pep_carga;

commit;
