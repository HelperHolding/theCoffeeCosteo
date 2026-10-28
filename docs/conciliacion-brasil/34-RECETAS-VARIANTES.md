# 34 · Mug y Félix Schorle: una taza y una botella

**Estado:** preparado el 2026-10-28, con manifiestos, pruebas y ensayo local. **Sin ensayo remoto y sin aplicar.** Cada paso remoto requiere aprobación expresa de Carlo.

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
