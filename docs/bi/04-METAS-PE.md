# BI 04 · Metas y punto de equilibrio (F5)

Fecha: 2026-11-19. Cuarta entrega del BI: llena el bloque 2 del tablero («Contra meta y punto de equilibrio») y las
columnas Meta y Vs meta de «KPI Venta The Coffee». Migración **74** (`20261120000074_bi_metas_pe.sql`; la 72 es de Comercializadora y la 73 de mcp_ventas).

## De dónde salen

| Dato | Fuente | Tabla en el portal |
|---|---|---|
| Meta mensual de venta, tickets y ticket promedio por sucursal, con su fecha de apertura | Zoho Analytics, tabla «Metas Mensuales 2026 (Ventas Tickets TP)» (la misma que usa el dashboard de Zoho) | `bi_metas` |
| Meta por día | Se calcula en el portal (`bi_recalcular_metas`) | `bi_metas_diarias` |
| Punto de equilibrio mensual | CSV de Finanzas (`tienda,mes,pe`) | `bi_punto_equilibrio` |

Al 2026-11-19 la tabla de Zoho tiene enero a noviembre de 2026 (89 sucursales en noviembre). Las 79 tiendas del BI
cruzan por nombre; los 11 nombres que no cruzan son aperturas de noviembre que aún no están en `bi_tiendas` y
«Correo 37» (solo enero y febrero). Se cargan cuando entren a `bi_tiendas`.

**P.E.:** en Zoho solo hay «Abraham Punto Equilibrio» (11 Sucursales Propias, oct–dic 2025) y «Punto de Equilibrio
Sucursales Propias» (10 tiendas, sin mes). Para 2026 no hay P.E. por mes: se carga lo que defina Finanzas.
Mientras Finanzas manda el suyo, se carga como **provisional** `docs/bi/zoho/pe-provisional-2026.csv`: el «Nuevo P.E.
Estado de Resultados con IVA» de esa tabla, el mismo monto en cada mes de 2026 (10 tiendas; Forum Tlaquepaque no
tiene). Con IVA porque la venta del BI, como la de Zoho, lo lleva. Un CSV nuevo con `pe --aplicar` lo reemplaza.

## Cómo se calcula

- **Meta diaria** (igual que la QT de Zoho «Meta de Venta por Día de la semana»):
  meta del mes ÷ suma de factores de los días abiertos del mes × factor del día de la semana. Antes de la fecha de
  apertura de la meta vale 0. Igual con tickets.
- **Factor del día de la semana**, por tienda: venta promedio de ese día de la semana ÷ venta promedio diaria, con 2
  decimales. Solo cuentan días con venta. Sin historia, factor 1.
- **Diferencia con Zoho:** Zoho toma las 12 semanas antes de *hoy*, así que la meta de un mismo día cambia cada
  semana. Aquí se toman las **12 semanas completas antes de la semana del día 1** del mes: la meta del mes queda fija.
  `bi_metas_diarias` guarda los factores y la ventana usada (`ventana_desde`, `ventana_hasta`).
- **P.E. diario** = P.E. del mes ÷ días del mes (QT «Abraham Punto de Equilibrio Diario»).

## Qué muestra el tablero

`bi_tablero` devuelve `metas` (tipo `RpcMetas` en `lib/bi/tipos.ts`):

| Cifra | Definición | En Zoho |
|---|---|---|
| Cumplimiento | Venta ÷ meta de los **días de tienda con corte del POS** | Cumplimiento Meta |
| Diferencia vs meta | Venta − meta de esos mismos días | Diferencia vs Meta (Corriente) |
| Meta del periodo | Meta de todos los días del periodo, incluidos los que faltan; «Avance» = venta ÷ esa meta | Venta vs Meta |
| Tickets vs meta, ticket promedio vs meta | Igual, con tickets | — |
| Venta vs P.E. | Venta ÷ P.E. de los días con corte, **solo de las tiendas con P.E.** y su venta | P.E. vs Venta % |
| Excedente / falta para el P.E. | Venta − P.E. de esos días | P.E. vs Venta (Corriente) |

- La meta y el P.E. respetan los filtros de tienda, día de la semana y semana. Con filtros de producto, categoría,
  grupo, café, pago, hora o monto la venta ya no es la de la tienda completa: la pantalla **no compara** y lo dice.
- Sin meta o P.E. cargado se ve «Sin datos» o «—», **nunca cero** (Zoho mostraba 0 y la venta completa como excedente).
- «N días de tienda del periodo sin meta cargada» avisa cuando falta un mes (por ejemplo, diciembre antes de cargarlo).
- Una tienda con meta 0 en el periodo (aún no abre según la meta) se trata como «sin meta».

## Cargar y actualizar

Sin `--aplicar` el script solo muestra lo que haría.

```bash
npx.cmd tsx --conditions=react-server scripts/bi/metas.ts metas
npx.cmd tsx --conditions=react-server scripts/bi/metas.ts metas --aplicar
npx.cmd tsx --conditions=react-server scripts/bi/metas.ts pe --csv pe-2026.csv --aplicar
npx.cmd tsx --conditions=react-server scripts/bi/metas.ts recalcular --mes 2026-11 --aplicar
```

- `metas` lee Zoho Analytics (solo lectura, token `ZOHO_ANALYTICS_REFRESH_TOKEN`) o `--csv` con las mismas columnas,
  guarda `bi_metas` y reparte por día cada mes cargado. Un export vacío de Zoho detiene la carga.
- Cada mes nuevo (cuando lo carguen en Zoho): correr `metas --aplicar`.
- `recalcular` vuelve a repartir un mes, por ejemplo después de recargar historia del POS de la ventana.

## Pruebas

- `tests/db/bi-metas.test.ts`: reparto con factores, ventana, apertura, idempotencia, permisos, corriente vs periodo,
  P.E., filtro de día y días sin meta.
- `tests/portal/bi-metas.test.ts`: lectura del export de Zoho y del CSV de P.E., cruce por nombre y codificación.
- `tests/portal/bi-bloques.test.ts` y `tests/portal/bi-tablero-ui.test.tsx`: cifras del bloque, meta por tienda y
  pantalla con y sin metas.
