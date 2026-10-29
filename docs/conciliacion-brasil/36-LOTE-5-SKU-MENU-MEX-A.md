# 36 · Lote 5 de códigos POS: 23 SKU del menú «MEX - A» del portal del POS

**Estado:** preparado el 2026-10-29, con manifiesto, pruebas y ensayo local. **Sin ensayo remoto y sin carga.** Cada paso remoto requiere aprobación expresa de Carlo.

## Fuente

El catálogo del portal del POS (`portal-new.thecoffee.jp`, menú **«MEX - A»**, id 16) tiene 136 productos con su *default code*. Se leyó en solo lectura el 2026-10-29: no se cambió nada en el portal.

El *default code* del portal es el `defaultCode` que manda la API. Los 95 códigos vistos en ventas del 28-sep al 25-oct están en ese menú con el mismo código; la única excepción es `GENERIC`, la línea de Rappi sin mapear.

**Cotejo contra Costeo** (detalle en `entregables/Cotejo_menu_POS_MEX-A_2026-10-29.xlsx`, fuera del repo):

| Estado | Productos | Venta 28-sep a 25-oct |
|---|---|---|
| Ya enlazados (lotes 1 a 4) | 72 | $899,216 |
| **Receta con el mismo nombre, sin enlace → este lote** | **23** | **$49,549** |
| Sin receta en Costeo | 41 | $20,534 |

Carlo, 2026-10-29: «Si mete los skus a las que ya están listas».

## Los 23 enlaces

`36-lote-5.csv`: código → receta, con el nombre observado y la evidencia.

- **Con venta en la muestra de la API (15):** SHCO, MISICEDAPP, FSOD2, FSOD4, TRUGOUAPP, FOCJASAPP, FOCJAMAPP, BRICE, 1CDV60, 1CDV60M, MATLEMAPP, TRUMISAPP, COFTUPAPP, TRWCROAPP y COMILTAPP.
- **Sin venta en la muestra (8):** SINSHOAPP, 1DRR, 2PF, KOAMANAPP, 4TW2FOOD2, EVIGLAAPP, FEMIWAAPP y LATNUTAPP. Su evidencia es el catálogo del portal.
- **Nombre observado:** el que manda la API cuando hubo ventas (el catálogo de Sucursales lo usa para reconocer las líneas de la App sin código). Por eso MISICEDAPP lleva el doble espacio de la API. Si no hubo ventas, se usa el nombre del portal.
- **Mismo nombre que la receta.** Solo cambian mayúsculas o espacios en COFTUPAPP («Coffee bag»), MISICEDAPP y 4TW2FOOD2 («Pain au»).
- **Fuera de este lote:**
  - ZOEWATAPP y ZOETWIAPP (decisión N1/N2);
  - los 41 productos sin receta (Pan de Muerto, Cookie Matcha, Espresso Tonic, Spooky Biscuit, la línea Brunch, entre otros).

**Tamaños.** El enlace es identidad código → receta; no verifica tamaños. `verificar-enlaces.ts` marca:
- combos que llegan con vaso y tienen receta Único;
- Cold Drip V60 sin vaso con receta Chica + Grande;
- SHCO y las Fresh Soda con tamaño mixto en la API.

El costeo de Sucursales deja esas líneas en **parcial** hasta verificar su tamaño (`TAMANOS_VERIFICADOS`), así que no se costean con un tamaño supuesto.

## Cargador y garantías

Mismo cargador de los lotes 1 a 4 (`enlaces-pos.ts`), sin cambios de lógica. Solo se agregó `lote-5` a `LOTES_APROBADOS` (manifiesto `a42fb8a7…`) y a `DOC_LOTE` (doc 36).

- Requiere el lote 4 y, por él, los lotes 1 a 3: los 72 enlaces actuales deben seguir intactos antes y después.
- Recetas bloqueadas y verificadas: existen, son producto, están activas y tienen el nombre esperado.
- Una transacción REPEATABLE READ.
- Bitácora exacta: un registro por alta.
- Huellas sin cambios: recetas, precios, líneas, cantidades e insumos.
- Reversión por `carga_id`.

## Verificación local

**Pruebas:** `tests/db/lotes-aprobados.test.ts` comprueba el lote 5 real: 23 códigos, previos 1 a 4 con 72 enlaces, nombres, evidencia del portal y exclusiones. 26 pruebas en verde con las de enlaces.

**Ensayo sobre una copia del respaldo `2026-10-28T2001Z`.** La copia tenía los mismos 72 enlaces que producción y se borró al terminar.

| Paso | Resultado |
|---|---|
| Ensayo | 23 altas, 23 registros propios y 0 ajenos; previos 57/5/8/2 intactos; ROLLBACK (siguen 72) |
| Cargar | 23 altas; COMMIT; **95 enlaces** |
| Repetir | 23 «sin cambio», 0 registros |
| Revertir | 23 bajas de esa carga; vuelve a 72 con los previos intactos |

Los informes contienen el UUID del perfil y se guardan fuera del repo.

## Procedimiento remoto (cada paso requiere aprobación)

1. Respaldo lógico verificado por restauración.
2. Ensayo remoto, que termina en ROLLBACK:
   `npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --lote lote-5 --usuario <uuid-perfil>`
3. Carga:
   `… --lote lote-5 --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
4. Verificar con una conexión nueva y repetir el ensayo, que debe dar 23 «sin cambio».
5. Revertir, solo con aprobación:
   `… --lote lote-5 --revertir --carga <carga_id> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
