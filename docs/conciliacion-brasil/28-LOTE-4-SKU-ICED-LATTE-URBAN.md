# 28 · Lote 4 de códigos POS: Iced Latte y Urban Chocolate (preparado, sin cargar)

**Estado (2026-10-27): preparado y ensayado en una copia local. No se cargó nada en producción.**
- **Al cargar:** pasaría de **70 a 72 enlaces**, sin cambiar recetas, nombres, precios ni costos.
- **Duplicados:** no se desactiva ninguno.
- **Aprobación:** Carlo aprobó preparar el lote (doc 27, K2 para `5IL` y `4UC`). Cargarlo requiere otra autorización.

## Correspondencias (revalidadas)

| Código | Receta (UUID) | Nombre POS = Costeo | Líneas | Tamaño (POS → Costeo) | Precio 532 |
|---|---|---|---|---|---|
| `5IL` | `fcf0d45d-76b2-48a4-8d96-d8abc228eca8` | Iced Latte | 697 | Regular+Large → Chica+Grande | 70=70 · 80=80 |
| `4UC` | `2c8b49a6-7b2f-489e-8932-1d1ff8c7754c` | Urban Chocolate | 104 | Regular+Large → Chica+Grande | 78=78 · 88=88 |

**Revalidación** (2026-10-27): inventario nuevo de producción, en solo lectura, y `verificar-enlaces.ts` con la muestra auditada del POS.
- Código, nombre exacto, contexto, tamaño coherente y precio en los dos tamaños: **OK**.
- **Variante:** el verificador la marca «ambigua» por los duplicados. Se resuelve con evidencia (consultada en solo lectura):

| Duplicado | Estado en producción | Por qué no es el producto del POS |
|---|---|---|
| Iced Latte Large (`7b5b57b7…`) | Activo, sin enlace. Precio solo en Chica ($70). **Sin cantidades en Chica** (costo $0) | El POS cobra $80 en Large, y solo Iced Latte tiene ese precio y la receta completa en los dos tamaños |
| Urban Chocolat (`77aed410…`) | Activo, sin enlace. Precio solo en Chica ($78) | El POS cobra $88 en Large, y solo Urban Chocolate lo tiene. Además, su receta se corrigió con el PDF (lote 2 del recetario) |

**Desactivar los duplicados es aparte** (C1 y C6 del doc 16): cambia los agregados del tablero.

## Cargador (sin cambios de lógica)

- **Archivo:** `28-lote-4.csv` (2 filas, sha256 `eef84b36…252e`).
- **Manifiesto:** `28-lote-4.manifiesto.json`, registrado en `LOTES_APROBADOS` (sha256 `9df970ac…cbd4`).
- **Dependencias:** requiere `lote-3`, y por él los lotes 2 y 1. **Los 70 enlaces actuales tienen que estar idénticos** antes y después de cada ejecución; si no, no se carga nada.
- **Documentación:** `DOC_LOTE` asigna el doc 28 a los informes y a la nota de bitácora.
- **Garantías que se mantienen:**
  - perfil obligatorio y autoría;
  - REPEATABLE READ y bloqueos;
  - huellas comerciales;
  - un registro de bitácora por alta;
  - idempotencia;
  - reversión por `carga_id`;
  - cierre verificado;
  - `--lote` explícito para aplicar o revertir.

## Pruebas y ensayo local

**Pruebas:**
- `tests/db/lotes-aprobados.test.ts` incluye el lote 4 real:
  - solo `5IL` y `4UC`, con sus UUID;
  - requiere los lotes 1–3 (70 enlaces);
  - ningún duplicado ni código excluido (`BRICE`, Zoé, `SHCO`, `MISICEDAPP`);
  - aprobación sin carga ni desactivación.
- BD completa: **219/219**; `tsc` sin errores.

**Ensayo local** en una copia aislada del respaldo verificado `2026-10-27T0022Z`. Antes se cargó el lote 3 para reproducir los 70 enlaces de producción. La copia se eliminó al terminar.

| Paso | Resultado |
|---|---|
| Ensayo (ROLLBACK) | 2 altas; lotes 1 (57/57), 2 (5/5) y 3 (8/8) intactos antes y después; quedan 70 |
| Carga | **72 enlaces a 72 recetas.** `4UC` → Urban Chocolate y `5IL` → Iced Latte, con `carga_id` y autoría, y 2 registros en la bitácora. **Iguales:** recetas, costos y márgenes, alertas, precios, líneas, cantidades, insumos y los 70 previos. Iced Latte Large y Urban Chocolat siguen **activos y sin enlace** |
| Repetir | 2 «sin cambio» |
| Revertir la carga | 2 bajas; vuelve a 70 y todo queda idéntico |

## Procedimiento propuesto (cada paso con su autorización)

1. Respaldo lógico verificado por restauración.
2. Revalidación en solo lectura:
   - los 2 códigos sin cargar;
   - las recetas con el UUID y el nombre del lote;
   - los 70 enlaces intactos;
   - perfil activo.
3. Ensayo remoto: `--lote lote-4 --usuario <uuid-perfil>`.
4. Carga: `--lote lote-4 --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`.
5. Verificación desde una conexión nueva:
   - 72 enlaces;
   - los 70 previos idénticos;
   - duplicados intactos;
   - segundo ensayo con 2 «sin cambio».
6. Reversión, solo con aprobación: `--lote lote-4 --revertir --carga <carga_id>`.

**Cobertura esperada:** de 84.1% a **91.9%** de la venta identificable sin GENERIC, o de 82.6% a 90.2% de la venta total (doc 27 §2.1).
