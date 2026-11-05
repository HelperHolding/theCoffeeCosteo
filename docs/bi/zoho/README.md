# Reglas de Zoho para el BI (F0)

Extraído el 2026-11-05 del espacio «The Coffee Oficial» de Zoho Analytics. Solo se usaron consultas de **vista previa
sin guardar** (Tabla de consulta nueva → Ejecutar consulta) y la lectura de los filtros del dashboard. No se guardó ni se
cambió nada en Zoho.

## Archivos

| Archivo | Qué es | Cómo se obtuvo |
|---|---|---|
| `tiendas-zoho.psv` | 82 tiendas: Store ID, «Nombre de Tienda», «Franquiciatario», «Franquicia o Sucursales Propias», primera venta en Zoho y pedidos del POS | Consulta 1 |
| `productos-zoho.psv` | 335 combinaciones de código y nombre con su clasificación (categoría Master MX, grupo, café y promoción), primera y última venta y unidades | Consulta 2 |
| `filtros.json` | Opciones de los 17 filtros, reglas de Comparable, Años Operando y Maduración, semana con 22 muestras, métodos de pago y reportes que ignoran la fecha | Filtros del dashboard y consultas 3 y 4 |
| `reglas-columnas.md` | Qué hace cada columna de fórmula que usan los filtros | Anexo de la auditoría + valores calculados |

**Por qué valores y no fórmulas:**
- Las fórmulas CASE de Zoho van por nombre de producto, con 58 ramas y 276 literales, y por Store ID, con 81 ramas.
- En lugar de copiarlas y reimplementarlas, se extrajo **el resultado que Zoho ya calculó** para cada producto y tienda vendidos: es la misma regla, sin riesgo de transcribirla mal.
- Un producto nuevo que no esté en la lista queda «Sin clasificar» en el BI hasta que alguien lo clasifique.

## Consultas (vista previa, sin guardar)

1. **Tiendas**
   ```sql
   SELECT GROUP_CONCAT(q."x" SEPARATOR '~') FROM (SELECT CONCAT(ls."Store ID",'|',IFNULL(ls."Nombre de Tienda",''),'|',
     IFNULL(ls."Franquiciatario",''),'|',IFNULL(ls."Franquicia o Sucursales Propias",''),'|',MIN(ls."Date"),'|',
     COUNT(DISTINCT ls."Order ID")) AS "x" FROM "Looker Sucursales" ls WHERE ls."Place or Sale" <> 'Rappi'
     GROUP BY ls."Store ID", ls."Nombre de Tienda", ls."Franquiciatario", ls."Franquicia o Sucursales Propias") q
   ```
2. **Productos:** la misma forma, agrupando por «Default Code», «Product», «Categoría Master Franchise MX», «Comida,
   Bebida, Combo y Merch», «Contiene Café» y «Promoción alimento bebida, café, producto regular», con MIN y MAX de
   «Date» y SUM de «Products». Sin Rappi.
3. **Semanas**
   ```sql
   SELECT DISTINCT CONCAT(DATE(ls."Date"),'|',weekofyear(ls."Date",2),'|',ls."Semana",'|',day_name(ls."Date"))
   FROM "Looker Sucursales" ls WHERE DATE(ls."Date") IN (…22 fechas…)
   ```
   Se agruparon con `GROUP_CONCAT`.
4. **Antigüedad:** `SELECT … FROM "Tiendas Comparables"`, con Sucursal, Primera Transacción, Meses Operando, Años
   Operando, Estatus Comparabilidad y Cohorte Antigüedad.

## Hallazgos

- **Semana:** `weekofyear(Date,2)` de Zoho es la **semana ISO** (de lunes a domingo). El 2024-12-30 (lunes) ya es la
  semana 1 y el 2024-12-29 (domingo) es la 52. El filtro «Semanas y año» se muestra como `W45 2026`, con el año
  calendario de la fecha. Por eso el 2025-12-31 cae en «W1 2025», igual que en Zoho.
- **Comparable, Años Operando y Maduración** son atributos de la tienda medidos **contra hoy**, no contra la fecha de
  cada venta:
  - Meses Operando: meses completos desde la primera transacción.
  - Comparable: ≥ 12 meses.
  - Años Operando: `floor(meses / 12)`.
  - Maduración: «Menor de 3 meses» o «Mayor de 3 meses».
- **Primera transacción:** es la primera venta en «Looker Sucursales», que empieza el 2024-01-02. Para tener paridad,
  `bi_tiendas.fecha_apertura` se siembra con esa fecha (`origen_apertura = 'zoho'`).
- **«Default Code» vacío:** 139 de las 335 combinaciones vienen sin código en Zoho (sobre todo App desde 2025). El POS
  usa entonces el nombre como código (`normalizar.ts`), así que esas líneas se clasifican por nombre normalizado.
- **Códigos con varias clasificaciones en el tiempo:** la clasificación se versiona por fecha. Por ejemplo,
  `SALFRAAPP` era «Salted Caramel Frappé / Bebida Fría» del 21 al 31 de agosto de 2026 y desde el 1 de septiembre es
  «Salted Caramel Frap / Fraps».
- **Tiendas que no son de la red actual:** «Unknown» (680) y «Hernández Macías» (348), con franquiciatario «Por
  Asignar». Se siembran tal cual; el acceso por sucursal decide quién las ve.
- **Métodos de pago de Zoho:** APP - CARD, APP - WALLET, CONTINGENCY - CARD, CONTINGENCY - IFOOD, CONTINGENCY -
  MONEY, RAPPI, RAPPI TURBO, TABLET - CARD y WALLET. El mapeo desde el POS sale en la Task 2 (`pagos.json`).
