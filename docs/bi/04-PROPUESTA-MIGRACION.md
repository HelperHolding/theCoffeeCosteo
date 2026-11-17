# BI 04 · Propuesta: correcciones en Zoho y migración al BI del portal

Fecha: 2026-11-17. Sale de la reunión de correcciones de Analytics
([notas](notas-reunion-2026-11-17-correcciones-analytics.md)). Tiene dos partes:

- **Parte A.** Terminar de corregir el «Dashboard The Coffee México» en Zoho Analytics. Se pidió explícitamente y va
  primero.
- **Parte B.** Migrar ese tablero al BI del portal The Coffee Costeo (`/bi/the-coffee-mexico`), que lee la API del POS
  directo.

---

## Parte A · Correcciones en Zoho (primero)

Los cambios se hacen con una cuenta de Zoho con permiso de edición. Antes de tocar nada:

- **Descartar el «Guardar» pendiente del dashboard.** Quedó al abrir el editor de un widget durante la revisión; no
  trae cambios buscados.
- **Duplicar cada vista que se vaya a cambiar** (sufijo «— respaldo 2026-11-17»), para poder volver atrás.

| # | Corrección | Dónde | Qué cambiar |
|---|---|---|---|
| A1 | **Peppermint en Seasonal** (prioridad alta) | Columna de fórmula «Categoría Master Franchise MX» de «Looker Sucursales» | Agregar ramas al CASE para Peppermint Mocha Latte, Peppermint Mocha Iced Latte, Peppermint Mocha Matcha Latte y Peppermint Mocha Iced Matcha → «Seasonal». Revisar que «Comida, Bebida…» quede en Bebida y definir «Contiene Café» de cada uno |
| A2 | **Productos nuevos en Otros** | La misma fórmula | Clasificar The Perfect Match, Spooky Biscuit, Chai Latte + Lemon Cake, Salted Caramel Cookie y Macadamia Cookie. Como **respaldo** antes del `ELSE 'Otros'`, usar la categoría que ya manda el POS (columna «Category», p. ej. `Seasonal`), para que un producto nuevo no caiga en Otros |
| A3 | **Costo de productos nuevos** | Tabla «Costos Marzo 2026» | Agregar los Peppermint y los demás productos vendidos sin costo, con el costo de Costeo. Sin esto, su margen queda vacío |
| A4 | **AVG Margen se cruza por pedido** | Informe «Ranking de Productos» | Rehacerlo sobre «Ventas y Costo», agrupando por su propio `ls.Product`, no por el `Product` de «Looker Sucursales» |
| A5 | **AVG Margen es promedio simple** | «Ventas y Costo» | Fórmula agregada nueva: `SUM("Utilidad total") / SUM("Venta sin IVA") * 100`. Usarla en el ranking en lugar de `Prom.(Margen)` |
| A6 | **Margen bruto o final** | Ranking | Decidir cuál se muestra: el «Margen» actual no resta regalías ni comisiones; «Margen final» sí. Sugerencia: mostrar los dos |
| A7 | **Pérdidas ocultas** | SQL de «Ventas y Costo» | Quitar el `CASE … <= 0 THEN 0` de «Margen» y «Margen final». Un margen negativo debe verse |
| A8 | **Desechable de pan** | SQL de «Ventas y Costo» | Cambiar `= 'Panadería'` por `IN ('Panadería Dulce', 'Panadería Salada')` |
| A9 | **Diferencia vs Meta no cuadra con Cumplimiento** | Fórmulas de «Meta de Venta por Día de la semana» | Usar la misma regla de días en las dos: las dos «corrientes» (solo días con venta) o las dos completas. Si se quedan distintas, el título debe decir «Corriente: solo días con venta» |
| A10 | **«Esta semana» compara toda la semana contra los días transcurridos** | Dashboard | Cambiar el filtro por omisión a «- Seleccionar -» o a «Semana anterior». Si se queda «Esta semana», usar la versión «corriente» en los dos widgets de meta |
| A11 | **Fecha Relativa + Rango se cruzan** | Dashboard | Decidir si Fecha Relativa se deja vacía por omisión. Mientras tanto, nota visible: «Al usar Rango de Fechas, quita Fecha Relativa» |
| A12 | **Año fijo 2026** | SQL de «Meta de Venta por Día de la semana» | Quitar `Año = 2026` y `YEAR(Date) = 2026`. Hace falta antes del 1 de enero de 2027, junto con la tabla de metas 2027 |
| A13 | **Metas ignoran filtros de producto y categoría** | Widgets de meta | Agregar una nota en los widgets: «La meta es por tienda y no responde a filtros de producto, categoría ni pago» |
| A14 | **Ranking en Otros no funciona** | — | No se pudo reproducir. Pedir los filtros exactos (o captura) a quien lo reportó |
| A15 | **Día con Rappi incompleto** | Dashboard | Agregar un widget con la última fecha con Rappi cargado, para saber hasta qué día está completa la venta |

### Bitácora de cambios aplicados en Zoho

**2026-11-17 · A1 y A2.** En la tabla «Looker Sucursales», columnas de fórmula. Solo se **insertaron** bloques; el
resto de la fórmula quedó igual. Para revertir, se borran estos bloques.

- **«Categoría Master Franchise MX»:**
  - Bloque al inicio del `case`, marcado «LOTE 2026-11-17»:
    ```sql
    when upper(trim("Product")) like 'PEPPERMINT%' then 'Seasonal'
    when upper(trim("Product")) in ('SPOOKY BISCUIT','SALTED CARAMEL COOKIE','MACADAMIA COOKIE') then 'Panadería Dulce'
    when upper(trim("Product")) = 'CHAI LATTE + LEMON CAKE' then 'Combo con Panadería Dulce'
    ```
  - Bloque antes de `else 'Otros'`, marcado «Respaldo 2026-11-17»:
    ```sql
    when "Category" = 'Seasonal' then 'Seasonal'
    ```
- **«Contiene Café»:** bloque al inicio del `case`, marcado «LOTE 2026-11-17»:
  ```sql
  when upper(trim("Product")) in ('PEPPERMINT MOCHA LATTE','PEPPERMINT MOCHA ICED LATTE') then 'Sí'
  when upper(trim("Product")) in ('PEPPERMINT MOCHA MATCHA LATTE','PEPPERMINT MOCHA ICED MATCHA','SPOOKY BISCUIT',
                                  'SALTED CARAMEL COOKIE','MACADAMIA COOKIE','CHAI LATTE + LEMON CAKE') then 'No'
  ```
  **Supuesto:** los Mocha llevan espresso y los Matcha no. Falta confirmarlo con la receta.
- **Resultado** («Esta semana» = 16-nov): Otros bajó de $35,446 a **$2,110**. Seasonal quedó en **$49,220**.
  Peppermint Mocha Latte sale como Seasonal / Bebida / Sí.
- **Pendiente:** «The Perfect Match» sigue en Otros. No tiene receta en Costeo y falta saber qué es.

**2026-11-17 · A3 (parcial).** Tabla de consulta «Costos Marzo 2026».

- **De dónde salen los costos.** La tabla se calcula desde «Recetario The Coffee Marzo 2026» (ingredientes × «Lista
  de Precios Materia Prima Marzo 2026», tamaño chico). No es una lista editable a mano.
- **Qué se hizo.** Se le quitó el `ORDER BY` final, que Zoho no acepta junto con `UNION`. Al final del SQL se agregó
  un bloque marcado «LOTE 2026-11-17»:
  ```sql
  UNION ALL SELECT 'Macadamia Cookie', 24.64
  UNION ALL SELECT 'Chai Latte + Lemon Cake', 43.69
  ```
  - Los dos costos salen de Costeo (vigentes al 17-nov).
  - Spooky Biscuit y Salted Caramel Cookie **ya estaban en el recetario** ($24.64). No se agregaron, porque se habrían
    duplicado.
- **Para revertir:** borrar el bloque y volver a poner `ORDER BY r."Nombre de Producto"`.
- **Regla:** si un producto del bloque se agrega después al recetario, hay que quitarlo del bloque. Si no, se duplica
  su venta en «Ventas y Costo».
- **Verificado** en «Ventas y Costo», después de darle «actualizar»: Macadamia Cookie tiene costo $24.64, margen
  57.97 % y margen final 48.07 %.
- **Peppermint (2026-11-17, después).** Se agregaron 4 filas al mismo bloque, con el costo **propuesto** de tamaño
  Chica de `Productos_nuevos_Costeo_2026-11-17.xlsx`:

  | Producto | Costo |
  |---|---|
  | Peppermint Mocha Latte | $19.55 |
  | Peppermint Mocha Iced Latte | $20.25 |
  | Peppermint Mocha Matcha Latte | $17.37 |
  | Peppermint Mocha Iced Matcha | $18.07 |

  - Es una receta **por analogía, en borrador**. Hay que cambiar estos costos cuando Costeo tenga la receta confirmada.
  - **Verificado** en «Ventas y Costo» después de «actualizar». Ejemplo: Peppermint Mocha Matcha Latte por Rappi a
    $113 tiene costo $17.37, margen 82.17 % y margen final 55.75 %.
  - La propuesta confirma el supuesto de «Contiene Café»: los Mocha llevan café en grano y los Matcha no.
- **Costeo (portal), 2026-11-17.** Se dieron de alta las 4 recetas con
  [`datos/alta-peppermint-2026-11-17.sql`](../../datos/alta-peppermint-2026-11-17.sql), en una transacción.
  - Se ensayó primero con ROLLBACK y luego se aplicó, con `app.origen = 'carga_masiva'`.
  - Carga `carga_id = e9d68d37-2524-4711-9f4d-79bbcce14882` (para revertir los códigos POS de esa carga).
  - Cada receta tiene categoría Seasonal, Chica $99 / Grande $109 y su código POS (PEPMOLAPP, PEPMIALPP, PEPMMLAPP,
    PEPIMLAPP).
  - El costo de Costeo cuadra al centavo con el Excel, en Chica y en Grande. Food cost de 20 % a 25 %.
  - La bitácora del portal registró 106 cambios.
  - **Siguen abiertas las 4 preguntas del Excel:** si es jarabe de peppermint o el de menta, las cantidades de jarabe y
    cacao, si lleva topping y la cantidad de matcha. Cuando se confirmen, se corrige la receta en el portal **y** el
    costo del bloque de Zoho.
  - **Código (2026-11-17, rama `fix/bi-peppermint-rappi`):**
    - **Nombres de Rappi** (`lib/sucursales/rappi-pos.ts`): `peppermint mocha latte`, `peppermint mocha iced latte`,
      `peppermint mocha matcha latte` y `peppermint mocha matcha iced latte` (en Rappi el Iced Matcha se llama así).
    - **Tamaños** (`tamanos-verificados.ts`): Regular → Chica y Large → Grande en los 4.
    - **Personalizaciones** (`personalizaciones-verificadas.ts`):
      - Los Mocha, como Mad Mocha: leche entera, Single y Double son neutros; Extra Double y otras leches se ajustan.
      - Los Matcha, como Matcha Iced Mint: leche entera es neutra; otras leches se ajustan.
    - **Pruebas:** una prueba nueva con opciones reales de los pedidos. Pasan las 793 pruebas del portal y `tsc`.
  - **Hallazgo aparte (todo el menú de Rappi):** desde el **2026-11-14** Rappi manda a veces el vaso como «Tradicional» o
    «Grande», sin mililitros. `VASOS` no los reconoce, así que esas líneas quedan fuera por tamaño, en cualquier
    producto. Arreglarlo pide decidir el vaso por producto (caliente 240/355 o frío 440/600), con revisión de Carlo.
- **Sin costo todavía:** The Perfect Match. Es un combo de Rappi que se costea por partes (bebida + pan) y no lleva
  receta propia.
- Tras guardar, Zoho reformatea el SQL del bloque (un `SELECT` por línea). Es solo formato.

**Validación:** después de cada cambio, comparar contra lo medido el 17-nov:

- semana 9–15 nov: Ventas Netas $5,726,337 y Otros $198,036;
- con A1–A2, Otros debe bajar a casi cero;
- con A4–A5, los Peppermint deben salir sin margen hasta que se haga A3.

---

## Parte B · Migración al BI del portal

### B1. Por qué migrar

La revisión de Zoho mostró que la mayoría de los errores vienen de cómo está armado, no de los datos:

| Problema en Zoho | Cómo queda en el BI del portal |
|---|---|
| Categoría por CASE de nombre: todo producto nuevo cae en Otros | Clasificación por código, versionada por fecha, editable por un admin. Respaldo con la categoría del POS |
| Costos fijos de marzo, por nombre exacto | Costo vigente de Costeo, el mismo que usa el portal |
| Margen = promedio simple, cruzado por pedido | Σ utilidad ÷ Σ venta, por línea (regla del spec: «cocientes de sumas») |
| Metas en tablas manuales con año fijo | Metas capturadas en el portal, sin año fijo, con la misma regla de días en cumplimiento y diferencia |
| La venta de la meta no responde a los filtros | Un solo modelo por línea: todos los filtros se combinan en todos los bloques |
| Los datos llegan por Looker → Zoho | API del POS directo, corte cada 10 minutos |
| Permisos por usuario de Zoho | Permisos del portal por sucursal |

### B2. Dónde estamos

| Fase | Estado |
|---|---|
| F0 · Reglas de Zoho (tiendas, productos, pagos, fechas) | Hecha (semillas en `docs/bi/zoho/`) |
| F1 · Base (`bi_lineas`, catálogos, funciones) | Hecha (migraciones 40–43) |
| F2 · Carga desde la API del POS | Hecha. Piloto exacto contra Zoho en 2025; en 2026 cuadra con el neto (migración 42). **Por confirmar:** que la historia completa desde 2024 esté cargada |
| F4 · Tablero con los 17 filtros y bloques 1, 3, 6, 7 y 8 | En producción (PR #102–#105) |
| **F3 · Rappi de las tiendas sin portal** | Pendiente |
| **F4.1 · Margen del ranking con Costeo** | Pendiente |
| **F5 · Metas y punto de equilibrio** | Pendiente |

### B3. Qué falta, en orden

1. **Clasificación de productos al día** (chica, va primero)
   - Clasificar en `bi_clasificacion_producto` los mismos productos de A1–A2.
   - Agregar el respaldo con la categoría del POS para códigos sin regla.
   - Lista «Productos sin clasificar» en el BI, con unidades y venta, para que un admin los atienda.
2. **F4.1 · Margen con Costeo**
   - Costo por línea con el costo de Costeo vigente en la fecha de la venta.
   - Margen = Σ (venta sin IVA − costo) ÷ Σ venta sin IVA. Margen bruto y margen después de regalías y comisiones.
   - Productos sin receta en Costeo: margen «sin costo», nunca 0 ni heredado.
   - Empaque Rappi como costo del pedido, repartido entre sus líneas, no cargado a una sola.
3. **F5 · Metas y P.E.**
   - Pantalla de captura e importación del Excel con la plantilla de Zoho.
   - Reparto diario con factores por día de la semana, sin año fijo.
   - Cumplimiento y diferencia con **la misma regla de días**; «a la fecha» descuenta los días que no han pasado.
   - Avisos en pantalla cuando el periodo incluye días sin Rappi completo.
4. **F3 · Rappi de las tiendas sin portal.** Es la única dependencia que queda de Looker/Zoho. Hay dos caminos
   (decisión D1):
   - **(a) Importar de Zoho:** se importan las filas RAPPI de «Looker Sucursales» por la API de Zoho Analytics, una vez
     la historia y luego a diario. Es rápido, pero se queda la dependencia de Looker y su retraso (el caso del 16-nov).
   - **(b) Ampliar el portal de Rappi a todas las sucursales:** quita la dependencia, pero depende de dar de alta cada
     tienda en el portal.
   - **Recomendado:** (a) para la historia y como puente; (b) como destino, por lotes.
5. **Paridad y corte (cutover)**
   - **Corrida en paralelo** de 4 semanas: Zoho (con la Parte A) y el portal, con el mismo filtro.
   - **Tolerancia:** venta y tickets por tienda × semana con ±0.5 % o ±2 pedidos, como en el spec. Cada diferencia se
     documenta con su causa (hora 0 inflada en Zoho, neto desde marzo de 2026, Rappi, costo de Costeo vs marzo).
   - **Corte:** cuando 4 semanas seguidas cumplan, el portal es la fuente oficial y el dashboard de Zoho queda solo de
     consulta, con una nota que apunte al portal.
6. **Otros tableros de Zoho** (Ranking Nacional, KPI vs Meta, scorecards…)
   - Inventariar y decidir cuáles siguen.
   - Fuera de esta propuesta; se planea después del corte.

Cada paso lleva su plan, revisión y PR, como las fases anteriores. Nada escribe en producción sin OK.

### B4. Decisiones que necesitamos

| # | Decisión | Opciones | Sugerencia |
|---|---|---|---|
| D1 | Rappi de tiendas sin portal | (a) importar de Zoho · (b) ampliar el portal · ambas | Ambas: (a) como puente, (b) como destino |
| D2 | Credencial de la API de Zoho Analytics (para F3a) | Quién la genera y la pone en Vercel | Sebastián |
| D3 | Margen a mostrar en el ranking | Bruto · final · ambos | Ambos |
| D4 | Quién captura metas y P.E. en el portal | — | Por definir |
| D5 | Filtro de fecha por omisión | «Esta semana» (como Zoho) · «Semana anterior» | «Esta semana», con cumplimiento «a la fecha» |
| D6 | Duración de la corrida en paralelo | 2 · 4 semanas | 4 semanas |
| D7 | Qué pasa con Zoho después del corte | Solo consulta · se apaga el tablero | Solo consulta 3 meses, luego se apaga |

### B5. Riesgos

- **Rappi incompleto durante la transición.** Mientras no exista F3, el BI del portal no tiene el Rappi de las tiendas
  sin portal y sus cifras quedan abajo de Zoho. Se marca en pantalla por tienda y día.
- **Las cifras no van a ser idénticas a Zoho.** El margen usa otro costo, las metas otros factores y la hora 0 se
  corrige. Hay que comunicar antes del corte qué cambia y por qué.
- **Rendimiento con la historia completa.** La meta de 3 s de `bi_tablero` aún no está medida (doc 03). Si no la
  cumple, se agrega el resumen diario que prevé el spec.
- **Doble trabajo durante la corrida en paralelo.** Clasificaciones, costos y metas se capturan en los dos lados.
  Mantener la corrida corta y con dueño claro.
