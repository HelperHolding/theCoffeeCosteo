# 32 · Categorías de insumo desde la lista de materia prima de Zoho

**Estado:** ✅ **aplicado el 2026-10-28 (00:57 UTC) y verificado.** Ejecución `34eea212-ef54-4360-83e7-1b1e98f72180`, bitácora **#865–870**; segundo ensayo con 6 «sin cambio». Ver el §5. El ensayo remoto y la aplicación contaron con la aprobación expresa de Carlo. No se cargó nada en Zoho.

**Contexto:** Carlo pidió que la categoría de cada insumo de la «Lista de Precios Materia Prima Marzo 2026» de Zoho quede en nuestra base, por lote y sin corrección manual.

**Cotejo de los 158 insumos de la lista contra los nuestros:**
- **154 iguales** en nombre, costo, presentación, unidad, proveedor y categoría. Zoho y nuestra base usan la misma clasificación: INGREDIENTES, PANADERIA, INSUMOS, MERCH, PERECEDEROS, etc.
- **Categoría:** las únicas diferencias son las 4 bases de frappé (Zoho: INGREDIENTES; nuestra: INSUMOS).
- **Nombres, costo y presentación:**
  - 6 nombres distintos (las bases, el portavasos y la Evian 300 = 330 ml);
  - Traditional Cookie ($22.49 en Zoho, $18 nuestra);
  - agua y hielo con presentación 0 en Zoho y 1 en nuestra.
  - Se corrigen en el archivo para Zoho a favor de nuestra base.

- Manifiesto: `32-insumos-categorias-zoho-lote-1.manifiesto.json`, sha256 `f047577a…`.
- Script: `scripts/conciliacion/insumos-catalogo.ts`.
- CLI: `insumos-catalogo-aplicar.ts`.
- Pruebas: `tests/db/insumos-catalogo.test.ts`.

## 1. Cambios

| Insumo | Campo | Antes | Después | Motivo |
|---|---|---|---|---|
| BASE NEUTRA PARA FRAPPÉ 1 KG | categoría | INSUMOS | **INGREDIENTES** | Zoho |
| BASE CHAI PARA FRAPPÉ 1 KG | categoría | INSUMOS | **INGREDIENTES** | Zoho |
| BASE MATCHA LATTE PARA FRAPPÉ 1 KG | categoría | INSUMOS | **INGREDIENTES** | Zoho |
| BASE TARO/COCO PARA FRAPPÉ 1 KG | categoría | INSUMOS | **INGREDIENTES** | Zoho |
| Chobani D.Creamer Pumpkin S pice | categoría | POR ASIGNAR | **INSUMOS** | Duplicado sin uso de «CHOBANI D.CREAMER PUMPKIN SPICE»; queda igual que su gemelo |
| Chobani D.Creamer Pumpkin S pice | proveedor | POR ASIGNAR | **CEDIS** | Igual que su gemelo |

No cambia ningún costo, presentación, unidad ni nombre.

El creamer duplicado no se usa en ninguna receta: los 3 Pumpkin usan el otro. Unificarlos o desactivarlo (pregunta K5) es una decisión aparte.

## 2. Garantías

- **Lote aprobado:** la huella del manifiesto está fijada.
- **Perfil obligatorio** de compras o admin, también en el ensayo.
- **Una sola transacción** REPEATABLE READ, con los insumos bloqueados (FOR UPDATE).
- **Bloqueo optimista** sobre el valor previo de cada campo. Si todo ya está aplicado, el resultado es «sin cambio».
- **Bitácora exacta:** un registro por cambio, con origen `carga_masiva`, el autor y la nota de la ejecución.
- **Huellas idénticas** del resto de insumos y de los demás campos de estos, de recetas, líneas, cantidades, tamaños, precios, enlaces y catálogos, y de los costos de productos y subrecetas.
- **Reversión por id de ejecución:** se niega si esos insumos tienen cambios posteriores.

## 3. Verificación

**Pruebas (PGlite):** 7 en total. Cubren:
- el lote real y manifiestos inválidos;
- el perfil;
- un ensayo que no deja nada;
- la aplicación con bitácora, y la repetición «sin cambio»;
- el bloqueo optimista;
- la reversión y su negativa ante ediciones posteriores.

**Ensayo local** sobre una copia del respaldo `0040Z`, borrada al terminar:

| Paso | Resultado |
|---|---|
| Ensayo | 6 cambios y 6 registros de bitácora; costos y resto sin cambios; ROLLBACK |
| Aplicar | COMMIT |
| Repetir | «sin cambio» |
| Revertir | insumos, costos y recetas con md5 idéntico al respaldo |

**Ensayo remoto (2026-10-28 00:54 UTC):**
- El respaldo `0040Z` seguía vigente: insumos y bitácora idénticos a producción.
- 6 cambios, 6 registros propios (#859–864) y 0 ajenos; costos y resto sin cambios; ROLLBACK.
- Una conexión nueva confirmó que no persistió nada.

## 4. Aplicar (requiere aprobación)

```
npx tsx scripts/conciliacion/insumos-catalogo-aplicar.ts --lote insumos-categorias-zoho-lote-1 --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
```

Después: verificar con una conexión nueva y repetir el ensayo, que debe dar 6 «sin cambio».

La reversión es por id de ejecución: `--revertir --ejecucion <uuid>`.

## 5. Cierre: aplicado el 2026-10-28 (00:57 UTC) y verificado

Se ejecutó solo `insumos-categorias-zoho-lote-1`, desde el código de este PR en `a114e8a` y con el manifiesto `f047577a…`. Carlo aprobó expresamente aplicarlo. Hubo un solo COMMIT, sin reintentos.

| Paso | Resultado |
|---|---|
| **Respaldo `0040Z`** | Justo antes de aplicar seguía vigente: insumos, recetas y bitácora idénticos a producción |
| **Ensayo remoto** (00:54 UTC, ROLLBACK) | 6 cambios, 6 registros propios y 0 ajenos; costos y resto sin cambios (§3) |
| **Aplicación** | **COMMIT**, ejecución `34eea212-ef54-4360-83e7-1b1e98f72180`, confirmado desde una conexión nueva |
| **Segundo ensayo** | 6 «sin cambio», **0 registros nuevos**, ROLLBACK |

### Los 6 cambios aplicados

| Bitácora | Insumo | Cambio |
|---|---|---|
| #865 | BASE NEUTRA PARA FRAPPÉ 1 KG | categoría INSUMOS → **INGREDIENTES** |
| #866 | BASE CHAI PARA FRAPPÉ 1 KG | categoría INSUMOS → **INGREDIENTES** |
| #867 | BASE MATCHA LATTE PARA FRAPPÉ 1 KG | categoría INSUMOS → **INGREDIENTES** |
| #868 | BASE TARO/COCO PARA FRAPPÉ 1 KG | categoría INSUMOS → **INGREDIENTES** |
| #869 | Chobani D.Creamer Pumpkin S pice | categoría POR ASIGNAR → **INSUMOS** |
| #870 | Chobani D.Creamer Pumpkin S pice | proveedor POR ASIGNAR → **CEDIS** |

- **Bitácora:** los 6 registros son `carga_masiva`, con autor Carlo y la nota `insumos-categorias-zoho-lote-1, ejecución 34eea212-… (docs/conciliacion-brasil/32)`. Queda en 506 filas (id máx. 870).

### Lo que quedó intacto (huellas antes y después)

- Costos: `v_costo_producto` (215 filas) y `v_costo_subreceta` (6 filas).
- Recetas (160), líneas (890), cantidades (1,199), tamaños (215) y precios manuales (83).
- Los **72 enlaces POS**, las 15 categorías, los 12 proveedores y las 23 migraciones.
- De los 165 insumos solo cambiaron esos 6 campos; ningún costo, presentación, unidad ni nombre.

Justo después se aplicó `altas-zoho-lote-1` (doc 31), que no toca insumos.

### Reversión (solo con aprobación expresa)

```
npx tsx scripts/conciliacion/insumos-catalogo-aplicar.ts --lote insumos-categorias-zoho-lote-1 --revertir --ejecucion 34eea212-ef54-4360-83e7-1b1e98f72180 --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
```

Se niega si esos insumos tienen registros posteriores al #870.

Los informes de cada ejecución y las huellas se guardan **fuera del repo**, porque contienen el UUID del perfil, junto con el respaldo `0040Z`.
