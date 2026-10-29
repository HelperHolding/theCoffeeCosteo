# 38 · Lote 6: códigos POS de los 3 combos nuevos

**Estado:** preparado el 2026-10-29, con manifiesto, prueba, respaldo verificado, ensayo local y **ensayo remoto con ROLLBACK limpio**. **Sin cargar.** Cada paso remoto requiere aprobación expresa de Carlo.

## Qué enlaza

Los 3 combos creados en producción el 2026-10-29 con `altas-combos-lote-1` (doc 37). Cada código POS apunta a su receta.

| Código POS | Receta (nombre exacto del POS) | Tamaño |
|---|---|---|
| 2VLT3FOOD3 | Vanilla Latte + Pain au Chocolat | Único |
| BAGMUGAPP | Coffee bag 250g + Mug | Único |
| CHALEMAPP | Chai Latte + Lemon Cake | Único |

**De dónde salen los datos:**
- **Códigos:** catálogo del portal del POS (menú «MEX - A», id 16), leído en solo lectura el 2026-10-29. El default code del portal es el `defaultCode` de la API.
- **Venta:** hoy no tienen venta en ninguna de las 119 sucursales (API del 15 al 28 de octubre). El enlace queda listo para que Sucursales los costee en cuanto se vendan.
- **Recetas:** antes de preparar el lote se leyó producción. Las 3 existen, son productos activos, y ningún código ni receta estaba enlazado; había 95 enlaces.

**Lote:** `lote-6`, con el cargador de siempre (`enlaces-pos.ts`):
- CSV `38-lote-6.csv`, sha256 `3d542c3a…`;
- manifiesto `38-lote-6.manifiesto.json`, sha256 `c98468ab…`, fijado en `LOTES_APROBADOS`;
- requiere el lote 5 y, por él, los lotes 1–4: los 95 enlaces actuales deben seguir intactos antes y después.

## Verificación local

**Prueba:** `tests/db/lotes-aprobados.test.ts` comprueba los códigos, que el nombre observado sea igual al de la receta, la evidencia y los 95 enlaces previos. En total pasan 27 pruebas, entre lotes y cargador.

**Respaldo `2026-10-29T1659Z`**, tomado después de crear los combos:
- restaurado sin errores fuera de `vault`;
- 21,698 filas, iguales a producción;
- `analytics_ventas_diarias` y `perfil_modulos`, comparadas fila por fila en UTC: idénticas.

**Ensayo sobre una copia del respaldo**, borrada al terminar:

| Paso | Resultado |
|---|---|
| Ensayo | 3 altas, 0 problemas; 95 previos intactos; 3 registros propios en la bitácora y 0 ajenos; datos comerciales sin cambios; ROLLBACK |
| Aplicar | COMMIT; 95 → 98 enlaces |
| Repetir | 3 «sin cambio», 0 registros |
| Revertir por carga | 3 bajas; vuelve a 95 |

Los informes se guardaron fuera del repo, en el respaldo privado.

## Ensayo remoto (2026-10-29 17:04 UTC, aprobado por Carlo)

**Antes de correrlo:**
- Producción no había cambiado desde el respaldo `1659`: 95 enlaces, 168 productos y bitácora hasta #1341.
- La conexión directa a Supabase funciona.
- Las migraciones aplicadas en producción son las mismas 27 del repo (hasta `20261028000027`).

| Resultado | Valor |
|---|---|
| Altas | 3, con 0 problemas |
| Lotes 1–5 | 95 enlaces intactos antes y después |
| Bitácora | 3 registros propios, 0 ajenos |
| Datos comerciales | sin cambios |
| Transacción | ROLLBACK; con una conexión nueva siguen 95 enlaces y bitácora #1341 |

El informe se guardó fuera del repo, en el respaldo privado.

## Procedimiento remoto (cada paso requiere aprobación)

1. ~~Ensayo remoto con ROLLBACK~~ (hecho, limpio):
   `npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --lote lote-6 --usuario <uuid-perfil>`
2. Cargar:
   `… --lote lote-6 --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
3. Verificar con una conexión nueva y repetir el ensayo, que debe dar «sin cambio».
