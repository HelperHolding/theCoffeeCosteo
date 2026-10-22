# 11 · Rubén Darío (532) y apartado Rappi

Fecha: 2026-10-22. Rama `feat/sucursales-ruben-dario-rappi`.

## Alta de Rubén Darío

| Fuente | Dato |
|---|---|
| API | `company_id 532`, «The Coffee Rubén Darío», `lookerStoreId 455` |
| CRM | «Darío- 455», Zapopan, Jestor 455, apertura 2025-01-10 |
| Zona | `America/Mexico_City` (Jalisco). El último pedido (14:39) es coherente con la hora local a las 15:21 |
| Validación (21-oct) | 46 pedidos, lectura completa, cuadre exacto. **Alerta: forma de pago `RAPPI` (tipo `CREDIT`) no vista antes** |
| Accesos en producción | Carlos, Sebastián y Ernesto (los usuarios con módulo Sucursales) |

## Hallazgo: Rappi sí llega por la API

Esto corrige la conclusión anterior de los documentos 06 y 10, que solo se basaba en tiendas sin Rappi.

- En Rubén Darío los pedidos de Rappi llegan con:
  - `paymentMethod = 'RAPPI'` y `paymentType = 'CREDIT'`;
  - `fromSmartphone = false`, así que **antes se contaban como Mostrador**;
  - `netAmout` menor que `grossAmount` y `percentageOfTransfer` < 100 en la mayoría.
- **Precios Rappi:** el mismo producto cuesta más que en mostrador. Por ejemplo, Iced Latte $88 frente a $70.
- **Volumen real (4 semanas cerradas):**

  | | Pedidos | Venta |
  |---|---|---|
  | POS | 861 | $120,728.20 |
  | Rappi | 501 | $98,984.00 cobrados; neto reportado $91,328.20 (diferencia 7.7 %) |

- La CRM marca la tienda con `rappi = false`: el dato del CRM está desactualizado.
- La 612 y la 583 no tuvieron Rappi en esas 4 semanas, así que sus cifras no cambian.

## Cambios

- **Clasificación:** origen `rappi` cuando `paymentMethod = 'RAPPI'`. Se evalúa antes que `fromSmartphone`.
- **Ventas POS excluye Rappi siempre:** `filtrarOrigen('todos')` = Mostrador + App. Afecta KPIs, curva, horas, productos, pedidos, tendencias, directorio e insights.
  - Cada respuesta trae `rappiExcluido` (pedidos y venta del mismo periodo).
  - Cada pestaña muestra «Excluido de Ventas POS: N pedidos de Rappi ($X)».
- **Apartado Rappi** (pestaña nueva en todas las sucursales):
  - «Hoy en vivo» y «Semanas», con la misma lectura, fórmulas y diseño que Ventas POS, filtradas a Rappi.
  - Bloque «Cobrado y neto»: `netAmout` se muestra como «neto reportado (API)» y la diferencia como «ajuste reportado». **No es la comisión** (ver sección siguiente).
  - En una tienda sin Rappi muestra ceros reales (lectura completa), nunca ceros por error.
- **Neto:** `netAmout` ahora se conserva como `netoCent` y entra en el resumen (`netoCent`). No se usa en Ventas POS.
- `validar-sucursal.ts` reconoce `RAPPI` y `CREDIT`.

## ¿`percentageOfTransfer` es la comisión? No

Datos: Rubén Darío, 501 pedidos de Rappi, del 21-sep al 18-oct.

| Evidencia | Resultado |
|---|---|
| `net = gross × percentageOfTransfer` | Solo se cumple en 190 de 501 pedidos, justo los que tienen 100 % y neto = cobrado. Con el % < 100 no se cumple ninguna fórmula proporcional (0 de 275) |
| % < 100 frente a descuentos | **Los 275 pedidos con % < 100 tienen promoción**; ninguno sin descuento tiene % < 100 |
| cobrado − neto | Son **montos fijos en pesos** (22.00 en 43 pedidos, 26.40 en 41, 24.40 en 26, 10.00 en 22, 36.60 en 22…), no un porcentaje |
| Neto mayor que lo cobrado | 36 pedidos (por ejemplo, cobrado 200 y neto 224) |
| Diferencia total | 7.7 % de lo cobrado. Muy por debajo de una comisión típica de agregador |

**Conclusión:** ni `netAmout` ni `percentageOfTransfer` reflejan la comisión del convenio con Rappi. Se comportan como **ajustes de promociones** (quién absorbe el descuento).

- En el portal, la diferencia se rotula «ajuste reportado».
- La comisión real requiere el % del convenio o el reporte de liquidación de Rappi.
- `refundId` trae, en pedidos de Rappi, un número de 10 dígitos (≈ 2,474–2,481 millones) que parece el **ID del pedido en Rappi**. Permitiría cruzar pedido por pedido con el reporte de Rappi.

## ¿Rappi y Rappi Turbo se distinguen? No en esta API

- Ningún campo menciona «turbo».
- Todos los pedidos de Rappi tienen el mismo `paymentMethod` (`RAPPI`), `paymentType` (`CREDIT`) y `fromSmartphone` (false).
- Los combos con dos precios (175 → 151, 150 → 130) cambian **por fecha**: es un ajuste de menú, no dos canales.
- Si Turbo llega por la misma integración, viene mezclado. Para separarlo haría falta:
  - un campo nuevo del proveedor; o
  - cruzar `refundId` (ID de Rappi) con el reporte de Rappi que indique el tipo de pedido.

## Pendiente con el proveedor y Rappi

- Confirmar el significado de `netAmout` y `percentageOfTransfer` en Rappi: ¿reparto de promociones?
- ¿Llegan los pedidos de Rappi Turbo por esta integración? ¿Hay algún campo que los distinga?
- Comisión del convenio (%, y si cambia entre Rappi y Turbo), para estimarla en el apartado Rappi.
- `percentageOfTransfer`: ¿el porcentaje que se transfiere a la tienda?
