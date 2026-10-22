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
  - Bloque «Cobrado y neto»: `netAmout` se muestra como «neto reportado (API)» y la diferencia «parece la comisión», pendiente de confirmar con el proveedor.
  - En una tienda sin Rappi muestra ceros reales (lectura completa), nunca ceros por error.
- **Neto:** `netAmout` ahora se conserva como `netoCent` y entra en el resumen (`netoCent`). No se usa en Ventas POS.
- `validar-sucursal.ts` reconoce `RAPPI` y `CREDIT`.

## Pendiente con el proveedor

- Confirmar que `RAPPI` es la única marca de Rappi y si hay otros agregadores (Uber Eats, DiDi).
- Qué es exactamente `netAmout` en Rappi: ¿neto después de la comisión?
- `percentageOfTransfer`: ¿el porcentaje que se transfiere a la tienda?
