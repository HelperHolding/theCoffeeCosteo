# 14 · Rappi, caso 2: cargos de tamaño ausentes en el payload

**Revisión de integridad previa a publicar el PR #18.** Fecha: 2026-10-23. Solo lectura: 2 GET (catálogo + 1 página de 532 del 23-oct, 47 pedidos, lectura completa) y análisis local de la muestra de fase 2. **No se modificaron importes, precios, catálogo, permisos, Auth ni datos.**

**Estado del repo:** rama `feat/conciliacion-fase3` en `e78c46b` (= remoto); `main` = `b7416e1`; PR #18 `OPEN`/`CLEAN`, checks en verde; sin merge ni despliegue. La migración 21 se conserva aplicada.

## Cruce de identificadores

| Prueba | Resultado |
|---|---|
| Sucursal | `company_id 532` (Looker 455), Rubén Darío |
| Pedido POS 31905287 en la API | Encontrado (23-oct, 15:05:58 hora local) |
| **`refundId` = `2482754188`** | **Sí, exacto.** Es el único pedido del día con ese valor |
| Forma de `refundId` ese día | RAPPI: 24 de 24 con 10 dígitos · tarjeta: UUID · efectivo: vacío · monedero: `null` |

## Detalle por fuente

Las capturas tienen datos personales; aquí solo hay importes e identificadores.

| Grupo / línea | Rappi (captura 2) | API Brasil (payload) | Portal The Coffee (captura 1, producción) |
|---|---|---|---|
| Pumpkin Iced Latte | **Cantidad 2**, subtotal del grupo **$270.00**. Acompañamientos: Single Shot (18ml) $0 · **Grande 355 ml. $12.00** · Deslactosada $13.00 | **2 líneas separadas**, cada una `CPUMICAPP` «Pumpkin Iced Latte» `amount 110`, con `itemsCustom` = Single Shot (18ml) 0 + Lactose free 13. **Ningún custom de vaso** (ni Regular ni Large) | 2 líneas de $110.00 + Lactose free +$13.00; sin tamaño |
| Por unidad | 270 / 2 = **135** = 110 + 12 + 13. Los acompañamientos de Rappi son **por unidad** y van incluidos en el subtotal | 110 + 0 + 13 = **123** | 123 |
| Açaí Bowl | 1 × $188.00 | `ACABOWAPP` 188, sin customs | $188.00 |

**Totales:**

| Concepto | Valor | Fuente |
|---|---|---|
| Suma de productos Rappi | **458** (270 + 188; igual al total del listado) | Rappi |
| Total final Rappi («Total después de descuentos») | **436** | Rappi |
| `grossAmount` (= Σ líneas + customs de la API = venta en el portal) | **434** | Brasil |
| `netAmout` | **436** | Brasil |
| `discount` del pedido (aparte) | **59.80** | Brasil (el portal lo muestra como «Descuento») |
| `percentageOfTransfer` | 100 | Brasil |

| Diferencia | Valor | Explicación |
|---|---|---|
| Productos Rappi − `grossAmount` | **24** | **Demostrado en este pedido:** 2 × $12 de «Grande 355 ml.» que el payload no trae. Las demás partes coinciden al peso: base 110, leche +13, Açaí 188 |
| Grupo de bebidas Rappi − Brasil | 24 | Mismo motivo: 270 − 2 × 123 |
| Productos Rappi − total final Rappi | 22 | Reducción implícita de Rappi (promoción). **No es** el `discount` de Brasil |
| `grossAmount` − total final Rappi | −2 | Sin explicación demostrada |
| `netAmout` − total final Rappi | **0** | Coincidencia numérica (también en el caso 1: 538 = 538). **No se adopta como regla**: hubo 36 pedidos Rappi con `netAmout` > `grossAmount` en 4 semanas, y aquí 436 > 434 |
| `discount` (59.80) frente a 22 | — | No se equiparan; semántica pendiente |

## Recorrido del dato: dónde se pierde

| Paso | ¿Llega el tamaño de $12? | Evidencia |
|---|---|---|
| Payload GET `/order/company/532` | **No** | `itemsCustom` de cada bebida: solo Single Shot y Lactose free. El pedido no tiene ningún otro campo con detalle |
| Validación (`normalizar.ts`) | — | 0 inválidos; los customs se conservan todos. `cuadra = true` (434 = 434) |
| DTO (`vistaPedido`) y detalle | — | Muestra los dos customs que llegan, más el título «Pedido POS» y «Orden Rappi» |
| Clasificación de tamaños (A3) | — | Solo decide *dónde* se muestra un custom (Tamaños o Personalizaciones); **no borra customs ni importes** |

**Conclusión:**
- **El portal suma correctamente lo que Brasil entrega.** La pérdida está **antes**: el payload ya llega sin el cargo de tamaño.
- **Brasil y Rappi no representan el mismo detalle ni el mismo total** en este pedido ni en el caso 1.

### Pruebas sintéticas de regresión

`tests/portal/sucursales-rappi.test.ts`, «Rappi: lo que Brasil entrega…»:

1. **Pérdida en origen.** Con el payload real (sin vaso), la venta es 434 = `grossAmount`, el neto 436 se conserva y el portal no inventa el cargo.
2. **Fallo local descartado.** Si Brasil sí mandara el cargo, incluso con una etiqueta al estilo Rappi («Grande 355 ml.», que no cumple el patrón de vaso):
   - aparece en el detalle;
   - se suma al importe (2 × 135);
   - va a Personalizaciones con sus $24.
   
   No se pierde.

No se alteran valores reales para cuadrar con Rappi.

## Comparación con el caso 1 (POS 31893730 ↔ Rappi 2482647582)

| | Caso 1 | Caso 2 |
|---|---|---|
| Artículo afectado | Iced Mocha → llega como **`GENERIC`** (sin nombre ni customs) | Pumpkin Iced Latte → llega **con nombre y código**, pero sin custom de vaso |
| Cargo ausente | $12 («Grande 590 ml.») | 2 × $12 («Grande 355 ml.») |
| Productos Rappi frente a `grossAmount` | 580 frente a 568 | 458 frente a 434 |
| Total final Rappi / `netAmout` | 538 / 538 | 436 / 436 |
| Mismo cargo bien mapeado | En el mismo pedido, Iced Latte con «Grande 590 ml.» llegó como `Large - 600ml` +12 | — |

**Lectura (hipótesis, no demostrada):**
- El problema es **más amplio que Generic**: hay artículos identificados cuyos acompañamientos de tamaño no llegan.
- Una explicación compatible es el **mapeo de opciones de Rappi en el POS**: «Grande 590 ml.» sí se traduce a `Large - 600ml`, mientras que «Grande 355 ml.» (una etiqueta de vaso caliente) en una bebida fría no tendría equivalente y se descartaría.
- La etiqueta de Rappi «Grande 355 ml.» en una bebida *Iced* se conserva tal cual como evidencia. No se convierte a 600/590 ml ni se aprueba ninguna equivalencia global.

## Alcance en la muestra (4 semanas, 3 sucursales, 5,324 pedidos)

Utilidad: `scripts/conciliacion/tamanos-faltantes.ts`, local. Una «bebida con vaso» es la que aparece al menos una vez con `Regular/Large - N ml` (44 productos).

| Sucursal · canal | Líneas de bebidas con vaso | Sin custom de vaso |
|---|---|---|
| **532 · Rappi** | 616 | **241 (39.1 %)**, en 194 de 501 pedidos Rappi |
| 532 · Mostrador / App | 965 / 80 | 26 (2.7 %) / 0 |
| 583 · Mostrador / App | 1,276 / 65 | 45 (3.5 %) / 1 (1.5 %) |
| 612 · Mostrador / App | 3,807 / 202 | 183 (4.8 %) / 3 (1.5 %) |

**Matices que impiden afirmar que esas 241 líneas perdieron un cargo:**
- **Un solo tamaño en Rappi (no hay pérdida aparente).** Varias bebidas llegan *siempre* sin vaso en Rappi, con un precio base igual al precio Rappi del grande registrado en Costeo (Americano $69, Vanilla Latte $111, Mad Mocha $117, Matcha y Chai Latte $98). Indica que Rappi vende un solo tamaño. En el caso 1, Pumpkin Latte ($122 + leche) también coincidió exactamente con Rappi sin tamaño.
- **Riesgo real.** **Pumpkin Iced Latte** en Rappi llega 46 veces con «Regular» (+$0), 12 con «Large» (+$12) y **46 sin vaso**, siempre con base $110.
  - Este caso demuestra que al menos 2 de esas 46 eran «Grande 355 ml.» con cargo perdido.
  - **Escenario máximo estimado** para este producto en 4 semanas: 46 × $12 = **$552** (≈ 0.56 % de los $98,984 cobrados por Rappi en 532). **No es una pérdida confirmada**: supone que todas las líneas sin vaso eran grandes, algo que no se sabe.
  - El número real no se puede saber sin el detalle de Rappi.
- **Otras sucursales:** la diferencia solo afecta a la sucursal con Rappi (532). Mostrador y App no muestran el patrón.
- **`netAmout` > `grossAmount`:** 36 pedidos Rappi en 4 semanas; 20 de ellos incluyen una bebida con vaso que llegó sin vaso. Es compatible con cargos ausentes, pero no lo demuestra.

**Límites:**
- 2 pedidos cruzados con Rappi y 4 semanas de una sola sucursal con Rappi.
- Sin el detalle de Rappi no se puede saber qué líneas sin vaso eran grandes.
- No se hizo barrido histórico.

## Impacto en las métricas del portal

| Métrica | Efecto |
|---|---|
| Venta de Sucursales (= `grossAmount`) en pedidos Rappi | Refleja lo que Brasil registra, que puede ser **menor** que la suma de productos de Rappi (−12 y −24 en los dos casos) y distinto del total final de Rappi (+30 y −2) |
| Ranking y Tamaños de productos Rappi | Los tamaños grandes que no llegan se ven como «sin tamaño»; los importes por producto quedan por debajo de lo que Rappi cobró |
| Mostrador y App | Sin evidencia de efecto |
| Neto Rappi (`netAmout`) | Ya se muestra como «neto reportado (API)», sin interpretación (decisión vigente) |

## Decisión de Carlo (2026-10-23)

- **Aprobada la opción A** e implementada en el PR #18:
  - aviso de calidad de fuente, con el texto aprobado, visible siempre que las métricas incluyan Rappi:
    - filtro «Mostrador + App + Rappi» o «Rappi»;
    - pestaña Rappi;
    - directorio (la venta de hoy de cada tarjeta incluye Rappi);
  - no aparece con «Mostrador» ni con «App».
- Archivos:
  - `components/sucursales/estados.tsx` (`AvisoCalidadRappi`, `AVISO_CALIDAD_RAPPI`);
  - `components/sucursales/ventas-pos.tsx`;
  - `app/(sucursales)/sucursales/page.tsx`.
- Prueba: `tests/portal/sucursales-ui.test.tsx` («aviso de calidad Rappi…»). Revisado en el arnés visual.
- **No se ajustan importes, no se completan tamaños y Generic no se identifica por estimación.**
- **Ausencia de mapeo de SKU en Rappi/POS:** hipótesis pendiente de confirmación del proveedor (ver `15`).

## Recomendación sobre la publicación (antes de la decisión)

**No hace falta un fix de código para lo que entrega Brasil:** el portal suma bien lo que llega y no descarta datos. Las pruebas lo fijan. Sin embargo, el PR #18 **no corrige** la discrepancia con Rappi, porque es una limitación de la fuente.

Opciones para la decisión de Carlo:

| Opción | Qué hace | Esfuerzo | Riesgo |
|---|---|---|---|
| **A. Publicar el PR #18 tal cual + advertencia de calidad de fuente** *(recomendada)* | Un aviso fijo en la pestaña Rappi y en el filtro de origen Rappi: «Importes de Rappi según el POS (Brasil): pueden no incluir cargos de tamaño y difieren del total de Rappi; ver conciliación». No cambia cifras | Bajo (texto + prueba de UI) | Bajo. Requiere aprobación (es una corrección funcional nueva) |
| B. Publicar sin aviso | Mantener la documentación como única advertencia | Nulo | Lectura errónea de Rappi como «exacta» |
| C. Bloquear métricas de Rappi | Ocultar venta y ranking del canal Rappi hasta tener respuesta | Medio | Pierde una visibilidad útil; las cifras de Brasil siguen siendo las oficiales del POS |

Las mejoras del PR #18 (ranking sin duplicados, Generic, Orden Rappi, ficha) **no empeoran** esta discrepancia, y la Orden Rappi **facilita** cruzar pedido por pedido con el reporte de Rappi. Por eso esta revisión no bloquea la publicación; la decisión es de Carlo.

## Preguntas al proveedor

Agregadas a `06-PREGUNTAS-PROVEEDOR.md` («Complemento 23-oct, caso 2»). Ningún tercero fue contactado.
