# 23 · H2: hielo en gramos, línea por línea (diseño y pruebas locales; sin aprobar)

**Estado (2026-10-26): diseño, borrador y pruebas locales.**
- **No aprobado:** `LOTES_HIELO_APROBADOS` está vacío y el manifiesto es un borrador.
- **Producción:** no se escribió nada. Las lecturas solo sirvieron para generar el borrador.
- **Ensayos:** solo en copias locales del respaldo verificado `2159Z`, que se eliminaron al terminar.

**Independencia.** H2 es independiente del lote 3b (doc 24): tiene su propio manifiesto y sus propias pruebas, y se aprueba por separado. El orden entre los dos está en el §4.

Contexto y alternativas H0–H3: [22](22-PROPUESTA-FRESH-SODAS-HIELO-AGUA.md) §2.

## 1. Alcance: 27 líneas reasignadas, 14 intactas

H2 **solo reasigna 27 líneas verificadas** (53 celdas, 27 recetas) del insumo `HIELO` al insumo `HIELO (g)`.

**Qué significa «verificada»:** todas las celdas de la línea coinciden con los gramos de una ficha del PDF, según `22-usos-hielo.csv`. El generador se detiene si alguna cantidad del CSV no coincide con producción.

**Las otras 14 líneas (26 celdas) quedan intactas en `HIELO`.** No se modifican ni su insumo, ni sus cantidades, ni su versión:

| Motivo | Recetas |
|---|---|
| Sin ficha en el PDF | 4 combos con panadería, Gelato Frappé Chocolate y Horchai, Lemon Honey Coffee, Nutty Iced Latte (3 registros) |
| La ficha no tiene ese tamaño | Cold Drip V60 y V60 + Milk (Grande 310/300) |
| Difiere del PDF (lote 3a) | Fresh Soda Pink Lemonade y Passion fruit (Grande 190/177 frente a 245 g) |

El script verifica en cada ejecución que el número de líneas en `HIELO` fuera del manifiesto no cambie.

**No hay conversión.** Las cantidades se mantienen idénticas. Si una línea no tiene exactamente las cantidades del manifiesto en cada tamaño, se detiene.

**Sin cambio global de unidad:** `HIELO` sigue en ml, con su costo y su estado.

## 2. El insumo `HIELO (g)`: costo y presentación son supuestos, no datos validados

- **Proveedor y categoría:** los mismos de `HIELO`; es una clasificación, no un dato de compra.
- **Costo de paquete y presentación:** **declarados en el manifiesto** como supuesto explícito: $0 y 1 g. El campo `supuesto`, obligatorio, lo explica.
  - **El $0 no confirma que el hielo sea gratuito.** Solo replica el costo actual de `HIELO`, para que ningún costo cambie.
  - **La presentación de 1 g no es una presentación de compra validada.** Ya **no se copia** la presentación en ml del origen como si estuviera validada en gramos.
  - Los datos reales dependen de Compras: pregunta 7 del doc 22 §6.
- **Ningún costo cambia:** el script exige que el costo unitario del destino sea igual al del origen. Si no, se detiene antes de crear nada. Ningún costo de compra se modifica.

## 3. Auditoría, verificación y reversión

| Aspecto | Diseño |
|---|---|
| **Auditoría** | El trigger `receta_lineas_bitacora` registra cada cambio con `tabla = receta_lineas`, `campo = insumo_id`, valores anterior y nuevo, receta, autor y `carga_masiva`. El alta del destino deja 1 registro en `insumos`. A todos se les pone la nota `hielo-gramos-lote-N, ejecución <uuid> (docs/conciliacion-brasil/23)`. Cualquier otro registro propio aborta |
| **Bloqueos** | REPEATABLE READ. `FOR UPDATE` sobre el insumo origen, las recetas (en orden fijo) y las líneas. **Versión esperada por receta:** el control de versión no se elimina |
| **Verificación antes del COMMIT** | No cambian: la huella de `v_costo_producto` de **todos** los productos, `linea_cantidades` completa, precios, precios manuales, enlaces POS, el resto de insumos, de líneas y de recetas, ni los campos de las recetas del lote salvo su versión. La versión sube exactamente +1 por línea |
| **Idempotencia** | Una línea que ya está en el destino con las mismas cantidades da «sin cambio»: sin registros y sin cambio de versión |
| **Reversión** | Exige `--ejecucion`. **Restaura las líneas** de esa ejecución si siguen en el destino y sus recetas no tienen registros posteriores |
| **Objeto residual** | La reversión **no borra** `HIELO (g)`. Si queda sin uso, el informe lo declara en `residuos` como **objeto residual**, no como parte de la restauración. Borrarlo requiere una aprobación aparte |

**Código:**
- `scripts/conciliacion/hielo-unidad.ts`: `separarLineas`, `validarManifiestoHielo`, `leerLoteHielo`, `migrarHielo` y `regenerarVersiones`.
- `scripts/conciliacion/hielo-unidad-regenerar.ts`: CLI de regeneración, solo lectura.
- **La CLI de aplicación no existe todavía.** Se agrega solo con la aprobación de un lote.

## 4. Orden con el lote 3b y regeneración del manifiesto

Cold brew está en los dos borradores: su línea de hielo en H2 y su agua en 3b. **Orden definido: 3b → H2.**

1. Se aplica 3b, con su propia aprobación. Cold brew pasa de v30 a v33.
2. El borrador de H2 queda desactualizado: el control de versión lo detiene, **sin tocar nada**.
3. Se **regenera** el manifiesto de H2 contra la versión vigente, en una transacción de solo lectura:

   ```
   npx tsx scripts/conciliacion/hielo-unidad-regenerar.ts --manifiesto docs/conciliacion-brasil/23-hielo-gramos-lote-1.manifiesto.json --salida <nuevo.json>
   ```

   - **Qué cambia:** solo `version`, y la nota de aprobación pasa a «BORRADOR regenerado…».
   - **Cuándo se niega:** si una línea dejó de existir, cambió de receta o de insumo, o sus cantidades no son las del manifiesto. Esos casos exigen una revisión completa, no una regeneración.
   - **Qué no hace:** no registra nada como aprobado ni escribe en la base.
4. Se **revisa el diff** del manifiesto regenerado y solo entonces se aprueba y registra su huella.

**Efecto en la reversión de 3b.** Una vez que H2 toca Cold brew, aunque H2 se revierta, el script ya no revierte 3b, porque hay registros posteriores (doc 24 §5). La alternativa es sacar Cold brew de este lote de H2.

## 5. Pruebas (`tests/db/hielo-unidad.test.ts`, PGlite): 14/14

**Selección y manifiesto**
- `separarLineas` conserva entera una línea con al menos una celda sin verificar: V60, Fresh Soda y recetas sin ficha.
- **Borrador real:**
  - 27 líneas y 53 celdas, sin Fresh Sodas, V60 ni recetas sin ficha;
  - destino $0 / 1 g con su supuesto («NO confirma que el hielo sea gratuito», «no es una presentación de compra validada»);
  - marcado BORRADOR, con `LOTES_HIELO_APROBADOS` vacío.
- **Manifiestos inválidos:** destino en ml o con el mismo nombre, sin supuesto, presentación 0, línea repetida, cantidad 0, página faltante o tamaño repetido. `leerLoteHielo` exige la huella exacta.

**Migración**
- **Perfil obligatorio**, también en el ensayo.
- **Ensayo:** crea el destino, cambia las líneas y deja 3 registros (alta + 2 líneas). La versión sube +1, y costos y resto quedan idénticos; con el ROLLBACK no queda nada.
- **Aplicar:**
  - cantidades y costos de todos los productos idénticos;
  - el origen sigue en ml; el destino queda en gr con costo $0;
  - la línea no verificada sigue en `HIELO` con su versión;
  - la bitácora registra el alta y el cambio de `insumo_id`;
  - repetir da «sin cambio».
- Un segundo lote reutiliza el destino.
- **No convierte:** una cantidad distinta, una versión distinta o la línea de otro insumo detienen todo.
- **No cambia costos:** un destino con otro costo unitario se detiene sin crearlo. También se detiene un destino existente distinto al declarado o un origen alterado.
- **Cambio concurrente:** un precio que cambia durante la ejecución provoca ROLLBACK.
- **Reversión:** exige la ejecución y restaura las líneas. **Declara el destino sin uso como residuo** y se niega si hubo ediciones posteriores.

**Orden entre lotes**
- Tras subir la versión desde otro lote, el manifiesto viejo se detiene.
- La regeneración no escribe nada y su diff solo cambia la versión afectada; el manifiesto regenerado pasa.
- Si cambió la línea de hielo, la regeneración se niega.

BD completa en esta rama: **195/195**; `tsc` sin errores.

## 6. Ensayo local del orden 3b → H2 (copia de `2159Z`, eliminada al terminar)

Primero se aplicó el lote 2 en la copia, para que quedara igual que producción: Cold brew v30.

| Paso | Resultado |
|---|---|
| H2 con el borrador, antes de 3b (ensayo) | 27 cambiadas, 28 registros, costos y resto idénticos |
| Aplicar 3b | COMMIT; Cold brew v30 → v33 |
| H2 con el borrador viejo | **Detenido:** «versión 33, el manifiesto espera 30», sin tocar nada |
| Regenerar (CLI, `--local`) | `versionesNuevas: Cold brew 30 → 33`. Diff: solo esa versión y la nota de aprobación |
| H2 regenerado: ensayo y aplicación | 27 cambiadas, 28 registros; `HIELO` 14 + `HIELO (g)` 27; huellas idénticas de `v_resumen`, alertas, cantidades, líneas del resto, precios y enlaces |
| Revertir H2 | 27 líneas restauradas. **Residuo declarado:** `HIELO (g)` sin uso (gr, $0, 1). Los insumos, sin contar el residuo, son idénticos |
| Revertir 3b después | **Se niega:** «Hubo 2 cambio(s) posterior(es) en la receta» (§4) |

## 7. Para aprobar después

1. Aprobar el alta de `HIELO (g)` con su supuesto de costo y presentación.
2. Si 3b va primero, regenerar el manifiesto y revisar el diff.
3. Aprobar la huella del manifiesto y registrarla.
4. Agregar la CLI de aplicación.
5. Respaldo verificado.
6. Dry-run remoto con ROLLBACK.
7. Aplicación.
8. Verificación desde una conexión nueva y segundo ensayo.

Los lotes 3a, 3c, 3d y 3e siguen pendientes (doc 22 §5 y §6).
