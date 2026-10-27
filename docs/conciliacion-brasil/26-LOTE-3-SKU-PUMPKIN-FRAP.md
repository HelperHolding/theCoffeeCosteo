# 26 · Lote 3 de códigos POS: Pumpkin y Frap (preparado, sin cargar)

**Estado (2026-10-27): preparado, ensayado en local y con dry-run remoto (ROLLBACK) verificado; sin carga.**
- **Producción:** no se cargó nada.
- **Al cargar:** pasaría de **62 a 70 enlaces** sin cambiar recetas, nombres, precios ni costos.
- **Integración:** se apila sobre el PR #26, que tiene el cargador por manifiesto con el que se cargó el lote 2. El diff muestra solo el lote 3.

## Correspondencias (revalidadas)

Son las 8 recetas renombradas al literal del POS en el PR #34 (`nombres-pos-lote-1`, aplicado el 2026-10-27). El nombre observado en el POS es hoy el nombre vigente de cada receta.

| Código | Receta (UUID) | Nombre POS = Costeo | Líneas | Tamaño (POS → Costeo) | Precio 532 |
|---|---|---|---|---|---|
| `CPUMICAPP` | `38847fe5-2d6f-4050-9fd7-aa94bb3d4024` | Pumpkin Iced Latte | 428 | Regular+Large → Chica+Grande | 99=99 · 109=109 |
| `CPUMLAAPP` | `170be377-ff76-4bbc-b6d5-85cd9708b21c` | Pumpkin Latte | 349 | Regular+Large → Chica+Grande | 99=99 · 109=109 |
| `CPUMFRAPP` | `7769fb2e-d7ac-46b6-abeb-e23634d40bd5` | Pumpkin Spice Frap | 124 | Regular+Large → Chica+Grande | 99=99 · 109=109 |
| `SALFRAAPP` | `052a61f6-55ff-4ac8-9459-ab4939789420` | Salted Caramel Frap | 101 | Regular+Large → Chica+Grande | 89=89 · 99=99 |
| `FRATARAPP` | `817fe3be-7d8b-49be-8e1a-6acde12ccb1c` | Taro Frap | 80 | Regular+Large → Chica+Grande | 89=89 · 99=99 |
| `COFFRAAPP` | `ad75d625-2fef-4ce3-8a3f-1e3c049ebbcf` | Coffee Frap | 59 | Regular+Large → Chica+Grande | 89=89 · 99=99 |
| `FRAMATAPP` | `bb72c7a6-d900-4d47-bf56-4a74654ccf4b` | Matcha Frap | 46 | Regular+Large → Chica+Grande | 89=89 · 99=99 |
| `FRACHAAPP` | `a00da002-92a3-4a48-ab47-b62ee9aa6a13` | Chai Frap | 42 | Regular+Large → Chica+Grande | 89=89 · **Grande no confirmado** (sin venta comparable en 532) |

**Revalidación** (2026-10-27):
- **Inventario:** se leyó uno nuevo de producción en solo lectura.
- **Verificador:** el mismo de los lotes 1 y 2 (`verificar-enlaces.ts`), con los cinco criterios: código, nombre, contexto, variante y tamaño. Usa la misma muestra auditada del POS: 532, 583 y 612, del 2026-09-21 al 2026-10-18.
- **Los 8 pasan:**
  - cada código llega con un solo nombre, idéntico al de la receta;
  - no hay otra variante en Costeo;
  - el tamaño es coherente;
  - el precio de 532 coincide donde hay evidencia.
- **Resultado del verificador:** 71 códigos pasan. Son los 62 ya enlazados, estos 8 y `BRICE`, que sigue fuera por C3.

**Fuera de este lote:**
- Zoé: `ZOEWATAPP` (N1) y `ZOETWIAPP` (N2);
- `BRICE`, por el duplicado Brownie (C3);
- `4UC` (C1), `5IL` (C6) y los demás duplicados;
- los códigos que esperan decisiones de tamaño (E2–E5).

## Cargador (el de PR #26, sin cambios de lógica)

Se reutiliza `enlaces-pos.ts` con manifiesto fijado:
- **Lote registrado:** `lote-3` en `LOTES_APROBADOS`, con el manifiesto `26-lote-3.manifiesto.json` (sha256 `0ffe5640…37d2`).
- **Archivo del lote:** `26-lote-3.csv` (8 filas, sha256 `8ca0732f…21f4`), con las correspondencias exactas código → receta.
- **Dependencias:** el lote 3 requiere el lote 2, que a su vez requiere el lote 1. Antes y después de cada ejecución, **los 62 enlaces actuales tienen que estar idénticos**; si no, no se carga nada. El lote nuevo no puede repetir códigos ni recetas de esos lotes.
- **Garantías del cargador (ya existentes):**
  - perfil obligatorio también en el ensayo, que queda en `creado_por` y en la bitácora;
  - REPEATABLE READ y bloqueo de la tabla de enlaces y de las recetas;
  - la receta debe conservar el nombre esperado;
  - huellas de recetas, precios, líneas, cantidades e insumos;
  - un registro de bitácora por alta, con la nota de la carga;
  - idempotencia;
  - reversión por `carga_id` que solo borra las filas de esa carga;
  - cierre verificado.

**Cambios de código en este PR:**
- se registra `lote-3`;
- la carpeta de informes y la nota de bitácora salen de `DOC_LOTE` (17 / 20 / 26), en lugar de quedar fijas en 17 o 20;
- la CLI exige `--lote` explícito para aplicar o revertir.

## Pruebas y ensayo local

**Pruebas:**
- `tests/db/lotes-aprobados.test.ts` incluye el lote 3 real:
  - son los 8 códigos con sus nombres vigentes, y el nombre observado es igual al de la receta;
  - requiere los lotes 1 y 2 (62 enlaces);
  - excluye `BRICE`, Zoé, `4UC` y `5IL`;
  - la evidencia de Chai Frap marca el Grande como no confirmado.
- BD completa en esta rama: **180/180**; `tsc` sin errores.

**Ensayo local** en una copia aislada del respaldo verificado `2026-10-27T0000Z`, eliminada al terminar. Antes se aplicó el renombre del PR #34 para reproducir producción.

| Paso | Resultado |
|---|---|
| Ensayo (ROLLBACK) | 8 altas, 0 problemas; lote 1 57/57 y lote 2 5/5 intactos antes y después; quedan 62 enlaces |
| Carga | **70 enlaces a 70 recetas**; las 8 filas nuevas con su `carga_id` y autoría, y 8 registros en la bitácora (`producto_codigo_pos`). **Iguales:** recetas (nombres incluidos), costos y márgenes de `v_resumen`, alertas, precios, precios manuales, líneas, cantidades, insumos y los 62 enlaces previos |
| Repetir | 8 «sin cambio» |
| Revertir la carga | 8 bajas; vuelve a 62 y todo queda idéntico |

## Procedimiento propuesto (cada paso con su autorización)

1. Respaldo lógico verificado por restauración.
2. Revalidación en solo lectura:
   - las 8 recetas con el UUID y el nombre del lote;
   - ninguno de los 8 códigos cargado;
   - 62 enlaces intactos;
   - perfil activo.
3. Ensayo remoto: `npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --lote lote-3 --usuario <uuid>`.
4. Carga: `--lote lote-3 --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>`.
5. Verificación desde una conexión nueva:
   - 70 enlaces;
   - los 62 previos idénticos;
   - recetas, precios y costos sin cambio;
   - segundo ensayo con 8 «sin cambio».
6. Reversión, solo con aprobación: `--lote lote-3 --revertir --carga <carga_id>`.

**Antes de integrar:** este PR depende del #26. Se integra después de él, cambiando su base a `main`.

## Dry-run remoto (2026-10-27, 00:24 UTC; autorizado por Carlo, sin carga)

| Paso | Resultado |
|---|---|
| **Respaldo lógico `2026-10-27T0022Z`** | Restaurado en una copia local aislada y comparado con producción: 19,652 filas idénticas; solo difiere `vault.secrets` (0 filas). Políticas, funciones, membresías, secuencias y `v_resumen` bajo RLS idénticas |
| **Revalidación** (solo lectura) | Las 8 recetas activas, con el UUID y el nombre del lote. Ninguno de los 8 códigos estaba cargado y ninguna de esas recetas tenía enlace. Los 62 enlaces, idénticos a los del cierre del renombre. Perfil admin activo; bitácora 435 (máx. 547); migración 22 |
| **Dry-run con ROLLBACK** (rama `1d71e2d`) | 8 altas, 0 problemas. Dentro de la transacción: 62 → **70** enlaces; lote 1 57/57 y lote 2 5/5 intactos antes y después; 8 registros propios en la bitácora (ids 548–555) y 0 ajenos; sin cambios comerciales |
| **Verificación** (conexión nueva) | Siguen **exactamente los 62 enlaces originales** (huella idéntica), sin ninguno de los 8 códigos. **No persistió bitácora**: 435 registros, máx. 547; los ids 548–555 los consumió la secuencia durante el ROLLBACK. Sin cambios en recetas, costos, márgenes, alertas, precios, líneas, cantidades ni insumos. **Última migración: la 22** |

**Dependencia entre PRs.** Este PR (#35) se apila sobre el #26, que tiene el cargador por manifiesto con el que se cargó el lote 2, y depende de él. La carga del lote 3 se ejecutaría desde esta rama, como se hizo con el lote 2. Para integrar:
1. Merge del #26.
2. Cambiar la base del #35 a `main` y revisar que su diff solo contenga el lote 3.
3. Merge del #35.

Ninguno de los dos contiene migraciones.
