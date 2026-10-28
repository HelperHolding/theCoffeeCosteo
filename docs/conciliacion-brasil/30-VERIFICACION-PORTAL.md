# 30 · Verificación del portal contra la API de Brasil (antes de Zoho)

**Estado:** verificación de solo lectura, 2026-10-27. Sin escrituras en la base ni en la API. **No se consultó Zoho.**

- **Periodo:** 4 semanas cerradas, del lunes 28 de septiembre al domingo 25 de octubre de 2026.
- **Sucursales:** Cd. Juárez (612), 583 y Rubén Darío (532).
- **Fuente:** API de Brasil, 17 llamadas GET; las 12 semanas completas y 0 registros inválidos.
  - 5,319 pedidos y 9,982 líneas.
  - Venta total: **$990,201.10**. Por sucursal: 612 $588,962.05, 532 $214,278.55 y 583 $186,960.50.
- **Script:** `scripts/conciliacion/verificacion-portal.ts`.
- **Detalle por código:** `30-verificacion-portal.csv`, con 95 códigos ordenados por venta.

## 1. Resumen (ponderado por venta)

| Nivel | Venta | % |
|---|---|---|
| Código del POS **enlazado** a una receta activa de Costeo | $899,216 | **90.8 %** |
| + receta **validada contra el PDF oficial** (con o sin supuestos documentados) | $720,416 | **72.8 %** |
| + costo calculado, sin insumos inactivos ni costos señalados como dudosos | $711,551 | **71.9 %** |

**Respuesta corta:**
- Catálogo y recetario están bien para la mayor parte de la venta.
- Los costos están calculados, pero siguen **provisionales**.
- Los precios de Costeo son los de **Rubén Darío (532)**. Para 583 y 612 la referencia correcta es el POS, no Costeo.

## 2. Catálogo (POS ↔ Costeo)

| Clase | Códigos | Venta | % |
|---|---|---|---|
| Enlazado | 72 | $899,216 | 90.8 % |
| Sin enlace | 22 | $70,083 | 7.1 % |
| Generic (Rappi, 532) | 1 | $20,902 | 2.1 % |

- **Los 72 enlaces tienen ventas** en el periodo.
- **Sin enlace, los de mayor venta:**
  - Gelato Frappé Coffee $11,447;
  - Iced Latte + Ham & Cheese Sandwich $11,210;
  - Pan de Muerto $9,479;
  - Fresh Soda Pink Lemonade $5,492;
  - Cookie Matcha & White Chocolate $4,704;
  - True White + Croissant Serrano & Gouda $3,947;
  - Focaccia Serrano Ham $3,421;
  - Fresh Soda Passion fruit $3,278;
  - Espresso Tonic $2,790;
  - Brownie with ice cream $2,461.
  - El resto, en el CSV. Son combos, temporada, Zoé, V60 y Fresh Sodas, que corresponden a las decisiones pendientes del doc 27 §1.
- **Productos de Costeo sin ventas:** 82 productos activos no se vendieron en estas 3 sucursales durante el periodo. Pueden ser duplicados, registros antiguos o productos de otras tiendas. No es un error por sí mismo, pero conviene depurarlos antes de cotejar con Zoho.

## 3. Recetario (frente al PDF oficial, con las cantidades de HOY)

La matriz del doc 21 se recalculó contra la base actual:
- Si la cantidad es la auditada en el doc 21, se mantiene su calificación.
- Si cambió después, por los lotes aplicados, se recalifica con una tolerancia del 1 %.
- Las líneas que H2 pasó de `HIELO` a `HIELO (g)` se comparan como el mismo componente.

| Estado (sobre códigos enlazados) | Códigos | Venta | % del total |
|---|---|---|---|
| Validada | 10 | $231,422 | 23.4 % |
| Validada con supuestos documentados (conversiones, rendimientos, hielo en g) | 30 | $488,994 | 49.4 % |
| Validada parcialmente (sin cantidad comparable en el PDF) | 3 | $52,691 | 5.3 % |
| Con discrepancias | 1 | $10,448 | 1.1 % |
| Sin ficha en el PDF | 28 | $115,661 | 11.7 % |

- **Lotes aplicados que ya cuentan:**
  - lote 1 (Pumpkin Spice Frap: leche 35/70 y creamer 50);
  - lote 2 (Cold brew café 20 g y Urban Chocolate sin vainilla);
  - 3b (agua de Cold brew);
  - H2;
  - el lote del PDF (Fresh Sodas, hielo de Cold brew y agua de Iced Chocolate).
- **Con discrepancias:** **Açaí Bowl**. La ficha p.78 tiene la composición de Acai Cup (pregunta P7).
- **Validadas parcialmente:** los 3 sándwiches con brioche. El PDF no da rebanadas por trenza, ni peso del tomate cherry, orégano o sal (P8 y P9).
- **Sin ficha en el PDF:** repostería y productos comprados, como Pain au Chocolat, Banana Cake, Kouign Amann, Cinnamon Roll, Brownie, cookies, cakes, Croissant y bolsas de café. Su receta en Costeo es sobre todo el costo de compra y no se puede validar contra el recetario.

## 4. Tamaños

- De las 9,143 líneas enlazadas, **382 (4.2 %)** no tienen un tamaño verificado para su receta:
  - Iced Blueberry Matcha (69) y Matcha Iced Mint (56): tamaños sin verificar (E1).
  - Bebidas con tamaño que llegaron **sin vaso**, sobre todo de Rappi y la App. Por ejemplo Pumpkin Iced Latte (53), Pumpkin Latte (41), Americano (29) y Gelato Frappé Matcha (27).

## 5. Costos

- **Los 72 productos enlazados tienen costo calculado** para cada tamaño vendido y verificado. Ninguno usa insumos inactivos.
- **Ningún insumo tiene costo $0 fuera de los ya conocidos.** Los únicos a $0 son `AGUA`, `HIELO` y `HIELO (g)`, que aparecen en 25 recetas enlazadas (47.0 % de la venta). Es un supuesto, no un costo confirmado (doc 22, pregunta 7).
- **Costo dudoso:** Croissant Serrano & Gouda ($8,865 de venta) usa «JAMON SERRANO 100G TGM» (pregunta K3).
- **Provisional para todos:**
  - si los costos de insumos incluyen IVA (pregunta I1, doc 29);
  - las personalizaciones no tienen costo, y el **79.1 %** de las líneas enlazadas lleva al menos una (I2).

## 6. Precios: lista de Costeo frente a lo cobrado en el POS

Se usaron líneas sin descuento, con el precio de lista más el cargo de tamaño, y el precio más frecuente por sucursal, canal y tamaño.

| Sucursal y canal | Iguales | Distintos | Diferencia típica (POS − Costeo) |
|---|---|---|---|
| 532 tienda | **86** | 0 | — |
| 532 Rappi (precio castigado de Costeo) | 37 | 5 | ver abajo |
| 583 tienda | 6 | 87 | mediana **+$12**; POS más caro en 85 de 87 |
| 612 tienda | 8 | 86 | mediana **+$12**; POS más caro en 84 de 86 |

- **La lista de Costeo es la de Rubén Darío (532).** 583 y 612 tienen su propia lista, más cara, y Costeo no la tiene. Para cotejar precios de esas sucursales, la referencia es el POS.
- **Rappi 532, las 5 diferencias (POS / Costeo):**
  - True White Chica $87 / $85;
  - True White Grande $99 / $87;
  - Pumpkin Iced Latte Chica $110 / $123;
  - Grilled Ham Cheese and Tomato $135 / $130;
  - Grilled Cheese $99 / $97.
- Costeo tiene la comisión de Rappi en **18 %** (confirmada en Costeo).

## 7. Qué usar como referencia para el cotejo con Zoho

| Dato | Referencia confiable hoy | Con reserva |
|---|---|---|
| Productos y códigos | Portal: 72 enlaces, el 90.8 % de la venta | 22 códigos sin enlace y Generic |
| Recetas | Portal: 72.8 % de la venta validada contra el PDF | 11.7 % sin ficha; Açaí y sándwiches |
| Costos | Portal, como **costo actual provisional** | IVA de insumos, hielo y agua $0, personalizaciones, jamón serrano |
| Precios | **532:** Costeo = POS. **583 y 612:** el POS | Costeo no tiene la lista de 583 y 612; 5 diferencias de Rappi 532 |
| Ventas | API de Brasil (ver docs/sucursales) | Generic sin identificar; el «neto» de Rappi sin definición |

## 8. Cómo repetir la verificación

```
NODE_OPTIONS=--conditions=react-server npx tsx scripts/conciliacion/extraer-brasil.ts 612 583 532 --semanas 4
NODE_OPTIONS=--conditions=react-server npx tsx scripts/conciliacion/verificacion-portal.ts <lunes> <domingo> docs/conciliacion-brasil/30-verificacion-portal.csv 612 583 532
```

- Ambos comandos solo leen. Los crudos de la API quedan fuera del repo.
- `--conditions=react-server` permite cargar `lib/sucursales/proveedor.ts`, que es `server-only`, desde la terminal.
