# 24 · Lote 3b: agua de Cold brew según el rendimiento documentado

**Estado (2026-10-26): aprobado por Carlo.** El alcance son **únicamente** las tres cantidades de AGUA. No se tocan el café, el hielo ni los precios. El cierre de la aplicación está en el §6.

**Independencia de H2 (doc 23).** H2 excluye Cold brew, así que los dos lotes no comparten recetas. Cada uno tiene su propio manifiesto, sus pruebas, su ejecución y su reversión.

Contexto: [22](22-PROPUESTA-FRESH-SODAS-HIELO-AGUA.md) §3.

## 1. Criterio: consumo de ingredientes

- **Datos del PDF:**
  - concentrado (p.9): 200 g de café + 280 g de agua a 60 °C + 720 ml de agua filtrada → **1 L**;
  - bebida (p.27): 100 ml de concentrado + 100 ml de agua fría (Regular) o 150 ml (Grande).
- **Consumo por bebida:** los 100 ml de concentrado son 1/10 del lote, así que consumen 20 g de café (ya aplicado en el lote 2) y **100 de agua**.
- **Naturaleza del dato:** es un reparto proporcional del rendimiento documentado, no una medición por bebida.

## 2. Manifiesto aprobado: `24-lote-3b-cold-brew-agua.manifiesto.json`

- **Registro:** `recetario-lote-3b-coldbrew-agua` en `LOTES_RECETAS_APROBADOS`, sha256 `1995cf24…1b5d`.
- **Receta:** Cold brew **v30**.
- **Celdas:** solo del insumo `AGUA`. Se revalidaron contra producción (solo lectura) antes de registrar.

| Línea | Celda | Antes | Aprobado |
|---|---|---|---|
| AGUA orden 0 (agua del concentrado) | Chica | 100 | 100 (sin cambio; no va en el manifiesto) |
| AGUA orden 0 (agua del concentrado) | Grande | 136 | **100** |
| AGUA orden 6 (dilución) | Chica | 183.333 | **100** |
| AGUA orden 6 (dilución) | Grande | 233.333 | **150** |

- **Total de AGUA:** 283.333/369.333 → **200/250**.
- **No cambian:** café (20/20), hielo (130/245) y costo ($14.50/$14.70, porque AGUA cuesta $0).
- **Herramienta:** el script existente `recetas-correcciones.ts`, sin cambios de lógica.

## 3. Pruebas: `tests/db/recetas-correcciones.test.ts`, 13/13

- **Lote aprobado:**
  - registrado con su huella;
  - v30; solo AGUA, en Grande 136 → 100 y en Chica/Grande 183.333/233.333 → 100/150;
  - la nota de aprobación limita el alcance.
- **Receta con la forma de Cold brew:**
  - el agua queda en 100/100 + 100/150;
  - el café, el hielo y el costo de `v_costo_producto` no cambian;
  - repetir da «sin cambio» y revertir restaura exacto.
- **BD completa en esta rama:** 183/183; `tsc` sin errores.

## 4. Ensayo local previo (copia de `2159Z` con el lote 2 aplicado, eliminada al terminar)

| Paso | Resultado |
|---|---|
| Ensayo y aplicación | 3 celdas cambiadas. Costos y márgenes sin cambio. Huellas idénticas de `v_resumen`, alertas, precios, enlaces e insumos |
| Repetir | «sin cambio» |
| Revertir | Restauración exacta |

## 5. Reversión e independencia

- **Reversión:** la de 3b es por ejecución, con `--lote recetario-lote-3b-coldbrew-agua --revertir --ejecucion <uuid>`. Se niega si Cold brew tiene registros posteriores en la bitácora.
- **Por qué H2 excluye Cold brew:** en un ensayo previo, H2 incluía Cold brew. Después de que H2 lo tocara, la reversión de 3b ya no era posible: «Hubo 2 cambio(s) posterior(es) en la receta». Al excluir Cold brew de H2, la reversión de 3b queda disponible.
