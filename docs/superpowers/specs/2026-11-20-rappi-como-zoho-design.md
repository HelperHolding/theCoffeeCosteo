# Rappi del portal con la regla de Zoho

**Fecha:** 2026-11-20 · **Estado:** aprobado en conversación, pendiente de revisión escrita
**Antecedentes:** `lib/sucursales/rappi-pos.ts` (`pedidoRappiAPos`), `docs/rappi-portal/`, migración
`20261029000028_rappi_portal.sql`, `docs/sucursales/15-INTEGRACION-NACIONAL.md` §Lote 8.

## Objetivo

Que la venta de cada pedido de Rappi leído del portal sea la misma que cuenta Zoho: **el bruto de productos menos los
descuentos que paga la tienda, sin restar los premios Pro Rewards**. Hoy el portal cuenta el bruto
(`order_product_total_price`, antes de descuentos) y queda ~13 % arriba de Zoho en Rappi.

**Éxito:**
- Cotejo contra Zoho del Rappi por tienda (5-oct, 25-oct y 19-nov de 2026): total del día a ≤ 0.5 % y la mayoría de
  las tiendas al centavo.
- Una sola definición de la venta de Rappi en todo el portal: Ventas, pestaña Rappi, Costeo, BI y Franquiciatarios.
- Consumo no cambia (cuenta unidades).

## Evidencia (2026-11-20)

- **19-nov, pedido por pedido** (Interlomas, Cd. Juárez, Ávila Camacho), contra Zoho:
  - 21 de 24 pedidos cuadran al centavo con `bruto − descuento_aliado`;
  - cuando el descuento es un premio «Pro Rewards – Premio The Coffee» (`type_description = 'order_discount'`), Zoho
    no lo resta (p. ej. Interlomas 2489955636: bruto $416, premio $221.04, Zoho $416);
  - si el pedido trae una oferta y un premio, Zoho resta solo la oferta.
- **19-nov por tienda:** en las tiendas solo con ofertas, nuestro exceso contra Zoho es exactamente `descuento_aliado`
  (Andamar $189 / $188.40, Los Arcos $552 / $552.80…). La Mexicana y Nuevo León cuadran al quitar el premio.
- **5-oct, 62 tiendas:**
  - Zoho $110,556.60; regla nueva $110,879.60 (+0.29 %); bruto actual $124,987.00 (+13 %);
  - 48 tiendas cuadran al centavo; el resto, por pedidos que Zoho no tiene o los casos sueltos de abajo.
- **Casos sueltos que no se imitan:**
  - un pedido que Zoho no tiene (Interlomas 2490022737);
  - una oferta que Zoho resta dos veces porque el portal la repite en `descuentos` (Cd. Juárez 2489969507);
  - un pedido con premio que Zoho valora arriba del bruto (Ávila Camacho 2489934860).
- **Cobertura:**
  - la base tiene Rappi del portal desde el 2026-10-01 (`docs/rappi-portal/08-PLAN-HISTORICO.md`): la regla aplica
    a todo ese historial, sin fecha de corte;
  - pedidos sin detalle de descuento (`descuento_aliado` nulo): 1 en octubre, 77 en noviembre (recientes; el detalle
    llega después).

## Fuera de alcance

- El Rappi que llega por la API del POS (solo historial previo a octubre; desde el 2026-11-15 no cuenta).
- La función que guarda los pedidos del cron de n8n y la tabla `rappi_pedidos`: `bruto`, `descuento_aliado` y
  `descuentos` quedan como los da el portal.
- La carga histórica de Rappi previa a octubre de 2026 (doc 08): cuando se haga, la regla le aplica igual.
- Imitar los casos sueltos de Zoho.

## 1. La regla en la base (migración 90)

`supabase/migrations/20261120000090_rappi_descuento_venta.sql`, aplicada a mano por el usuario y registrada con
`insert into supabase_migrations.schema_migrations (version, name) values ('20261120000090','rappi_descuento_venta');`.

```sql
create function public.rappi_descuento_venta(p public.rappi_pedidos) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select least(p.bruto, greatest(coalesce(p.descuento_aliado, 0) - coalesce((
    select sum((d->>'value')::numeric)
    from jsonb_array_elements(case when jsonb_typeof(p.descuentos) = 'array' then p.descuentos else '[]'::jsonb end) d
    where d->>'type_description' = 'order_discount'), 0), 0))
$$;
```

- Recibe la fila de `rappi_pedidos`: PostgREST la expone como columna calculada con el nombre de la función, `rappi_descuento_venta`; el cliente la pide con el alias `descuento_venta:rappi_descuento_venta` y la fila trae `descuento_venta`. La migración termina con `notify pgrst, 'reload schema';`.
- **Sin detalle** (`descuento_aliado` nulo): 0, y la venta queda en el bruto, como hoy.
- **Premios Pro Rewards** (`order_discount`): nunca se restan. El resultado nunca es negativo ni mayor que el bruto.
- **Ofertas repetidas** en `descuentos`: se usa `descuento_aliado` (la suma que da el portal), no la suma del detalle.
- **Permisos:**
  - `revoke all … from public, anon, authenticated`; `grant execute … to service_role`, para la columna calculada
    del corte;
  - no es security definer. `sucursales_rappi_portal` sí lo es y la llama como dueña, así que los usuarios no
    necesitan permiso propio. `rappi_pedidos` sigue cerrada por RLS.
- **`sucursales_rappi_portal`:** se reemplaza con `create or replace` y la misma definición que hoy, más
  `'descuento_venta', public.rappi_descuento_venta(p)` en cada pedido. Hay que partir de la definición vigente en la
  base (la última migración que la toca), sin cambiar nada más.
- **Compatible con el código actual:** solo agrega una función y un campo.

## 2. Conversión y módulos

**`lib/sucursales/rappi-portal.ts`**
- `PedidoRappi` gana `descuento_venta?: number`. Opcional: si falta (base sin la 90), vale 0.
- `resumir…` (totales de la pestaña Rappi): `ventaCent` suma `cent(bruto − descuento_venta)`. Los cancelados siguen
  sumando su bruto.

**`lib/sucursales/rappi-pos.ts` · `pedidoRappiAPos`**
- `ventaCent = cent(bruto) − cent(descuento_venta)`, nunca menor que 0.
- **Reparto:** las líneas se arman como hoy (suman el bruto cuando el pedido cuadra). Luego cada `importeCent` de
  línea y de modificador se multiplica por `f = ventaCent ÷ cent(bruto)` y se redondea.
  - Si el pedido cuadraba (líneas = bruto), la última línea con importe > 0 absorbe el redondeo, y la suma da
    exactamente `ventaCent`.
  - Si no cuadraba, solo se escala cada importe y `cuadra` se calcula igual que hoy (suma = venta).
  - Con `descuento_venta = 0`, `f = 1` y nada cambia.
- `descuentoCent = cent(descuento_venta)`, antes `descuento_aliado`.
- Unidades, códigos, nombres, hora y fecha no cambian.

**`lib/sucursales/corte-servidor.ts` · `rappiServicio`**
- El `select` de `rappi_pedidos` agrega `descuento_venta:rappi_descuento_venta` (alias) y lo pasa a `pedidoRappiAPos`.

**`lib/sucursales/rappi-pos-servidor.ts` · `fuenteRappi`** y **Franquiciatarios**
- No cambian: leen `sucursales_rappi_portal`, que ya trae el campo, y pasan el pedido entero.

**Efecto esperado por módulo**

| Módulo | Efecto |
|---|---|
| Ventas (Sucursales) y pestaña Rappi | La venta de Rappi baja ~11 %, y su ticket promedio también. |
| Costeo | Margen de Rappi más bajo: la venta por producto ya no incluye las ofertas que pagó la tienda. |
| Consumo | Sin cambio. |
| BI | Rappi en Ventas Netas, mezcla, métodos RAPPI / RAPPI TURBO y ranking como en Zoho (±0.3 %). |
| Franquiciatarios | Igual que Ventas. |

## 3. Orden, recálculo y verificación

**Orden:**
1. El usuario aplica y registra la migración 90.
2. Merge del PR.
3. Recálculo.

Si se fusionara antes de la 90, `rappiServicio` pediría una columna que no existe: la lectura de Rappi fallaría y el
corte marcaría esos días como carga incompleta, sin escribir ceros. El orden evita eso.

**Recálculo:**
- Ventas, Costeo y Franquiciatarios leen en vivo: toman la regla al desplegarse.
- El BI (`bi_lineas`) y el resumen diario guardan cifras por día. Se re-cortan del 2026-10-01 a ayer; el comando lo
  corre el usuario porque escribe en la base:
  `npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2026-10-01 --hasta <ayer>`
  - Solo reescribe los días cuya huella cambia.
- **Pedidos sin detalle:** el corte diario (`/api/sucursales/corte?dias=8`, 11:30 UTC) re-corta los últimos 8 días.
  Cuando llega el detalle, el día se corrige solo.

**Verificación:**
- **Cotejo contra Zoho** del Rappi por tienda el 5-oct, el 25-oct y el 19-nov, con la tabla de consulta de Zoho
  (solo lectura, sin guardar):
  - total del día a ≤ 0.5 %;
  - mayoría de tiendas al centavo;
  - las diferencias que queden, explicadas.
- **Portal:**
  - la pestaña Rappi y Ventas de una sucursal muestran la cifra nueva;
  - Consumo de esa sucursal no cambia.
- **BI:** el 19-nov queda cerca de los $756,124 de Zoho.

## Pruebas

- **`tests/db/rappi-descuento-venta.test.ts` (PGlite):**
  - sin descuento → 0;
  - solo ofertas → `descuento_aliado`;
  - solo premio → 0;
  - premio + oferta → la oferta;
  - `descuento_aliado` nulo → 0;
  - ofertas repetidas en `descuentos` → `descuento_aliado`;
  - premio mayor que el descuento → 0, no negativo;
  - `descuentos` nulo o no arreglo → `descuento_aliado`;
  - `sucursales_rappi_portal` devuelve `descuento_venta` por pedido.
- **`tests/portal/rappi-pos.test.ts`:**
  - reparto exacto (suma = venta), última línea absorbe el redondeo;
  - pedido que no cuadraba solo se escala;
  - unidades iguales;
  - `descuento_venta` ausente → 0, idéntico a hoy;
  - `descuentoCent = descuento_venta`.
- **`tests/portal/rappi-portal.test.ts`:** totales de la pestaña con la venta nueva y cancelados con el bruto.
- **`tests/portal` del corte:** el `select` de `rappiServicio` pide `descuento_venta:rappi_descuento_venta`.
- Las demás pruebas de Sucursales, Costeo y BI siguen verdes, ajustando solo las que fijaban el bruto como venta de
  Rappi.

## Riesgos

1. **Merge antes de la migración:** lectura de Rappi fallida (días incompletos, nunca ceros). Mitigación: el orden y
   la nota en el PR.
2. **Zoho cambia su criterio:** el cotejo de 3 fechas lo detectaría. La regla vive en una sola función de SQL.
3. **Costeo:** el margen de Rappi baja de golpe en el historial desde octubre. Es esperado y se avisa al usuario.
4. **Reparto con líneas en 0** (modificadores sin precio): el redondeo lo absorbe la última línea con importe > 0.
