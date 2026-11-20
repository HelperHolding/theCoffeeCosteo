# 09 · Venta de Rappi como Zoho

Fecha: 2026-11-20. Spec: `docs/superpowers/specs/2026-11-20-rappi-como-zoho-design.md`.

## La regla

La venta de cada pedido de Rappi leído del portal es la que cuenta Zoho: **el bruto de productos menos los descuentos
que paga la tienda, sin restar los premios Pro Rewards**. Antes se contaba el bruto (`order_product_total_price`,
antes de descuentos) y quedaba ~13 % arriba de Zoho.

`venta = bruto − descuento_venta`, con `descuento_venta` calculado en la base (migración 90,
`rappi_descuento_venta(p rappi_pedidos)`). PostgREST la expone como columna calculada `rappi_descuento_venta`; el
corte la pide con el alias `descuento_venta:rappi_descuento_venta`. La migración termina con
`notify pgrst, 'reload schema';` para que se vea al aplicarla:

- Sin detalle (`descuento_aliado` nulo): 0, y la venta queda en el bruto.
- Los premios Pro Rewards (`type_description = 'order_discount'`) nunca se restan; un premio con `value` vacío o no
  numérico se ignora.
- Se usa `descuento_aliado` (la suma del portal), no la suma del detalle, para no duplicar ofertas repetidas.
- Nunca es negativo ni mayor que el bruto.

## Por qué (evidencia del 2026-11-20)

- **19-nov, pedido por pedido** (Interlomas, Cd. Juárez, Ávila Camacho): 21 de 24 pedidos cuadran al centavo con
  `bruto − descuento_aliado`. Cuando el descuento es un premio Pro Rewards, Zoho no lo resta; si el pedido trae oferta
  y premio, resta solo la oferta.
- **5-oct, 62 tiendas:** Zoho $110,556.60; regla nueva $110,879.60 (+0.29 %); bruto anterior $124,987.00 (+13 %).
  48 tiendas cuadran al centavo.

## Orden de entrada

1. Aplicar y registrar la migración 90 (`supabase/migrations/20261120000090_rappi_descuento_venta.sql`):
   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values ('20261120000090','rappi_descuento_venta');
   ```
2. Merge del PR.
3. Recálculo, **corrido desde el código ya fusionado** (con la 90 aplicada): el comando usa el `select` con el alias.

Si se fusiona antes de la 90, `rappiServicio` pide una columna que no existe: la lectura de Rappi falla y el corte
marca esos días como carga incompleta, sin escribir ceros.

## Recálculo

Ventas, Costeo y Franquiciatarios leen en vivo y toman la regla al desplegarse. El BI (`bi_lineas`) y el resumen
diario guardan cifras por día; se re-cortan con (escribe en la base; lo corre el usuario):

```
npx.cmd tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2026-10-01 --hasta <ayer>
```

Solo reescribe los días cuya huella cambia. El corte diario re-corta los últimos 8 días, así que los pedidos que
lleguen sin detalle se corrigen solos cuando llega.

## Verificación

- Cotejo contra Zoho del Rappi por tienda el 5-oct, 25-oct y 19-nov (tabla de consulta de Zoho, solo lectura): total
  del día a ≤ 0.5 %, mayoría de tiendas al centavo, diferencias explicadas.
- Pestaña Rappi y Ventas de una sucursal muestran la cifra nueva.
- Consumo de esa sucursal no cambia.
- BI del 19-nov cerca de $756,124.

## Casos sueltos de Zoho que no se imitan

- Un pedido que Zoho no tiene (Interlomas 2490022737).
- Una oferta que Zoho resta dos veces porque el portal la repite en `descuentos` (Cd. Juárez 2489969507).
- Un pedido con premio que Zoho valora arriba del bruto (Ávila Camacho 2489934860).
