# 34 · Mug y Félix Schorle: una taza y una botella

**Estado:** ✅ **aplicado el 2026-10-28 (20:07 UTC) y verificado.** Mug: ejecución `e7e497c7-d4b7-4725-a8ec-5cf60001993b`, bitácora **#1130**, $254 → $127. Félix Schorle: ejecución `9628a5da-2904-423c-a67a-fd570cfd2338`, bitácora **#1131**, $70 → $35. El segundo ensayo dio «sin cambio». Ver «Cierre». El ensayo remoto y la aplicación contaron con la aprobación expresa de Carlo.

**Problema** (encontrado en el doc 33): dos recetas suman las dos variantes que el cliente elige, cuando se vende una.

| Receta | Hoy | Costo hoy | Se vende |
|---|---|---|---|
| Mug (v6) | COFFEE MUG 300 ML BLACK 1 + WHITE 1 ($127 c/u) | $254 | una taza: opción «Mug Black» o «Mug White» |
| Félix Schorle (v7) | FELIX SCHORLE FRAMBUESA 1 + MARACUYA 1 ($35 c/u) | $70 | una botella: opción «Raspberry Jalisco» o «Veracruz Passion Fruit» |

## Corrección

Una celda por receta, de 1 a 0, con el cargador de correcciones dirigidas (`recetas-correcciones.ts`, el de los docs 21 y 24). Queda la variante más vendida en el periodo del doc 33; las dos cuestan lo mismo, así que el costo queda bien con cualquiera.

| Lote | Celda | Costo |
|---|---|---|
| `recetas-variantes-mug` | COFFEE MUG 300 ML BLACK, Único: 1 → **0** (queda WHITE) | $254 → **$127** |
| `recetas-variantes-felix` | FELIX SCHORLE MARACUYA, Único: 1 → **0** (queda FRAMBUESA) | $70 → **$35** |

- La línea en 0 se queda en la receta, como el agua del Iced Chocolate (doc 29). Si se prefiere, se puede borrar después desde el portal.
- No cambia ningún insumo, precio, enlace POS ni otra receta.
- Si los precios de las dos variantes llegaran a ser distintos, el costo reflejaría la que quedó.

**Manifiestos:**
- `34-recetas-variantes-mug.manifiesto.json`, sha256 `5cb8a71d…`;
- `34-recetas-variantes-felix.manifiesto.json`, sha256 `9d0b0175…`.

Las huellas están fijadas en `LOTES_RECETAS_APROBADOS`.

## Garantías (las del cargador)

- Perfil obligatorio, también en el ensayo.
- Una transacción REPEATABLE READ.
- Bloqueo optimista: versión exacta de la receta (v6 y v7) y valor previo 1.
- Bitácora exacta: un registro `carga_masiva` por celda, con autor y la nota de la ejecución.
- Huellas del resto sin cambios.
- Repetir da «sin cambio».
- Reversión por id de ejecución; se niega si hubo ediciones posteriores de la receta.

## Verificación local

**Pruebas (PGlite):** 15 en total, 2 nuevas:
- los manifiestos reales (receta, versión, celda y huella);
- con la forma de Mug: el costo baja de $254 a $127, repetir no cambia nada y la reversión es exacta.

**Ensayo sobre una copia del respaldo `0040Z`.** Mug v6 a $254 y Félix v7 a $70, igual que producción el 2026-10-28. La copia se borró al terminar.

| Paso | Mug | Félix Schorle |
|---|---|---|
| Ensayo | 1 cambiada, 1 registro propio y 0 ajenos; ROLLBACK | igual |
| Aplicar | COMMIT; v6 → v7; **$127** | COMMIT; v7 → v8; **$35** |
| Repetir | «sin cambio», 0 registros | igual |
| Revertir | 1 revertida; $254 | 1 revertida; $70 |

Tras revertir, todas las cantidades tienen la misma huella md5 que el respaldo. Los informes contienen el UUID del perfil y se guardan fuera del repo.

## Respaldo y ensayo remoto (2026-10-28, autorizados por Carlo)

Se ejecutó solo el ensayo, desde el código de este PR en `9b6fe2c`. **No se aplicó nada.**

| Paso | Resultado |
|---|---|
| **Respaldo lógico `2026-10-28T2001Z`** | Restaurado en una copia local aislada y comparado con producción: 21,467 filas. Políticas, funciones, membresías, secuencias y `v_resumen` bajo RLS, idénticas. `vault.secrets` no se restaura (0 filas en producción). En `analytics_ventas_diarias` y `perfil_modulos` el md5 de texto difiere, pero las filas son idénticas al compararlas completas: es el formato de fechas por zona horaria y el orden del texto |
| **Vigencia del respaldo** | Justo antes del ensayo, producción y la copia coincidían: bitácora 763 filas (id máx. 1127), y las mismas huellas de cantidades (1,323) y de versiones de recetas (171) |
| **Revalidación** (solo lectura) | Mug v6, BLACK 1 + WHITE 1, $254; Félix Schorle v7, FRAMBUESA 1 + MARACUYA 1, $70. Perfil admin activo |
| **Ensayo `recetas-variantes-mug`** | 1 cambiada (BLACK 1 → 0), 1 registro propio y 0 ajenos, resto sin cambios, v6 → v7 dentro de la transacción; **ROLLBACK** |
| **Ensayo `recetas-variantes-felix`** | 1 cambiada (MARACUYA 1 → 0), 1 registro propio y 0 ajenos, resto sin cambios, v7 → v8 dentro de la transacción; **ROLLBACK** |
| **Conexión nueva después** | Recetas, cantidades, costos y bitácora idénticos a antes: Mug sigue en v6 y $254, Félix en v7 y $70. La secuencia de la bitácora avanzó por las transacciones deshechas, como es normal en Postgres |

Los informes y el respaldo contienen el UUID del perfil y datos personales; se guardan fuera del repo.

## Procedimiento remoto (cada paso requiere aprobación)

1. Respaldo lógico verificado por restauración.
2. Revalidación en solo lectura: Mug v6 y Félix v7, con las cantidades y costos de arriba.
3. Ensayo remoto, que termina en ROLLBACK:
   `npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --lote recetas-variantes-mug --usuario <uuid-perfil>`
   (y lo mismo con `--lote recetas-variantes-felix`).
4. Aplicar:
   `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
5. Verificar con una conexión nueva y repetir el ensayo, que debe dar «sin cambio».
6. Revertir, solo con aprobación:
   `… --revertir --ejecucion <uuid> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`

## Cierre: aplicado el 2026-10-28 (20:07 UTC) y verificado

Carlo autorizó aplicar únicamente `recetas-variantes-mug` y `recetas-variantes-felix`, ensayados con el código de este PR (`9b6fe2c`; después solo cambió este documento). Hubo un COMMIT por lote, sin reintentos.

| Paso | Resultado |
|---|---|
| **Vigencia del respaldo** | Justo antes de aplicar, producción coincidía con el respaldo `2026-10-28T2001Z`: bitácora 763 (id máx. 1127) y las mismas huellas de cantidades y versiones de recetas |
| **Aplicar Mug** | **COMMIT**, ejecución `e7e497c7-d4b7-4725-a8ec-5cf60001993b`: COFFEE MUG 300 ML BLACK 1 → 0, bitácora #1130, v6 → v7 |
| **Aplicar Félix Schorle** | **COMMIT**, ejecución `9628a5da-2904-423c-a67a-fd570cfd2338`: FELIX SCHORLE MARACUYA 1 → 0, bitácora #1131, v7 → v8 |
| **Verificación** (conexión nueva) | Mug: WHITE 1, BLACK 0, **$127**. Félix: FRAMBUESA 1, MARACUYA 0, **$35** |
| **Segundo ensayo** | Los dos «sin cambio», 0 registros nuevos, ROLLBACK. Cantidades y versiones idénticas después |

- **Bitácora:** los 2 registros son `carga_masiva`, con autor Carlo, campo `cantidad` 1 → 0. Queda en 765 filas (id máx. 1131). La nota dice `… (docs/conciliacion-brasil/21)` porque el cargador fija ese doc en la nota; la ejecución identifica el lote.
- **Intacto** (huellas antes y después): costos de las otras 231 combinaciones de producto y tamaño, insumos, precios de lista, precios manuales y los 72 enlaces POS.

### Reversión (solo con aprobación expresa)

```
npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --lote recetas-variantes-mug --revertir --ejecucion e7e497c7-d4b7-4725-a8ec-5cf60001993b --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --lote recetas-variantes-felix --revertir --ejecucion 9628a5da-2904-423c-a67a-fd570cfd2338 --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
```

Se niega si la receta tiene registros posteriores en la bitácora. Los informes, las huellas y el respaldo se guardan **fuera del repo**, porque contienen el UUID del perfil y datos personales.
