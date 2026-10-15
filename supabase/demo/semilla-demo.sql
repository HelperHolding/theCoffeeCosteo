-- Datos FICTICIOS solo para la demo local (supabase start). Nunca ejecutar en producción.
-- Uso: docker exec -i supabase_db_thecoffee-costeos psql -U postgres -d postgres < supabase/demo/semilla-demo.sql
-- Cuenta de demo local: demo@thecoffee.local / demo-local-2026 (rol admin).
begin;
set local app.origen = 'migracion';

do $$
begin
  if exists (select 1 from recetas) or exists (select 1 from auth.users) then
    raise exception 'La base ya tiene recetas o usuarios; la semilla de demo solo corre en una base local vacía.';
  end if;
end $$;

-- Cuenta local de demostración
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated',
  'authenticated', 'demo@thecoffee.local', crypt('demo-local-2026', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"demo@thecoffee.local"}', 'email', now(), now(), now());
insert into perfiles (user_id, nombre, rol) values ('11111111-1111-4111-8111-111111111111', 'Demo Local', 'admin');

insert into proveedores (nombre) values ('Tostadores del Bajío'), ('Lácteos Santa Clara'), ('Uji Matcha MX'),
  ('Empaques Verdes'), ('Panadería Central'), ('Abarrotes Premium');
insert into categorias_insumo (nombre) values ('Café'), ('Lácteos'), ('Polvos y jarabes'), ('Empaque'), ('Panadería'), ('Otros');
insert into categorias_producto (nombre, orden) values ('Espresso bar', 1), ('Lattes', 2), ('Matcha', 3),
  ('Cold brew', 4), ('Frappés', 5), ('Temporada', 6), ('Panadería', 7), ('Sandwiches', 8);

create temp table _i (nombre text, prov text, cat text, costo numeric, pres numeric, uni unidad, activo boolean default true) on commit drop;
insert into _i values
  ('Café grano espresso', 'Tostadores del Bajío', 'Café', 520, 1000, 'gr', true),
  ('Café grano cold brew', 'Tostadores del Bajío', 'Café', 430, 1000, 'gr', true),
  ('Leche entera', 'Lácteos Santa Clara', 'Lácteos', 27, 1000, 'ml', true),
  ('Leche de avena', 'Lácteos Santa Clara', 'Lácteos', 68, 946, 'ml', true),
  ('Leche de almendra', 'Lácteos Santa Clara', 'Lácteos', 74, 946, 'ml', false),
  ('Crema para batir', 'Lácteos Santa Clara', 'Lácteos', 92, 1000, 'ml', true),
  ('Matcha ceremonial', 'Uji Matcha MX', 'Polvos y jarabes', 980, 500, 'gr', true),
  ('Chocolate en polvo', 'Abarrotes Premium', 'Polvos y jarabes', 310, 1000, 'gr', true),
  ('Azúcar mascabado', 'Abarrotes Premium', 'Polvos y jarabes', 48, 1000, 'gr', true),
  ('Vainilla natural', 'Abarrotes Premium', 'Polvos y jarabes', 420, 500, 'ml', true),
  ('Especias pumpkin', 'Abarrotes Premium', 'Polvos y jarabes', 260, 250, 'gr', true),
  ('Base frappé neutra', 'Abarrotes Premium', 'Polvos y jarabes', 390, 1500, 'gr', true),
  ('Hielo', 'Abarrotes Premium', 'Otros', 38, 5000, 'gr', true),
  ('Agua filtrada', 'Abarrotes Premium', 'Otros', 18, 20000, 'ml', true),
  ('Vaso caliente 8 oz', 'Empaques Verdes', 'Empaque', 165, 100, 'pza', true),
  ('Vaso caliente 12 oz', 'Empaques Verdes', 'Empaque', 190, 100, 'pza', true),
  ('Vaso frío 16 oz', 'Empaques Verdes', 'Empaque', 210, 100, 'pza', true),
  ('Tapa', 'Empaques Verdes', 'Empaque', 85, 100, 'pza', true),
  ('Popote papel', 'Empaques Verdes', 'Empaque', 60, 200, 'pza', true),
  ('Croissant mantequilla', 'Panadería Central', 'Panadería', 19, 1, 'pza', true),
  ('Pan de masa madre', 'Panadería Central', 'Panadería', 46, 12, 'pza', true),
  ('Jamón serrano', 'Abarrotes Premium', 'Otros', 640, 1000, 'gr', true),
  ('Queso manchego', 'Abarrotes Premium', 'Otros', 360, 1000, 'gr', true),
  ('Aguacate', 'Abarrotes Premium', 'Otros', 72, 1000, 'gr', true),
  ('Galleta de chocolate', 'Panadería Central', 'Panadería', 14, 1, 'pza', true),
  ('Canela molida', 'Abarrotes Premium', 'Polvos y jarabes', 180, 500, 'gr', true);
insert into insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad, activo)
select _i.nombre, p.id, c.id, _i.costo, _i.pres, _i.uni, _i.activo
from _i join proveedores p on p.nombre = _i.prov join categorias_insumo c on c.nombre = _i.cat;

-- Sub-recetas
insert into recetas (nombre, tipo, rendimiento, unidad_rendimiento) values
  ('Concentrado cold brew', 'subreceta', 1800, 'ml'),
  ('Jarabe de vainilla', 'subreceta', 1000, 'ml'),
  ('Mezcla pumpkin spice', 'subreceta', 500, 'gr');

create temp table _sl (receta text, insumo text, cantidad numeric) on commit drop;
insert into _sl values
  ('Concentrado cold brew', 'Café grano cold brew', 250), ('Concentrado cold brew', 'Agua filtrada', 2000),
  ('Jarabe de vainilla', 'Azúcar mascabado', 600), ('Jarabe de vainilla', 'Vainilla natural', 40), ('Jarabe de vainilla', 'Agua filtrada', 600),
  ('Mezcla pumpkin spice', 'Especias pumpkin', 120), ('Mezcla pumpkin spice', 'Azúcar mascabado', 340), ('Mezcla pumpkin spice', 'Canela molida', 40);

with l as (
  insert into receta_lineas (receta_id, insumo_id, orden)
  select r.id, i.id, row_number() over () from _sl join recetas r on r.nombre = _sl.receta join insumos i on i.nombre = _sl.insumo
  returning id, receta_id, insumo_id
)
insert into linea_cantidades (linea_id, tamano_id, cantidad)
select l.id, null, _sl.cantidad from l join recetas r on r.id = l.receta_id join insumos i on i.id = l.insumo_id
join _sl on _sl.receta = r.nombre and _sl.insumo = i.nombre;

-- Productos: nombre, categoría, precio chica, precio grande, precio único (null = sin precio)
create temp table _p (nombre text, cat text, chica numeric, grande numeric, unico numeric, tamanos text) on commit drop;
insert into _p values
  ('Espresso', 'Espresso bar', null, null, 45, 'U'),
  ('Americano', 'Espresso bar', 52, 62, null, 'CG'),
  ('Cortado', 'Espresso bar', null, null, 58, 'U'),
  ('Flat white', 'Lattes', null, null, 72, 'U'),
  ('Latte', 'Lattes', 68, 79, null, 'CG'),
  ('Latte de vainilla', 'Lattes', 76, 88, null, 'CG'),
  ('Latte de avena', 'Lattes', 78, 90, null, 'CG'),
  ('Mocha', 'Lattes', 79, 92, null, 'CG'),
  ('Capuchino', 'Lattes', 66, 76, null, 'CG'),
  ('Matcha latte', 'Matcha', 82, 96, null, 'CG'),
  ('Iced matcha', 'Matcha', null, 98, null, 'G'),
  ('Matcha espresso fusion', 'Matcha', null, null, null, 'U'),
  ('Cold brew', 'Cold brew', 62, 74, null, 'CG'),
  ('Cold brew vainilla cream', 'Cold brew', 74, 86, null, 'CG'),
  ('Frappé de café', 'Frappés', null, 89, null, 'G'),
  ('Frappé mocha', 'Frappés', null, 95, null, 'G'),
  ('Frappé matcha', 'Frappés', null, null, null, 'G'),
  ('Pumpkin spice latte', 'Temporada', 86, 99, null, 'CG'),
  ('Iced pumpkin cold brew', 'Temporada', null, 99, null, 'G'),
  ('Croissant', 'Panadería', null, null, 49, 'U'),
  ('Galleta de chocolate', 'Panadería', null, null, 32, 'U'),
  ('Sandwich serrano', 'Sandwiches', null, null, 129, 'U'),
  ('Toast de aguacate', 'Sandwiches', null, null, 99, 'U'),
  ('Croissant jamón y queso', 'Sandwiches', null, null, 89, 'U');

insert into recetas (nombre, tipo, categoria_id)
select _p.nombre, 'producto', c.id from _p join categorias_producto c on c.nombre = _p.cat;

insert into producto_tamanos (producto_id, tamano_id, precio_lista)
select r.id, t.id, case t.nombre when 'Chica' then _p.chica when 'Grande' then _p.grande else _p.unico end
from _p join recetas r on r.nombre = _p.nombre
join tamanos t on (t.nombre = 'Único' and _p.tamanos = 'U') or (t.nombre = 'Chica' and _p.tamanos = 'CG')
  or (t.nombre = 'Grande' and _p.tamanos in ('CG', 'G'));

-- Líneas de producto: producto, componente, cantidad chica, grande, único
create temp table _pl (prod text, comp text, chica numeric, grande numeric, unico numeric) on commit drop;
insert into _pl values
  ('Espresso', 'Café grano espresso', null, null, 18), ('Espresso', 'Vaso caliente 8 oz', null, null, 1),
  ('Americano', 'Café grano espresso', 18, 27, null), ('Americano', 'Agua filtrada', 200, 300, null),
  ('Americano', 'Vaso caliente 12 oz', 1, 1, null), ('Americano', 'Tapa', 1, 1, null),
  ('Cortado', 'Café grano espresso', null, null, 18), ('Cortado', 'Leche entera', null, null, 60), ('Cortado', 'Vaso caliente 8 oz', null, null, 1),
  ('Flat white', 'Café grano espresso', null, null, 27), ('Flat white', 'Leche entera', null, null, 150), ('Flat white', 'Vaso caliente 8 oz', null, null, 1),
  ('Latte', 'Café grano espresso', 18, 27, null), ('Latte', 'Leche entera', 220, 320, null), ('Latte', 'Vaso caliente 12 oz', 1, 1, null), ('Latte', 'Tapa', 1, 1, null),
  ('Latte de vainilla', 'Café grano espresso', 18, 27, null), ('Latte de vainilla', 'Leche entera', 200, 290, null),
  ('Latte de vainilla', 'Jarabe de vainilla', 25, 35, null), ('Latte de vainilla', 'Vaso caliente 12 oz', 1, 1, null), ('Latte de vainilla', 'Tapa', 1, 1, null),
  ('Latte de avena', 'Café grano espresso', 18, 27, null), ('Latte de avena', 'Leche de avena', 220, 320, null),
  ('Latte de avena', 'Vaso caliente 12 oz', 1, 1, null), ('Latte de avena', 'Tapa', 1, 1, null),
  ('Mocha', 'Café grano espresso', 18, 27, null), ('Mocha', 'Leche entera', 200, 290, null), ('Mocha', 'Chocolate en polvo', 25, 35, null),
  ('Mocha', 'Crema para batir', 20, 30, null), ('Mocha', 'Vaso caliente 12 oz', 1, 1, null), ('Mocha', 'Tapa', 1, 1, null),
  ('Capuchino', 'Café grano espresso', 18, 27, null), ('Capuchino', 'Leche entera', 180, 260, null), ('Capuchino', 'Canela molida', 1, 1, null),
  ('Capuchino', 'Vaso caliente 12 oz', 1, 1, null), ('Capuchino', 'Tapa', 1, 1, null),
  ('Matcha latte', 'Matcha ceremonial', 4, 6, null), ('Matcha latte', 'Leche entera', 220, 320, null),
  ('Matcha latte', 'Vaso caliente 12 oz', 1, 1, null), ('Matcha latte', 'Tapa', 1, 1, null),
  ('Iced matcha', 'Matcha ceremonial', null, 6, null), ('Iced matcha', 'Leche de avena', null, 250, null), ('Iced matcha', 'Hielo', null, 150, null),
  ('Iced matcha', 'Vaso frío 16 oz', null, 1, null), ('Iced matcha', 'Popote papel', null, 1, null),
  ('Matcha espresso fusion', 'Matcha ceremonial', null, null, 5), ('Matcha espresso fusion', 'Café grano espresso', null, null, 18),
  ('Matcha espresso fusion', 'Leche de almendra', null, null, 220), ('Matcha espresso fusion', 'Vaso frío 16 oz', null, null, 1),
  ('Cold brew', 'Concentrado cold brew', 180, 260, null), ('Cold brew', 'Hielo', 120, 160, null), ('Cold brew', 'Vaso frío 16 oz', 1, 1, null), ('Cold brew', 'Popote papel', 1, 1, null),
  ('Cold brew vainilla cream', 'Concentrado cold brew', 160, 230, null), ('Cold brew vainilla cream', 'Jarabe de vainilla', 25, 35, null),
  ('Cold brew vainilla cream', 'Crema para batir', 40, 60, null), ('Cold brew vainilla cream', 'Hielo', 120, 160, null),
  ('Cold brew vainilla cream', 'Vaso frío 16 oz', 1, 1, null), ('Cold brew vainilla cream', 'Popote papel', 1, 1, null),
  ('Frappé de café', 'Café grano espresso', null, 27, null), ('Frappé de café', 'Base frappé neutra', null, 60, null),
  ('Frappé de café', 'Leche entera', null, 180, null), ('Frappé de café', 'Hielo', null, 220, null), ('Frappé de café', 'Crema para batir', null, 40, null),
  ('Frappé de café', 'Vaso frío 16 oz', null, 1, null), ('Frappé de café', 'Popote papel', null, 1, null),
  ('Frappé mocha', 'Café grano espresso', null, 27, null), ('Frappé mocha', 'Base frappé neutra', null, 60, null), ('Frappé mocha', 'Chocolate en polvo', null, 40, null),
  ('Frappé mocha', 'Leche entera', null, 180, null), ('Frappé mocha', 'Hielo', null, 220, null), ('Frappé mocha', 'Crema para batir', null, 50, null),
  ('Frappé mocha', 'Vaso frío 16 oz', null, 1, null), ('Frappé mocha', 'Popote papel', null, 1, null),
  ('Frappé matcha', 'Matcha ceremonial', null, 8, null), ('Frappé matcha', 'Base frappé neutra', null, 60, null), ('Frappé matcha', 'Leche entera', null, 200, null),
  ('Frappé matcha', 'Hielo', null, 220, null), ('Frappé matcha', 'Vaso frío 16 oz', null, 1, null),
  ('Pumpkin spice latte', 'Café grano espresso', 18, 27, null), ('Pumpkin spice latte', 'Leche entera', 200, 290, null),
  ('Pumpkin spice latte', 'Mezcla pumpkin spice', 18, 26, null), ('Pumpkin spice latte', 'Crema para batir', 30, 45, null),
  ('Pumpkin spice latte', 'Vaso caliente 12 oz', 1, 1, null), ('Pumpkin spice latte', 'Tapa', 1, 1, null),
  ('Iced pumpkin cold brew', 'Concentrado cold brew', null, 230, null), ('Iced pumpkin cold brew', 'Mezcla pumpkin spice', null, 26, null),
  ('Iced pumpkin cold brew', 'Crema para batir', null, 70, null), ('Iced pumpkin cold brew', 'Hielo', null, 150, null), ('Iced pumpkin cold brew', 'Vaso frío 16 oz', null, 1, null),
  ('Croissant', 'Croissant mantequilla', null, null, 1),
  ('Galleta de chocolate', 'Galleta de chocolate', null, null, 1),
  ('Sandwich serrano', 'Pan de masa madre', null, null, 2), ('Sandwich serrano', 'Jamón serrano', null, null, 60), ('Sandwich serrano', 'Queso manchego', null, null, 40),
  ('Toast de aguacate', 'Pan de masa madre', null, null, 2), ('Toast de aguacate', 'Aguacate', null, null, 140), ('Toast de aguacate', 'Queso manchego', null, null, 15),
  ('Croissant jamón y queso', 'Croissant mantequilla', null, null, 1), ('Croissant jamón y queso', 'Jamón serrano', null, null, 40), ('Croissant jamón y queso', 'Queso manchego', null, null, 30);

create temp table _lin on commit drop as
select gen_random_uuid() as id, _pl.*, r.id as receta_id, i.id as insumo_id, s.id as subreceta_id,
  row_number() over (partition by _pl.prod) as orden
from _pl join recetas r on r.nombre = _pl.prod and r.tipo = 'producto'
left join insumos i on i.nombre = _pl.comp
left join recetas s on s.nombre = _pl.comp and s.tipo = 'subreceta';

insert into receta_lineas (id, receta_id, insumo_id, subreceta_id, orden)
select id, receta_id, insumo_id, subreceta_id, orden from _lin;

insert into linea_cantidades (linea_id, tamano_id, cantidad)
select _lin.id, t.id, case t.nombre when 'Chica' then _lin.chica when 'Grande' then _lin.grande else _lin.unico end
from _lin join producto_tamanos pt on pt.producto_id = _lin.receta_id join tamanos t on t.id = pt.tamano_id
where case t.nombre when 'Chica' then _lin.chica when 'Grande' then _lin.grande else _lin.unico end is not null;

-- Un precio manual de delivery para mostrar el caso "Manual"
insert into precio_canal_manual (producto_id, tamano_id, canal_id, precio, nota)
select r.id, t.id, c.id, 105, 'Precio fijado por promoción en Rappi'
from recetas r, tamanos t, canales c
where r.nombre = 'Latte' and t.nombre = 'Grande' and c.nombre = 'Rappi';

commit;
