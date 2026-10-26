# 24 · Lote 3b: agua de Cold brew según el rendimiento documentado (borrador, sin aprobar)

**Estado (2026-10-26): borrador y pruebas locales.**
- **No aprobado.** El manifiesto **no** está registrado en `LOTES_RECETAS_APROBADOS`.
- **Producción:** no se escribió nada. Las lecturas de producción solo sirvieron para generar el borrador.
- **Ensayo:** solo en una copia local del respaldo verificado `2159Z`, que se eliminó al terminar.

**Independencia.** Es un lote independiente de H2 (doc 23): tiene su propio manifiesto, sus propias pruebas y se aprueba por separado.

Contexto: [22](22-PROPUESTA-FRESH-SODAS-HIELO-AGUA.md) §3.

## 1. Criterio: consumo de ingredientes

**Datos del PDF:**
- **Concentrado (p.9):** 200 g de café + 280 g de agua a 60 °C + 720 ml de agua filtrada rinden **1 L**.
- **Bebida (p.27):** 100 ml de concentrado + 100 ml de agua fría (Regular) o 150 ml (Grande).

**Consumo por bebida:** los 100 ml de concentrado son 1/10 del lote, así que consumen 20 g de café (ya aplicado en el lote 2) y **100 de agua**. Es un reparto proporcional del lote documentado, no una medición por bebida.

## 2. Borrador: `24-lote-3b-cold-brew-agua.manifiesto.json`

Cold brew **v30**. Las celdas son solo del insumo `AGUA`, alternativa W1 del doc 22: una línea por cada significado.

| Línea | Celda | Hoy | Propuesto |
|---|---|---|---|
| AGUA orden 0 (agua del concentrado) | Chica | 100 | 100 (sin cambio; no va en el manifiesto) |
| AGUA orden 0 (agua del concentrado) | Grande | 136 | **100** |
| AGUA orden 6 (dilución) | Chica | 183.333 | **100** |
| AGUA orden 6 (dilución) | Grande | 233.333 | **150** |

- **Total de AGUA:** 283.333/369.333 → **200/250**.
- **No cambian:** café 20/20, hielo y costo ($14.50/$14.70, porque AGUA cuesta $0).
- **Herramienta:** el script existente `recetas-correcciones.ts`, sin cambios de código.

## 3. Pruebas: `tests/db/recetas-correcciones.test.ts`, 13/13 (2 nuevas)

- **Borrador real:**
  - v30; solo AGUA, en Grande 136 → 100 y en Chica/Grande 183.333/233.333 → 100/150;
  - marcado BORRADOR;
  - no figura en `LOTES_RECETAS_APROBADOS`, y `leerLoteRecetas` lo rechaza sin un registro explícito.
- **Receta con la forma de Cold brew:**
  - el agua queda en 100/100 + 100/150;
  - el café, el hielo y el costo de `v_costo_producto` no cambian;
  - repetir da «sin cambio» y revertir restaura exacto.

## 4. Ensayo local con datos reales (copia de `2159Z` con el lote 2 aplicado)

| Paso | Resultado |
|---|---|
| Ensayo (ROLLBACK) | 3 cambiadas, 3 registros en la bitácora, resto sin cambios |
| Aplicar | AGUA: o0 100/100, o6 100/150. Costo $14.50/$14.70; márgenes $52.74/$61.16 (Mostrador) y $46.88/$54.87 (Rappi). Huellas idénticas de `v_resumen`, alertas, precios, enlaces e insumos |
| Repetir | 3 «sin cambio», 0 registros |
| Revertir | 3 revertidas; el estado vuelve a ser idéntico al original |

## 5. Orden con H2 y efecto en la reversión

Cold brew también está en el borrador de H2: su línea de hielo. El orden definido es **3b → H2**:
1. Se aplica 3b. Cold brew pasa de v30 a v33.
2. El manifiesto de H2 se **regenera** contra la versión vigente, en solo lectura, y se revisa su diff. El diff debe cambiar **solo** la versión de Cold brew.
3. Después se aprueba y aplica H2.

El control de versión se mantiene: un manifiesto viejo se detiene.

**Efecto en la reversión.** Una vez que H2 toca Cold brew, aunque H2 se revierta después, el script **ya no revierte 3b**: Cold brew tiene registros posteriores en la bitácora y la reversión se niega, que es lo correcto. El ensayo local lo confirmó («Hubo 2 cambio(s) posterior(es) en la receta»). En ese caso, deshacer 3b requeriría un lote de corrección nuevo con su propia aprobación.

**Alternativa, si se quiere conservar la reversión directa de 3b:** sacar Cold brew de H2 y migrar su hielo en un lote posterior, cuando 3b ya esté asentado.

## 6. Para aprobar después

1. Aprobar el criterio de consumo W1 y la huella del manifiesto.
2. Registrar el manifiesto en `LOTES_RECETAS_APROBADOS`.
3. Respaldo verificado.
4. Dry-run remoto con ROLLBACK.
5. Aplicación.
6. Verificación desde una conexión nueva y segundo ensayo.
