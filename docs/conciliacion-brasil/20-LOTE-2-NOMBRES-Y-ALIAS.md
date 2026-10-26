# 20 · Lote 2 de códigos POS: nombres y alias (propuesta para revisión)

**Estado:** preparado el 2026-10-26 por indicación de Carlo. **No se cambió nada en producción.**
- No se cargó ningún enlace.
- No se renombró ni se desactivó ninguna receta.
- No se cambió ningún precio.

Cada fila necesita aprobación expresa antes de cargarse.

**Lista con la evidencia por código:** [`20-lote-2-candidatos.csv`](20-lote-2-candidatos.csv), 15 códigos.

## Cómo se verificó (solo lectura)

- **Datos del POS:** la misma muestra auditada de `15` y `17`: sucursales 532, 583 y 612, del 2026-09-21 al 2026-10-18, 5,324 pedidos.
- **Costeo:** inventario actual de producción, leído el 2026-10-26 con SELECT acotados: 160 recetas, sus tamaños y precios de lista, y los 57 enlaces cargados.
- **Criterios:** los mismos cinco del lote 1 (`verificar-enlaces.ts`): código, nombre, contexto, variante y tamaño. El precio de 532 Mostrador es evidencia, no criterio.
- **Alias:** para revisarlos, el nombre observado se tomó como alias de la receta candidata. Así se compararon con esa receta su tamaño, su precio y sus posibles variantes.

  Que el resultado sea coherente **no prueba que sean el mismo producto**. Por eso los alias quedan como candidatos.

**Comprobaciones comunes:**
- **Unicidad:** cada código llega con un solo nombre, y ese nombre no llega con otro código. Ninguno aparece como componente de un combo.
- **Sin solape:** ninguno de los 15 códigos está cargado, y ninguna de sus recetas está ligada ya a otro código.
- **El lote 1 sigue verificado:** 57/57 con los datos actuales.

## A · Nombres (renombres B1–B6 ya aplicados)

Tras los renombres del PR #21, el nombre de Costeo coincide **exactamente** con el observado en el POS.

| Código | Producto en Costeo | Líneas | Tamaño (API → Costeo) | Precio en 532 | Estado |
|---|---|---|---|---|---|
| `3FOOD3` | Pain au Chocolat | 220 | sin vaso → Único | 42 = 42 | **Listo para revisión** |
| `BR3` | Grilled Ham Cheese and Tomato Sandwich | 202 | sin vaso → Único | 104 = 104 | **Listo para revisión** |
| `CROSTUAPP` | Croissant filled with cheese and ham | 89 | sin vaso → Único | 73 = 73 | **Listo para revisión** |
| `1CBWB` | White bag 250g | 19 | sin vaso → Único | 220 = 220 | **Listo para revisión** |
| `3CBBE` | Black edition 250g | 5 | sin vaso → Único | Sin ventas sin descuento en 532 (Costeo: 550) | **Listo para revisión.** El precio no se puede contrastar, igual que en `19` |
| `BRICE` | Brownie with ice cream | 22 | sin vaso → Único | 89 = 89 | **Bloqueado por C3.** Pasa todos los criterios, pero falta decidir cuál de los dos brownies es el vigente (pregunta O2 de `18`). No se propone sin esa decisión |

## B · Alias (grupo D de `16`): candidatos, no aprobados

El nombre del POS difiere del de Costeo. **La identidad tiene que confirmarla Operaciones** (pregunta O4 de `18`): nombre parecido y precio igual no bastan.

La propuesta es **ligar el código a la receta existente sin renombrarla**.

| ID | Código | POS | Costeo | Líneas | Tamaño | Precio en 532 (Chica/Grande) | Requiere |
|---|---|---|---|---|---|---|---|
| D1 | `CPUMICAPP` | Pumpkin Iced Latte | Pumpkin Spice Iced Latte | 428 | Regular+Large → Chica+Grande | 99 = 99 · 109 = 109 | Identidad (O4) |
| D2 | `CPUMLAAPP` | Pumpkin Latte | Pumpkin Spice Latte | 349 | Regular+Large → Chica+Grande | 99 = 99 · 109 = 109 | Identidad (O4) |
| D3 | `CPUMFRAPP` | Pumpkin Spice Frap | Pumpkin Spice Frappé | 124 | Regular+Large → Chica+Grande | 99 = 99 · 109 = 109 | Identidad (O4) |
| D4 | `SALFRAAPP` | Salted Caramel Frap | Salted Caramel Frappé | 101 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D5 | `FRATARAPP` | Taro Frap | Taro Frappé | 80 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D6 | `COFFRAAPP` | Coffee Frap | Coffee Frappé | 59 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D7 | `FRAMATAPP` | Matcha Frap | Matcha Frappé | 46 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D8 | `FRACHAAPP` | Chai Frap | Chai Frappé | 42 | Regular+Large → Chica+Grande | 89 = 89 (Grande sin evidencia) | Identidad (O4) |
| D9 | `ZOEWATAPP` | Zoé Water | Zoé Water Natural | 8 (solo 532) | sin vaso → Único | API 45; **Costeo sin precio de lista** | Identidad (O4) **y** precio (A4) |

**Observaciones:**
- **Pumpkin Spice y la temporada.** Los tres Pumpkin Spice son de temporada: si el producto deja de venderse, el enlace queda sin uso, pero no causa daño. En `16` (A5) sigue la observación del precio Rappi de Grande menor que el de Chica; no se toca aquí.
- **Chai Frap (D8).** Solo hay evidencia de precio para Chica. El tamaño es coherente: llega con vasos Regular y Large.
- **Zoé Water (D9).** Solo se vende en 532. La receta candidata **no tiene precio de lista**, así que ligar el código no cambia cifras, pero el costeo de ese producto seguirá incompleto hasta resolver A4.

## Fuera de este lote

| Código | Motivo |
|---|---|
| `MISICEDAPP` (Iced Latte + Ham & Cheese Sandwich) | B7 se aprobó: conservar el nombre de Costeo y ligar por código. Pero el POS lo vende con vasos y la receta es Único: **depende de E5** (tamaños de combos, O8) |
| `ZOETWIAPP` (Zoe Water Twist) | **D10:** un código para dos sabores. No puede ligarse a una sola receta (pregunta R3 de `18` y pregunta al proveedor) |
| Los demás pendientes de `16-codigos-pendientes.csv` | Variantes (C1, C6), tamaños (E2–E5) y recetas nuevas (F), con sus propias decisiones |

## Si se aprueba (otra entrega, cada paso con aprobación)

1. **Aprobación por fila o por grupo**, por ejemplo: «apruebo A sin BRICE» o «apruebo D1–D8 con la confirmación de Operaciones».
2. **Archivo fijado** `lote-2.csv`, con el mismo formato y sha256 que `17-lote-1.csv`, incluida la evidencia de cada fila.
3. **Script:** el mismo `enlaces-pos.ts`, apuntando al lote 2, en una rama con PR. Hoy la huella del lote 1 está fijada en el código, así que hay que **parametrizar el lote** sin debilitar sus validaciones.
4. **Respaldo verificado** y ensayo remoto con ROLLBACK, carga con `carga_id` propio y segundo ensayo, como en `17`.
5. **Integraciones:** Vercel y Supabase tienen que estar reconectadas a `HelperHolding/theCoffeeCosteo` antes de cualquier merge con cambios de código. Hoy Vercel no despliega y Supabase no genera checks (ver PR #24).

**Este lote no cambia** nombres, recetas, precios, costos ni ventas, y Sucursales no usa los enlaces.
