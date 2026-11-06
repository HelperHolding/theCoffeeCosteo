# BI 03 · Tablero «The Coffee México» (F4)

Fecha: 2026-11-05. Tercera entrega del BI (contratos en `docs/bi/01-BASE.md`, carga en `docs/bi/02-CARGA.md`). F4 pone
la **pantalla**: el tablero que reemplaza al de Zoho Analytics, con los 17 filtros y 8 bloques. Todavía no hay Rappi de
Zoho (F3), margen del ranking (F4.1) ni metas y P.E. (F5).

## Qué es

- **Ruta:** `/bi/the-coffee-mexico` (grupo `app/(bi)/bi`). Lee dos rutas de API:
  - `/api/bi/tablero`: cifras del periodo y opciones de los filtros (`bi_tablero` y `bi_opciones`);
  - `/api/bi/tendencias`: tendencias anual y semanal. Ignoran fechas y semanas, como en Zoho.
- **Permiso:** módulo `bi` (nivel `lectura`) más las sucursales de `perfil_sucursales`. Sin el módulo, no hay datos.
- **Filtros en la URL.** Todo filtro vive en la URL (se puede compartir). Vacío = sin filtro. Lo lee `lib/bi/url.ts`.

| Filtro | Parámetro | Valores |
|---|---|---|
| Fecha Relativa | `fr` | Clave de la etiqueta en minúsculas, sin acentos y con guiones (`esta-semana`, `ultimas-4-semanas`). Por omisión `esta-semana` |
| Rango de fechas | `desde`, `hasta` | `AAAA-MM-DD`. Con las dos presentes mandan sobre `fr` |
| Comparable | `comp` | `si` o `no`; sin parámetro = Todas |
| Años Operando | `anios` | Enteros de 0 a 99, separados por coma |
| Día de la Semana | `dias` | Enteros de 0 a 6 |
| Nombre de Tienda | `tiendas` | `company_id` separados por coma |
| Franquiciatario | `franq` | Textos |
| Franquicia o Sucursales Propias | `tipo` | Textos |
| Categoría Master Franchise MX | `cat` | Textos |
| Comida, Bebida, Combo y Merch | `grupo` | Textos |
| Contiene Café | `cafe` | `si` o `no` |
| Product | `prod` | Nombres de producto |
| Método de Pago | `pago` | Etiquetas de pago |
| Hora | `hora` | Enteros de 0 a 23 |
| Estatus de Maduración | `mad` | Textos |
| Monto | `min`, `max` | Números ≥ 0 (pesos) |
| Semanas y año | `sem` | Textos |

- **Comas en los nombres.** Cada valor de una lista viaja escapado (`encodeURIComponent`), así un producto con comas en
  el nombre no se parte en dos. La lectura es tolerante: un `%` suelto se conserva tal cual.
- **Periodo inválido.** Si `desde` y `hasta` están las dos pero no son fechas reales, o `desde` es posterior a `hasta`,
  la pantalla muestra «El periodo no es válido.» y **no cae a «Esta semana»**. El máximo es de 1,100 días.
- **Comparable** ofrece «Todas / Comparable / No Comparable».
- **Actualizar** vuelve a leer los datos con los mismos filtros (sin recargar la página).

## Bloques

1. Números clave (venta neta, tickets, ticket promedio y demás).
2. Contra P.E. y meta (pendiente de F5).
3. Mezcla de venta: Comida/Bebida/Combo/Merch, con y sin café, categoría Master.
4. KPI Venta The Coffee, por tienda.
5. Promociones, contra su meta.
6. Tiempo y pago: ventas vs transacciones por día, día de la semana, hora, método de pago y pago por tienda.
7. Ranking de productos, por mes (el margen llega en F4.1).
8. Tendencias anual y semanal.

## Aplicar la migración 43

La integración de Supabase no aplica migraciones al fusionar. Se aplica a mano en el SQL Editor **y se registra** en el
mismo paso. **Solo con OK de Sebastián.**

1. Pegar y ejecutar `supabase/migrations/20261106000043_bi_tablero.sql`. Hace esto:
   - agrega el módulo `bi`;
   - crea `bi_acceso` (módulo `bi` + sucursal asignada + perfil activo) y `bi_opciones`;
   - hace que `bi_tiendas_filtradas` use `bi_acceso`;
   - etiqueta el pago por fecha: `WALLET` hasta el 2026-02-28 y `APP - WALLET` desde el 2026-03-01;
   - agrega `por_fecha` a `bi_tablero`.
2. Registrarla:

   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values ('20261106000043','bi_tablero');
   ```

La etiqueta de pago por fecha **resuelve el pendiente** del doc 02 (`lib/bi/cotejo.ts` ya la resuelve por fecha).

## Dar el permiso `bi`

A quienes ya tienen el módulo Sucursales con rol admin. **Revisar antes de correr** (cambia permisos):

```sql
insert into public.perfil_modulos (user_id, modulo, nivel)
select m.user_id, 'bi', 'lectura' from public.perfil_modulos m
join public.perfiles p on p.user_id = m.user_id
where m.modulo = 'sucursales' and p.rol = 'admin' and p.activo
on conflict do nothing;
```

Para una persona: `insert … values ('<user_id>', 'bi', 'lectura')`. Sus sucursales son las de `perfil_sucursales`.

## Medición de rendimiento

El SQL Editor corre como `postgres`, sin JWT: `auth.uid()` es nulo, `bi_acceso` da falso y `bi_tablero` regresa vacío al
instante. **Esa medición no mide nada** y daría un falso «cumple» de los 3 s. Hay que medir como un usuario real, dentro
de una transacción que se deshace. En el SQL Editor, una prueba por vez:

```sql
begin;
-- La lista de tiendas se arma ANTES del cambio de rol: authenticated no puede leer bi_tiendas.
select set_config('app.cias', (select jsonb_agg(company_id)::text from public.bi_tiendas), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user_id de un admin con bi>","role":"authenticated"}', true);
explain (analyze, buffers) select public.bi_tablero(jsonb_build_object(
  'desde', '2026-01-01', 'hasta', current_date, 'companias', current_setting('app.cias')::jsonb));
rollback;
```

```sql
begin;
select set_config('app.cias', (select jsonb_agg(company_id)::text from public.bi_tiendas), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user_id de un admin con bi>","role":"authenticated"}', true);
explain (analyze, buffers) select public.bi_tendencias(jsonb_build_object(
  'companias', current_setting('app.cias')::jsonb));
rollback;
```

```sql
begin;
select set_config('app.cias', (select jsonb_agg(company_id)::text from public.bi_tiendas), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user_id de un admin con bi>","role":"authenticated"}', true);
explain (analyze, buffers) select public.bi_opciones(jsonb_build_object(
  'desde', '2026-01-01', 'hasta', current_date, 'companias', current_setting('app.cias')::jsonb));
rollback;
```

- Reemplaza `<user_id de un admin con bi>` por el `user_id` (uuid de `auth.users`) de un admin con módulo `bi` y las
  sucursales asignadas en `perfil_sucursales`; `bi_acceso` filtra por ellas.
- **Advertencia:** si faltan los claims, o el usuario no tiene `bi`, el resultado sale vacío (`null`/sin tiendas) y no
  mide nada. Antes de fiarte del tiempo, corre el mismo `select` sin `explain` y confirma que trae cifras.
- `rollback` al final deja la sesión como estaba; no cambia datos.

| Prueba | Tiempo |
|---|---|
| `bi_tablero` 2026-01-01 → hoy, 79 tiendas | _por medir_ |
| `bi_tendencias` con la historia completa | _por medir_ |

**Regla:** más de 3 s → índices; si no basta, el resumen diario (migración 44).

## Cotejo en pantalla

En el piloto (tiendas 301, 432, 455, 477, 482 y 498), con tienda + semana + pago fijos, comparar las cifras de la
pantalla contra Zoho. Tolerancia como en el doc 02.

## Diferencias conocidas

- **Rappi de Zoho** pendiente (F3): el Rappi de la historia aún no está.
- **Margen del ranking** en F4.1.
- **Metas y P.E.** en F5.
- **Hora 0 inflada en Zoho:** el BI no la replica.
