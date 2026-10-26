# 23 · H2: hielo en gramos, línea por línea

**Estado (2026-10-26): lote 1 aprobado por Carlo; Cold brew queda fuera.** El cierre de la aplicación está en el §8.

**Independencia del lote 3b (doc 24).** Al excluir Cold brew, H2 y 3b no comparten ninguna receta. Cada uno tiene su propio manifiesto, sus pruebas, su ejecución y su reversión, y el orden de aplicación no afecta al otro.

Contexto y alternativas H0–H3: [22](22-PROPUESTA-FRESH-SODAS-HIELO-AGUA.md) §2.

## 1. Alcance aprobado: 26 líneas incluidas, 15 pendientes

**Hay 41 líneas de `HIELO` en 41 recetas, con 79 celdas.** Se recalcularon contra producción el 2026-10-26, en una lectura de solo lectura.

| | Líneas | Celdas | Recetas |
|---|---|---|---|
| **Incluidas en el lote 1** (pasan a `HIELO (g)`) | **26** | **51** | 26 |
| **Pendientes, intactas en `HIELO`** | **15** | **28** | 15 |
| Total | 41 | 79 | 41 |

**Qué significa «verificada»:** todas las celdas de la línea coinciden con los gramos de una ficha del PDF, según `22-usos-hielo.csv`. El generador se detiene si alguna cantidad del CSV no coincide con producción.

**Las 15 líneas pendientes quedan intactas.** No cambia su insumo, ni sus cantidades, ni su versión:

| Motivo | Líneas | Recetas |
|---|---|---|
| **Excluida por decisión de Carlo** | 1 | Cold brew (130/245; verificada, pero fuera de alcance) |
| Sin ficha en el PDF | 10 | 4 combos con panadería, Gelato Frappé Chocolate y Horchai, Lemon Honey Coffee, Nutty Iced Latte (3 registros) |
| La ficha no tiene ese tamaño | 2 | Cold Drip V60 y V60 + Milk (Grande 310/300) |
| Difiere del PDF (lote 3a, Fresh Sodas) | 2 | Fresh Soda Pink Lemonade y Passion fruit (Grande 190/177 frente a 245 g) |

En cada ejecución, el script verifica que el número de líneas en `HIELO` fuera del manifiesto no cambie.

**Sin conversión y sin cambio global de unidad.**
- Las cantidades se mantienen idénticas. Si una línea no tiene exactamente las cantidades del manifiesto en cada tamaño, el script se detiene.
- `HIELO` sigue en ml, con su costo y su estado.

## 2. `HIELO (g)`: el costo de compra del hielo está sin confirmar

- **Proveedor y categoría:** los mismos de `HIELO`. Son una clasificación, no un dato de compra.
- **Costo de paquete y presentación:** **declarados en el manifiesto** como supuesto explícito: $0 y 1 g. El campo `supuesto`, obligatorio, lo explica.
  - **El $0 no confirma que el hielo sea gratuito.** Solo replica el costo actual de `HIELO`, para que ningún costo cambie. **El costo de compra del hielo sigue sin confirmar.**
  - **La presentación de 1 g no es una presentación de compra validada.** No se copia la presentación en ml del origen.
  - Los datos reales dependen de Compras: pregunta 7 del doc 22 §6.
- **Ningún costo cambia:** el script exige que el costo unitario del destino sea igual al del origen. Si no, se detiene antes de crear nada.

## 3. Auditoría, verificación y reversión

| Aspecto | Diseño |
|---|---|
| **Auditoría** | El trigger `receta_lineas_bitacora` registra cada cambio con `tabla = receta_lineas`, `campo = insumo_id`, valores anterior y nuevo, receta, autor y `carga_masiva`. El alta del destino deja 1 registro en `insumos`. Todos llevan la nota `hielo-gramos-lote-1, ejecución <uuid> (docs/conciliacion-brasil/23)`. Cualquier otro registro propio aborta |
| **Bloqueos** | REPEATABLE READ. `FOR UPDATE` sobre el insumo origen, las recetas (en orden fijo) y las líneas. Versión esperada por receta |
| **Verificación antes del COMMIT** | No cambian: la huella de `v_costo_producto` de **todos** los productos, `linea_cantidades` completa, precios, precios manuales, enlaces POS, el resto de insumos, de líneas y de recetas, ni los campos de las recetas del lote salvo su versión. La versión sube exactamente +1 por línea |
| **Idempotencia** | Una línea que ya está en el destino con las mismas cantidades da «sin cambio»: sin registros y sin cambio de versión |
| **Reversión** | Exige `--ejecucion`. Restaura las líneas de esa ejecución si siguen en el destino y sus recetas no tienen registros posteriores |
| **Objeto residual** | La reversión **no borra** `HIELO (g)`. Si queda sin uso, el informe lo declara en `residuos` como objeto residual, no como restauración. Borrarlo requiere una aprobación aparte |

**Código:**
- `scripts/conciliacion/hielo-unidad.ts`: `separarLineas`, `validarManifiestoHielo`, `leerLoteHielo`, `migrarHielo`, `regenerarVersiones` y `LOTES_HIELO_APROBADOS` (lote 1).
- `scripts/conciliacion/hielo-unidad-aplicar.ts`: CLI de ensayo, aplicación y reversión. Pide `--lote`, `--usuario` y `--confirmo`, y deja un informe por ejecución.
- `scripts/conciliacion/hielo-unidad-regenerar.ts`: CLI de regeneración de versiones, en solo lectura.

## 4. Regeneración de versiones (herramienta de seguridad)

Ya no hace falta un orden entre H2 y 3b, porque no comparten recetas. Aun así, si otro cambio sube la versión de alguna receta del manifiesto, el control de versión detiene H2 sin tocar nada. Para regenerar:

```
npx tsx scripts/conciliacion/hielo-unidad-regenerar.ts --manifiesto docs/conciliacion-brasil/23-hielo-gramos-lote-1.manifiesto.json --salida <nuevo.json>
```

- **Qué hace:** solo actualiza `version`.
- **Cuándo se niega:** si una línea dejó de existir, cambió de receta o de insumo, o sus cantidades difieren. En esos casos hace falta una revisión completa.
- **Qué no hace:** no escribe en la base ni aprueba nada. El diff se revisa antes de registrar una huella nueva.

## 5. Pruebas (`tests/db/hielo-unidad.test.ts`, PGlite): 14/14

**Selección y manifiesto**
- `separarLineas` conserva entera una línea que tenga al menos una celda sin verificar.
- **Lote aprobado:**
  - 26 líneas, 26 recetas y 51 celdas, sin Cold brew, Fresh Sodas, V60 ni recetas sin ficha;
  - destino $0 / 1 g, con su supuesto;
  - nota de aprobación con el alcance;
  - registrado en `LOTES_HIELO_APROBADOS` con su huella; `leerLoteHielo` lo devuelve idéntico y rechaza un lote no registrado.
- **Manifiestos inválidos y huella:** se rechaza un destino en ml o con el mismo nombre, sin supuesto o con presentación 0; también una línea repetida, una cantidad 0, una página faltante o un tamaño repetido. Una huella alterada también se rechaza.

**Migración**
- **Perfil:** obligatorio.
- **Ensayo:** no deja nada.
- **Aplicar:**
  - las cantidades y los costos quedan idénticos;
  - el origen no cambia;
  - la línea no verificada queda intacta;
  - la bitácora registra el alta y el cambio de `insumo_id`;
  - repetir da «sin cambio».
- **Segundo lote:** reutiliza el destino.
- **Paradas:** no convierte cantidades ni cambia costos; un cambio concurrente provoca ROLLBACK.
- **Reversión:** restaura las líneas, declara el residuo y se niega si hubo ediciones posteriores.
- **Regeneración:** el manifiesto viejo se detiene por versión; el regenerado solo cambia versiones y pasa; la regeneración se niega si cambió la línea de hielo.

BD completa en esta rama: **195/195**; `tsc` sin errores.

## 6. Ensayos locales previos (copias de `2159Z`, eliminadas al terminar)

- **Con 27 líneas (antes de excluir Cold brew):** 27 cambiadas, 28 registros, `HIELO` 14 + `HIELO (g)` 27. Las huellas de `v_resumen`, alertas, cantidades, precios y enlaces quedaron idénticas. La reversión restauró las líneas y dejó `HIELO (g)` como residuo declarado.
- **Ese ensayo motivó la exclusión de Cold brew:** después de que H2 tocara Cold brew, 3b ya no se podía revertir con su script (doc 24 §5). Al excluirlo, cada lote conserva su reversión directa.

## 7. Lo que sigue pendiente

- **15 líneas de `HIELO`** (§1).
- **Costo y presentación de compra del hielo:** pregunta 7 del doc 22 §6.
- **Lotes 3a, 3c, 3d y 3e:** doc 22 §5 y §6.
