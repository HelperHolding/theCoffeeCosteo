# Notas de reunión — Correcciones de gráficas de Analytics

**Fecha:** 2026-11-17
**Tablero:** Zoho Analytics → espacio «The Coffee Oficial» → **Dashboard The Coffee México**
**Tema:** Revisión de gráficas del tablero

> Revisión del 17-nov: primero en la vista pública (moviendo filtros) y después con sesión, leyendo las definiciones de
> los widgets, las tablas de consulta y las fórmulas. No se guardó ni se cambió nada en Zoho. Las causas están en
> «Causas encontradas»; los pendientes conservan lo que se vio en el dashboard.

## Causas encontradas (revisión con sesión, 17-nov)

Solo se leyeron definiciones; no se guardó nada en Zoho. Al abrir el editor de un widget, el dashboard quedó con
«Guardar» pendiente; **no hay que guardarlo** (descartar o recargar).

### Metas — tabla de consulta «Meta de Venta por Día de la semana»
Los widgets de meta salen de esta tabla, no de «Looker Sucursales».
- **Meta diaria por tienda:** meta mensual ÷ peso del mes × factor del día de la semana. El peso del mes es la suma de
  los factores de los días abiertos. Se toma de «Metas Mensuales 2026 (Ventas Tickets TP)» y de «Factores Por Día de
  la Semana». Los días antes de la apertura tienen meta 0.
- **VentaActual** se suma por tienda y día desde «Looker Sucursales» **dentro del SQL**. Por eso los filtros de
  categoría, producto, método de pago, etc. no le llegan: la venta de la meta siempre es la venta total de la tienda.
- La unión es por **nombre de tienda** contra las tiendas con meta. La venta de tiendas sin meta (p. ej. «Unknown»)
  no entra; de ahí los **$605** de diferencia.
- Está **fija en 2026** (`Año = 2026` y `YEAR(Date) = 2026`). Un rango con días de 2025 no tiene meta, y **desde el 1
  de enero de 2027 todos los widgets de meta quedan vacíos** si no se actualiza.
- **Fórmulas agregadas:**
  - **Cumplimiento Meta de Venta** = Σ VentaActual ÷ Σ MetaDiariaVentas × 100. Cuenta todos los días del filtro,
    también los que no tienen venta.
  - **Diferencia vs Meta Venta** («Corriente») = Σ (venta − meta) **solo de tienda-días con venta > 0 y meta > 0**.
    Deja fuera los días sin venta: los futuros, los cerrados o los que no se han cargado.

**Por qué falla el punto 1:**
1. «Esta semana» trae la meta de **toda la semana (16–22 nov)** contra la venta de un solo día → 13.1 %. La
   «Diferencia (Corriente)» sí descuenta los días sin venta y dice +$56 k. Las dos gráficas miden cosas distintas.
2. Si se pone un rango con «Esta semana» todavía activa, se cruzan: venta del 16 contra la meta de otro periodo →
   101.3 %.
3. Con 12–16 limpio, el cumplimiento (97.9 %) es correcto. La diferencia «corriente» (+$7,689) deja fuera ~$99 k de
   meta de tienda-días sin venta, así que sale en verde aunque el periodo va $91 k abajo.
4. El 16 todavía sin Rappi baja la venta de ese día. Influye, pero no es la causa principal.

**Propuesta:**
- Que «Diferencia» y «Cumplimiento» usen la misma regla de días: los dos «corrientes» (solo días con venta) o los dos
  completos, y que el título lo diga.
- Que «Fecha Relativa» venga vacía por omisión, o que se limpie al elegir un rango.
- Quitar el año fijo 2026.
- Avisar en el tablero que los widgets de meta no responden a los filtros de producto o categoría.

### AVG Margen — informe «Ranking de Productos»
- La columna es el **Promedio de «Margen»** de la tabla de consulta **«Ventas y Costo»**.
- **Margen por línea** = (venta sin IVA − costo) ÷ venta sin IVA × 100. El costo de la línea es:
  - unidades × «Costo total producto» de **«Costos Marzo 2026»**, unido **por nombre de producto exacto**;
  - más $9.60 de empaque Rappi, solo en la primera línea de cada pedido Rappi;
  - menos el desechable de las líneas Eat Here, según la categoría.
- **Problemas encontrados:**
  1. **Es un promedio simple de porcentajes por línea.** Una línea de $15 pesa igual que una de $500. Lo correcto es
     Σ utilidad ÷ Σ venta sin IVA.
  2. **No incluye regalías (7 %) ni comisiones** (Rappi 18 %, app 3.6 %, tarjeta 2.5 %). Eso es «Margen final», que
     existe en la misma tabla pero el ranking no usa. Por eso salen 64–75 %.
  3. **Margen ≤ 0 se fuerza a 0.** Las pérdidas no se ven y el promedio sube.
  4. **Costos fijos de marzo 2026 por nombre exacto.** Los productos que no están en esa lista (todos los Peppermint,
     y cualquier producto nuevo o renombrado) quedan con costo y margen **vacíos** en «Ventas y Costo».
  5. **El margen de cada producto se mezcla con el de los otros productos del mismo ticket (confirmado).** En el
     Diagrama de modelo, la única relación entre «Ventas y Costo» y «Looker Sucursales» es
     `Ventas y Costo.ls.Order ID = Looker Sucursales.Order ID`. El ranking agrupa por `Product` de «Looker Sucursales»
     y promedia `Margen` de «Ventas y Costo». Así, cada fila de producto se cruza con **todas las líneas de su pedido**,
     y el «Avg Margen» de un producto es el promedio de los márgenes de todo lo que se vendió en sus tickets.
     - **Ejemplo, pedido Rappi 2489166087 (Plaza Cantabria, 15-nov):**

       | Línea | Margen en «Ventas y Costo» |
       |---|---|
       | Peppermint Mocha Matcha Latte | vacío (sin costo) |
       | Pumpkin Latte | 82.22 % |
       | Sora Iced Latte (Signature) | 88.75 % |

       En el ranking, este pedido le aporta al Peppermint **85.49 %**: el promedio del Pumpkin y del Sora. Por eso los
       Peppermint muestran ~63 % sin tener costo. Lo mismo pasa con todos los productos: el café que se vende con pan
       hereda parte del margen del pan, y al revés.
     - En ese mismo pedido, el empaque Rappi de $9.60 le tocó al Peppermint por orden alfabético. Como su costo es
       nulo, el empaque **se pierde** y no se carga a ninguna línea.
     - Por revisar: si el cruce muchos-a-muchos por Order ID también infla «Total Products» y «Share» del ranking. En
       Zoho las columnas de la tabla base suelen no duplicarse, pero hay que cotejar las unidades de un producto
       contra «Looker Sucursales» sola.
  6. El ajuste de desechable usa la categoría `'Panadería'`, que no existe: son «Panadería Dulce» y «Panadería
     Salada». Ese ajuste nunca se aplica a pan.
  7. El ajuste de desechable usa la «Categoría Master», que viene mal en los productos de Otros. Los Peppermint no
     reciben el ajuste.
  8. El empaque Rappi de $9.60 cae completo en la primera línea del pedido, ordenada alfabéticamente. Distorsiona el
     margen de ese producto.
- **Propuesta:**
  - Construir el ranking directo sobre «Ventas y Costo», agrupando por su propio `ls.Product` (no el de «Looker
    Sucursales»), con margen = Σ utilidad ÷ Σ venta sin IVA. Así se elimina el cruce por Order ID.
  - Decidir si se muestra el margen bruto, el final o los dos.
  - Mantener la tabla de costos al día (o tomarla de Costeo) y avisar cuando un producto vendido no tenga costo.

## Pendientes

### 1. Cumplimiento Meta falla según el rango de fechas
- **Síntoma reportado:** con el rango **12–16 nov** no funciona; con **9–15 nov** sí.
- **Hipótesis inicial:** el 16 todavía no tiene Rappi.
- **Lo que se vio (17-nov, todas las tiendas):**

  | Rango | Ventas Netas (KPI) | Venta en «Venta vs Meta» | Meta | Cumplimiento | Diferencia vs Meta (Corriente) |
  |---|---|---|---|---|---|
  | 9–15 nov | $5,726,337 | $5,725,732 | $5,928,945 | 96.6 % | **−$139,712** (rojo) |
  | 12–16 nov | $4,286,522 | $4,285,917 | $4,377,664 | 97.9 % | **+$7,689** (verde) |
  | 12–16 nov **con «Fecha Relativa = Esta semana» puesta** | $789,805 | $789,805 | $779,310 | **101.3 %** | +$56,017 |
  | Solo «Esta semana» (= 16 nov) | $789,805 | $789,805 | $6,029,252 | 13.1 % | +$56,017 |

- **Hallazgos:**
  1. **«Fecha Relativa» y «Rango de Fechas» se combinan.** El dashboard abre con «Esta semana». Si se elige un rango sin
     quitarla, la venta queda solo con el cruce (16 nov), pero la meta toma otro periodo. Así sale 101.3 % o 13.1 %.
     Es la causa más probable de que «no funcione» con 12–16.
  2. **«Diferencia vs Meta (Corriente)» no cuadra con las otras dos gráficas.** Con 12–16 la venta queda $91,747 bajo la
     meta y el widget dice +$7,689 en verde. Con 9–15 debería ser −$203,213 y dice −$139,712. Usa otro periodo o un
     prorrateo distinto («corriente»). El 16 sin Rappi puede afectar aquí.
  3. **Con «Esta semana» la meta es la de la semana completa ($6.03 M) contra un solo día de venta.** El cumplimiento
     aparece bajo (13.1 %) aunque el día va bien.
  4. La venta dentro de «Venta vs Meta» es siempre **$605 menor** que el KPI de Ventas Netas: hay una venta sin meta
     (posible tienda o fila sin meta asignada).
  5. **Los widgets de meta no respetan el filtro de categoría:** con Categoría = Otros, Ventas Netas da $198,036, pero
     «Venta vs Meta» muestra $5,632,604 contra una meta de $5,805,502.
- **Por hacer (en Zoho, con sesión):** revisar la fórmula de «Diferencia vs Meta (Corriente)» y el periodo de meta.
  Decidir si «Fecha Relativa» debe limpiarse al elegir un rango. Ligar los filtros de categoría y tienda a los widgets
  de meta, o avisar que no aplican. Ver qué venta de $605 no encuentra meta.

### 2. Apartado «Otros»: productos nuevos sin categoría
- **Confirmado.** «Categoría Master Franchise MX» es un CASE por nombre de producto. Los productos nuevos caen en
  «Otros», con grupo «Otros» y «Contiene Café = No definido».
- Productos en Otros (9–15 nov, todas las tiendas):

  | Producto | Share en Otros | Unidades | Avg Margen | Categoría sugerida |
  |---|---|---|---|---|
  | Peppermint Mocha Iced Latte | 36.5 % | 674 | 63.67 % | Seasonal |
  | Peppermint Mocha Latte | 31.2 % | 576 | 61.80 % | Seasonal |
  | Peppermint Mocha Matcha Latte | 14.2 % | 263 | 64.35 % | Seasonal |
  | Peppermint Mocha Iced Matcha | 11.8 % | 218 | 63.97 % | Seasonal |
  | The Perfect Match | 4.7 % | 87 | 59.79 % | por definir (¿combo?) |
  | Spooky Biscuit | 0.6 % | 11 | 63.70 % | por definir |
  | Chai Latte + Lemon Cake | 0.4 % | 8 | 68.79 % | Combo con Panadería Dulce |
  | Salted Caramel Cookie | 0.4 % | 7 | 55.63 % | por definir |
  | Macadamia Cookie | 0.2 % | 4 | 81.52 % | por definir |
  | **-No Value-** (sin nombre de producto) | 0.1 % | 1 | — | revisar la fila de origen |

- Otros vendió **$198,036 en la semana 46** (9–15 nov), contra ~$15–23 k en las semanas anteriores: es casi todo
  Peppermint.
- **Por hacer:** agregar las ramas al CASE de «Categoría Master Franchise MX» en Zoho. Lo mismo en
  `bi_clasificacion_producto` del BI propio, donde estos productos quedan «Sin clasificar».

### 3. Ranking de productos dentro de «Otros»
- **No se reprodujo.** Con Categoría = Otros y rango 9–15 nov, el ranking muestra bien los 10 productos de la tabla
  de arriba.
- No se pudo probar 12–16 nov con Otros: el selector de fechas no aplicó el cambio en la vista pública.
- **Por hacer:** preguntar con qué filtros exactos falla (¿«Esta semana» puesta? ¿rango con el 16?) y repetir.

### 4. AVG Margen
- Está en el **Ranking de Productos** (columna «Avg Margen»).
- **Qué se vio:**
  - El total de Otros da **63.58 %**, que es el promedio simple de las filas y no un margen ponderado por venta.
  - «-No Value-» sale sin margen.
  - Los márgenes del ranking general (64–75 %) son altos para margen con comisión. Parecen margen bruto teórico sin
    comisiones de Rappi ni de tarjeta.
- **Por hacer (en Zoho, con sesión):**
  - Ver la fórmula de la columna de margen en «Looker Sucursales» y de qué tabla toma el costo.
  - Confirmar si se promedia por línea o se pondera por venta. Lo correcto es Σ margen ÷ Σ venta neta.
  - Revisar si el costo de los productos nuevos (Peppermint) existe o se está tomando otro.
  - Cotejar contra Costeo (portal) para 3–4 productos.

### 5. Peppermint en Seasonal — prioridad alta
- **Confirmado.** El POS ya los manda como «Seasonal / Seasonal Drinks» (p. ej. PEPMOLAPP «Peppermint Mocha Latte»),
  pero Zoho los clasifica en «Otros».
- Son 4 productos: Peppermint Mocha Latte, Peppermint Mocha Iced Latte, Peppermint Mocha Matcha Latte y Peppermint
  Mocha Iced Matcha. Juntos suman **1,731 unidades** en la semana 9–15 nov.
- **Por hacer:** agregarlos al CASE como Seasonal / Bebida y definir «Contiene Café» para cada uno. Este punto se
  resuelve junto con el punto 2.

## Acuerdos
- Ninguno registrado aún.

## Responsables / fechas
- Por definir. Los cambios de fórmulas requieren entrar a Zoho con una cuenta con permiso de edición.
